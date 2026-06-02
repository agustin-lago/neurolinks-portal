import { NextResponse } from "next/server";
import { MercadoPagoConfig, Preference } from "mercadopago";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // 1. Fetch current client settings
    const { data: cliente } = await supabase
      .from("clientes")
      .select("id, plan_tipo, lineas_cantidad, plan, abono, vendedor_id")
      .eq("auth_user_id", user.id)
      .single();

    if (!cliente) return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });

    // Dynamic Sandbox Redirect: Binds the customer ID as external_reference to your custom test plan
    const mainToken = process.env.MP_ACCESS_TOKEN || "";
    if (mainToken.startsWith("TEST-")) {
      console.log("[Crear Pago] Running in SANDBOX/TEST mode. Instantly redirecting to custom test subscription link.");
      const testPlanId = "22efa35a74c941cfbc4e84bb6a2dd306";
      const initPoint = `https://www.mercadopago.com/subscriptions/checkout?preapproval_plan_id=${testPlanId}&external_reference=${cliente.id}`;
      return NextResponse.json({ init_point: initPoint });
    }

    const adminDb = createAdminClient();
    let vendedorId = cliente.vendedor_id;

    // 2. Load Balance Assignment (Round-Robin fallback) if vendedor is not yet assigned
    if (!vendedorId) {
      const { data: sellers } = await adminDb
        .from("mp_vendedores")
        .select("id");

      if (sellers && sellers.length > 0) {
        // Query client counts for all connected sellers
        const sellersCount = await Promise.all(
          sellers.map(async (v) => {
            const { count } = await adminDb
              .from("clientes")
              .select("id", { count: "exact", head: true })
              .eq("vendedor_id", v.id);
            return { id: v.id, count: count || 0 };
          })
        );

        // Sort sellers by minimum assigned clients
        sellersCount.sort((a, b) => a.count - b.count);
        vendedorId = sellersCount[0].id;

        // Assign this balanced seller to the client
        await supabase
          .from("clientes")
          .update({ vendedor_id: vendedorId })
          .eq("id", cliente.id);
      }
    }

    // 3. If a seller is assigned, fetch their access token and search for pre-created subscription plan
    if (vendedorId) {
      const { data: vendedor } = await adminDb
        .from("mp_vendedores")
        .select("access_token, mp_user_id")
        .eq("id", vendedorId)
        .single();

      if (vendedor?.access_token) {
        // Search pre-created plans in the database
        const { data: plan } = await adminDb
          .from("mp_planes")
          .select("init_point")
          .eq("vendedor_id", vendedorId)
          .eq("plan_tipo", cliente.plan_tipo || "masivo_meta")
          .eq("lineas_cantidad", cliente.lineas_cantidad || 1)
          .single();

        if (plan?.init_point) {
          return NextResponse.json({ init_point: plan.init_point });
        }

        // Contingency fallback: If the specific plan doesn't exist, create it on-the-fly for this seller
        try {
          const planName = cliente.plan || "Plan Neurolinks";
          const abonoPrice = Number(cliente.abono) || 12000;
          const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

          const mpPlanRes = await fetch("https://api.mercadopago.com/preapproval_plan", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${vendedor.access_token}`,
            },
            body: JSON.stringify({
              reason: planName,
              auto_recurring: {
                frequency: 1,
                frequency_type: "months",
                transaction_amount: abonoPrice,
                currency_id: "ARS",
              },
              back_url: `${siteUrl}/portal/pago/exito`,
            }),
          });

          const mpPlanData = await mpPlanRes.json();
          if (mpPlanRes.ok && mpPlanData.id) {
            // Save newly created plan in database
            await adminDb.from("mp_planes").insert({
              vendedor_id: vendedorId,
              plan_tipo: cliente.plan_tipo || "masivo_meta",
              lineas_cantidad: cliente.lineas_cantidad || 1,
              mp_plan_id: mpPlanData.id,
              monto: abonoPrice,
              currency_id: "ARS",
              init_point: mpPlanData.init_point,
            });

            return NextResponse.json({ init_point: mpPlanData.init_point });
          }
        } catch (planCreateErr) {
          console.error("[Crear Pago] Dynamic plan creation failed:", planCreateErr);
        }
      }
    }

    // 4. Legacy Single-Token Fallback: If no sellers are connected, create a regular Mercado Pago Preapproval Subscription
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
    const price = Number(String(cliente.abono ?? "63000").replace(/[^0-9.]/g, "")) || 63000;

    const mpPreapprovalRes = await fetch("https://api.mercadopago.com/preapproval", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.MP_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        reason: cliente.plan ?? "Envíos Masivos - 1 Línea",
        auto_recurring: {
          frequency: 1,
          frequency_type: "months",
          transaction_amount: price,
          currency_id: "ARS",
        },
        payer_email: user.email || "test_user@clientesneurolinks.com",
        back_url: `${siteUrl}/portal/pago/exito`,
        external_reference: String(cliente.id),
      }),
    });

    const mpPreapprovalData = await mpPreapprovalRes.json();
    if (!mpPreapprovalRes.ok || !mpPreapprovalData.init_point) {
      console.error("[Crear Pago Fallback] MP Preapproval creation error:", mpPreapprovalData);
      throw new Error(mpPreapprovalData.message || "Error al generar la suscripción en el cobrador principal.");
    }

    return NextResponse.json({ init_point: mpPreapprovalData.init_point });
  } catch (error) {
    console.error("[Crear Pago] Critical Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

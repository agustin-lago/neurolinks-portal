import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const targetId = body?.id;

    let query = supabase
      .from("proyectos_railway")
      .select(`
        id, plan_tipo, lineas_cantidad, plan, abono,
        clientes!inner ( id, auth_user_id, vendedor_id )
      `)
      .eq("clientes.auth_user_id", user.id)
      .eq("is_deleted", false);

    if (targetId) {
      query = query.eq("id", targetId).single();
    } else {
      query = query.order("created_at", { ascending: false }).limit(1).single();
    }

    const { data: proyecto } = await query;
    if (!proyecto) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });

    const clienteId = proyecto.clientes.id;
    let vendedorId = proyecto.clientes.vendedor_id;
    const adminDb = createAdminClient();

    const mainToken = (process.env.MP_ACCESS_TOKEN || "").replace(/["']/g, "").trim();
    const isSandbox = mainToken.startsWith("APP_USR-34");

    if (isSandbox) {
      try {
        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
        const abonoPrice = Number(proyecto.abono) || 100;
        const mpPlanRes = await fetch("https://api.mercadopago.com/preapproval_plan", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${mainToken}` },
          body: JSON.stringify({
            reason: `Suscripcion Neurolinks - ${proyecto.plan || "Test"}`,
            auto_recurring: { frequency: 1, frequency_type: "months", transaction_amount: abonoPrice, currency_id: "ARS" },
            back_url: `${siteUrl}/portal/pago/exito`,
          }),
        });
        const mpPlanData = await mpPlanRes.json();
        if (mpPlanRes.ok && mpPlanData.init_point) {
          const initPoint = `${mpPlanData.init_point}&external_reference=${proyecto.id}`;
          return NextResponse.json({ init_point: initPoint });
        }
        throw new Error(mpPlanData.message || "Error al crear el plan dinamico en Sandbox.");
      } catch (sandboxPlanErr) {
        console.error("[Crear Pago Sandbox] Error:", sandboxPlanErr);
        return NextResponse.json({ error: sandboxPlanErr.message }, { status: 500 });
      }
    }

    if (!vendedorId) {
      const { data: sellers } = await adminDb.from("mp_vendedores").select("id");
      if (sellers && sellers.length > 0) {
        const sellersCount = await Promise.all(sellers.map(async (v) => {
          const { count } = await adminDb
            .from("clientes")
            .select("id", { count: "exact", head: true })
            .eq("vendedor_id", v.id);
          return { id: v.id, count: count || 0 };
        }));
        sellersCount.sort((a, b) => a.count - b.count);
        vendedorId = sellersCount[0].id;
        await supabase.from("clientes").update({ vendedor_id: vendedorId }).eq("id", clienteId);
      }
    }

    if (vendedorId) {
      const { data: vendedor } = await adminDb
        .from("mp_vendedores")
        .select("access_token, mp_user_id")
        .eq("id", vendedorId)
        .single();

      if (vendedor?.access_token) {
        const { data: plan } = await adminDb
          .from("mp_planes")
          .select("init_point")
          .eq("vendedor_id", vendedorId)
          .eq("plan_tipo", proyecto.plan_tipo || "masivo_meta")
          .eq("lineas_cantidad", proyecto.lineas_cantidad || 1)
          .single();

        if (plan?.init_point) {
          const initPoint = `${plan.init_point}${plan.init_point.includes("?") ? "&" : "?"}external_reference=${proyecto.id}`;
          return NextResponse.json({ init_point: initPoint });
        }

        try {
          const planName = proyecto.plan || "Plan Neurolinks";
          const abonoPrice = Number(proyecto.abono) || 12000;
          const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
          const mpPlanRes = await fetch("https://api.mercadopago.com/preapproval_plan", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${vendedor.access_token}` },
            body: JSON.stringify({
              reason: planName,
              auto_recurring: { frequency: 1, frequency_type: "months", transaction_amount: abonoPrice, currency_id: "ARS" },
              back_url: `${siteUrl}/portal/pago/exito`,
            }),
          });
          const mpPlanData = await mpPlanRes.json();
          if (mpPlanRes.ok && mpPlanData.id) {
            await adminDb.from("mp_planes").insert({
              vendedor_id: vendedorId,
              plan_tipo: proyecto.plan_tipo || "masivo_meta",
              lineas_cantidad: proyecto.lineas_cantidad || 1,
              mp_plan_id: mpPlanData.id,
              monto: abonoPrice,
              currency_id: "ARS",
              init_point: mpPlanData.init_point,
            });
            const initPoint = `${mpPlanData.init_point}${mpPlanData.init_point.includes("?") ? "&" : "?"}external_reference=${proyecto.id}`;
            return NextResponse.json({ init_point: initPoint });
          }
        } catch (planCreateErr) {
          console.error("[Crear Pago] Dynamic plan creation failed:", planCreateErr);
        }
      }
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
    const price = Number(String(proyecto.abono ?? "63000").replace(/[^0-9.]/g, "")) || 63000;
    const mpPreapprovalRes = await fetch("https://api.mercadopago.com/preapproval", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${process.env.MP_ACCESS_TOKEN}` },
      body: JSON.stringify({
        reason: proyecto.plan ?? "Standard + 1",
        auto_recurring: { frequency: 1, frequency_type: "months", transaction_amount: price, currency_id: "ARS" },
        payer_email: user.email || "test_user@clientesneurolinks.com",
        back_url: `${siteUrl}/portal/pago/exito`,
        external_reference: String(proyecto.id),
      }),
    });
    const mpPreapprovalData = await mpPreapprovalRes.json();
    if (!mpPreapprovalRes.ok || !mpPreapprovalData.init_point) {
      throw new Error(mpPreapprovalData.message || "Error al generar la suscripcion en el cobrador principal.");
    }
    return NextResponse.json({ init_point: mpPreapprovalData.init_point });
  } catch (error) {
    console.error("[Crear Pago] Critical Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

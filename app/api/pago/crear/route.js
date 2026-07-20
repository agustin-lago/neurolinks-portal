import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPlanDisplayName, normalizePlanTipo } from "@/lib/subscription";

export async function POST(request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const targetId = body?.id;

    let query = supabase
      .from("clientes")
      .select("id, auth_user_id, vendedor_id, plan_tipo, lineas_cantidad, plan, abono")
      .eq("auth_user_id", user.id)
      .eq("is_deleted", false);
    if (targetId) query = query.eq("id", targetId);
    const { data: cliente } = await query.order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (!cliente) return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
    if (!cliente.plan || !cliente.plan_tipo) return NextResponse.json({ error: "Primero selecciona un plan" }, { status: 400 });

    const clienteId = cliente.id;
    let vendedorId = cliente.vendedor_id;
    const adminDb = createAdminClient();
    const mainToken = (process.env.MP_ACCESS_TOKEN || "").replace(/["']/g, "").trim();
    const isSandbox = mainToken.startsWith("APP_USR-34");

    if (isSandbox) {
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
      const abonoPrice = Number(cliente.abono) || 100;
      const mpPlanRes = await fetch("https://api.mercadopago.com/preapproval_plan", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${mainToken}` },
        body: JSON.stringify({
          reason: `Suscripcion Neurolinks - ${cliente.plan || "Test"}`,
          auto_recurring: { frequency: 1, frequency_type: "months", transaction_amount: abonoPrice, currency_id: "ARS" },
          back_url: `${siteUrl}/portal/pago/exito`,
        }),
      });
      const mpPlanData = await mpPlanRes.json();
      if (mpPlanRes.ok && mpPlanData.init_point) {
        return NextResponse.json({ init_point: `${mpPlanData.init_point}&external_reference=${clienteId}` });
      }
      throw new Error(mpPlanData.message || "Error al crear el plan dinamico en Sandbox.");
    }

    if (!vendedorId) {
      const { data: sellers } = await adminDb.from("mp_vendedores").select("id");
      if (sellers && sellers.length > 0) {
        const sellersCount = await Promise.all(sellers.map(async (v) => {
          const { count } = await adminDb.from("clientes").select("id", { count: "exact", head: true }).eq("vendedor_id", v.id);
          return { id: v.id, count: count || 0 };
        }));
        sellersCount.sort((a, b) => a.count - b.count);
        vendedorId = sellersCount[0].id;
        await adminDb.from("clientes").update({ vendedor_id: vendedorId }).eq("id", clienteId);
      }
    }

    if (vendedorId) {
      const { data: vendedor } = await adminDb.from("mp_vendedores").select("access_token").eq("id", vendedorId).single();
      if (vendedor?.access_token) {
        const { data: plan } = await adminDb
          .from("mp_planes")
          .select("init_point")
          .eq("vendedor_id", vendedorId)
          .eq("plan_tipo", normalizePlanTipo(cliente.plan_tipo))
          .eq("lineas_cantidad", cliente.lineas_cantidad || 1)
          .single();

        if (plan?.init_point) {
          return NextResponse.json({ init_point: `${plan.init_point}${plan.init_point.includes("?") ? "&" : "?"}external_reference=${clienteId}` });
        }
      }
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
    const price = Number(String(cliente.abono ?? "63000").replace(/[^0-9.]/g, "")) || 63000;
    const mpPreapprovalRes = await fetch("https://api.mercadopago.com/preapproval", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${process.env.MP_ACCESS_TOKEN}` },
      body: JSON.stringify({
        reason: cliente.plan ?? getPlanDisplayName(cliente.plan_tipo, cliente.lineas_cantidad),
        auto_recurring: { frequency: 1, frequency_type: "months", transaction_amount: price, currency_id: "ARS" },
        payer_email: user.email || "test_user@clientesneurolinks.com",
        back_url: `${siteUrl}/portal/pago/exito`,
        external_reference: String(clienteId),
      }),
    });
    const mpPreapprovalData = await mpPreapprovalRes.json();
    if (!mpPreapprovalRes.ok || !mpPreapprovalData.init_point) throw new Error(mpPreapprovalData.message || "Error al generar la suscripcion.");
    return NextResponse.json({ init_point: mpPreapprovalData.init_point });
  } catch (error) {
    console.error("[Crear Pago] Critical Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPlanDisplayName, normalizePlanTipo } from "@/lib/subscription";

export async function POST(request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { plan_tipo, lineas_cantidad, id } = await request.json().catch(() => ({}));
    const selectedPlanTipo = normalizePlanTipo(plan_tipo);
    let selectedLines = Number(lineas_cantidad) || 1;
    if (selectedLines < 1) selectedLines = 1;
    if (selectedLines > 3) selectedLines = 3;

    let clientQuery = supabase
      .from("clientes")
      .select("id, auth_user_id")
      .eq("auth_user_id", user.id)
      .eq("is_deleted", false);
    if (id) clientQuery = clientQuery.eq("id", id);
    const { data: currentClient } = await clientQuery.order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (!currentClient) return NextResponse.json({ error: "Cliente no encontrado." }, { status: 404 });

    const { data: dbPlan } = await supabase
      .from("catalogo_planes")
      .select("nombre, precio")
      .eq("plan_tipo", selectedPlanTipo)
      .eq("lineas_cantidad", selectedLines)
      .eq("activo", true)
      .maybeSingle();

    const planConfig = dbPlan || {
      nombre: getPlanDisplayName(selectedPlanTipo, selectedLines),
      precio: selectedPlanTipo === "chatbot" ? 210000 * selectedLines : 63000 * selectedLines
    };

    const { data: updatedClient, error } = await supabase
      .from("clientes")
      .update({
        plan_tipo: selectedPlanTipo,
        lineas_cantidad: selectedLines,
        plan: planConfig.nombre,
        abono: planConfig.precio,
        subscription_status: "pending",
        subscription_source: "mercadopago",
        mp_preapproval_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", currentClient.id)
      .select("id, plan_tipo, lineas_cantidad, plan, abono, subscription_status")
      .single();

    if (error) throw error;
    return NextResponse.json({ success: true, client: updatedClient });
  } catch (error) {
    console.error("[Guardar Plan] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
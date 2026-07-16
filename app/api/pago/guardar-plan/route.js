import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";



export async function POST(request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { plan_tipo, lineas_cantidad, id } = await request.json().catch(() => ({}));

    // Default fallbacks
    const selectedPlanTipo = plan_tipo === "chatbot_ia" ? "chatbot_ia" : "masivo_meta";
    let selectedLines = Number(lineas_cantidad) || 1;
    if (selectedPlanTipo === "chatbot_ia") selectedLines = 1;
    if (selectedLines < 1) selectedLines = 1;
    if (selectedLines > 3) selectedLines = 3;

    // Fetch current subscription state to decide if we preserve existing tokens/URLs (same plan_tipo)
    let currentSubscription = null;
    if (id) {
      const { data } = await supabase
        .from("suscripciones_proyectos")
        .select("id, plan_tipo, tokens_backoffice, deployment_urls, token_backoffice, deployment_url, clientes!inner(auth_user_id)")
        .eq("id", id)
        .eq("clientes.auth_user_id", user.id)
        .single();
      currentSubscription = data;
    } else {
      const { data } = await supabase
        .from("suscripciones_proyectos")
        .select("id, plan_tipo, tokens_backoffice, deployment_urls, token_backoffice, deployment_url, clientes!inner(auth_user_id)")
        .eq("clientes.auth_user_id", user.id)
        .eq("is_deleted", false)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      currentSubscription = data;
    }

    const isSamePlanType = currentSubscription && currentSubscription.plan_tipo === selectedPlanTipo;
    const tokens = isSamePlanType ? (currentSubscription.tokens_backoffice || []) : [];
    const urls = isSamePlanType ? (currentSubscription.deployment_urls || []) : [];
    const tokenSingle = isSamePlanType ? currentSubscription.token_backoffice : null;
    const urlSingle = isSamePlanType ? currentSubscription.deployment_url : null;
    const targetSubscriptionId = currentSubscription ? currentSubscription.id : null;

    // Get pricing and plan name from DB
    const { data: dbPlan } = await supabase
      .from('catalogo_planes')
      .select('nombre, precio')
      .eq('plan_tipo', selectedPlanTipo)
      .eq('lineas_cantidad', selectedLines)
      .eq('activo', true)
      .maybeSingle();

    const planConfig = dbPlan || { nombre: 'Standard + 1', precio: 63000 };

    // Update targeted subscription row in DB
    let updateQuery = supabase
      .from("suscripciones_proyectos")
      .update({
        plan_tipo: selectedPlanTipo,
        lineas_cantidad: selectedLines,
        plan: planConfig.nombre,
        abono: planConfig.precio,
        backoffice_activado: false,
        deployment_url: urlSingle,
        deployment_urls: urls,
        tokens_backoffice: tokens,
        token_backoffice: tokenSingle,
        mp_preapproval_id: null,
        updated_at: new Date().toISOString(),
      });

    if (targetSubscriptionId) {
      updateQuery = updateQuery.eq("id", targetSubscriptionId);
    } else {
      // If we couldn't find a subscription, return error
      return NextResponse.json({ error: "Suscripción no encontrada." }, { status: 404 });
    }

    updateQuery = updateQuery.select("id, plan_tipo, lineas_cantidad, plan, abono").single();

    const { data: updatedClient, error } = await updateQuery;

    if (error) throw error;

    return NextResponse.json({ success: true, client: updatedClient });
  } catch (error) {
    console.error("[Guardar Plan] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const PLANS_PRICING = {
  masivo_meta: {
    1: { nombre: "Envíos Masivos - 1 Línea", precio: 63000 },
    2: { nombre: "Envíos Masivos - 2 Líneas", precio: 99000 },
    3: { nombre: "Envíos Masivos - 3 Líneas", precio: 120000 },
  },
  chatbot_ia: {
    1: { nombre: "Chatbot IA - Atención Clientes", precio: 210000 },
  }
};

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

    // Fetch current client state to decide if we preserve existing tokens/URLs (same plan_tipo)
    let currentClient = null;
    if (id) {
      const { data } = await supabase
        .from("clientes")
        .select("id, plan_tipo, tokens_backoffice, deployment_urls, token_backoffice, deployment_url")
        .eq("id", id)
        .single();
      currentClient = data;
    } else {
      const { data } = await supabase
        .from("clientes")
        .select("id, plan_tipo, tokens_backoffice, deployment_urls, token_backoffice, deployment_url")
        .eq("auth_user_id", user.id)
        .eq("is_deleted", false)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      currentClient = data;
    }

    const isSamePlanType = currentClient && currentClient.plan_tipo === selectedPlanTipo;
    const tokens = isSamePlanType ? (currentClient.tokens_backoffice || []) : [];
    const urls = isSamePlanType ? (currentClient.deployment_urls || []) : [];
    const tokenSingle = isSamePlanType ? currentClient.token_backoffice : null;
    const urlSingle = isSamePlanType ? currentClient.deployment_url : null;
    const targetClientId = currentClient ? currentClient.id : null;

    // Get pricing and plan name
    const planConfig = PLANS_PRICING[selectedPlanTipo][selectedLines] || PLANS_PRICING.masivo_meta[1];

    // Update targeted client row in DB
    let updateQuery = supabase
      .from("clientes")
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

    if (targetClientId) {
      updateQuery = updateQuery.eq("id", targetClientId);
    } else {
      updateQuery = updateQuery.eq("auth_user_id", user.id);
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

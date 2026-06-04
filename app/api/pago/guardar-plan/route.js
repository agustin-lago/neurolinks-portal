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
        deployment_url: null,
        deployment_urls: [],
        tokens_backoffice: [],
        token_backoffice: null,
        mp_preapproval_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq("auth_user_id", user.id);

    if (id) {
      updateQuery = updateQuery.eq("id", id).select("id, plan_tipo, lineas_cantidad, plan, abono").single();
    } else {
      // Fallback to first row
      const { data: firstClient } = await supabase
        .from("clientes")
        .select("id")
        .eq("auth_user_id", user.id)
        .limit(1)
        .single();
      
      if (firstClient) {
        updateQuery = updateQuery.eq("id", firstClient.id).select("id, plan_tipo, lineas_cantidad, plan, abono").single();
      } else {
        updateQuery = updateQuery.select("id, plan_tipo, lineas_cantidad, plan, abono").single();
      }
    }

    const { data: updatedClient, error } = await updateQuery;

    if (error) throw error;

    return NextResponse.json({ success: true, client: updatedClient });
  } catch (error) {
    console.error("[Guardar Plan] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

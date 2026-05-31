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

    const { plan_tipo, lineas_cantidad } = await request.json();

    // Default fallbacks
    const selectedPlanTipo = plan_tipo === "chatbot_ia" ? "chatbot_ia" : "masivo_meta";
    let selectedLines = Number(lineas_cantidad) || 1;
    if (selectedPlanTipo === "chatbot_ia") selectedLines = 1;
    if (selectedLines < 1) selectedLines = 1;
    if (selectedLines > 3) selectedLines = 3;

    // Get pricing and plan name
    const planConfig = PLANS_PRICING[selectedPlanTipo][selectedLines] || PLANS_PRICING.masivo_meta[1];

    // Update client row in DB
    const { data: updatedClient, error } = await supabase
      .from("clientes")
      .update({
        plan_tipo: selectedPlanTipo,
        lineas_cantidad: selectedLines,
        plan: planConfig.nombre,
        abono: planConfig.precio,
        updated_at: new Date().toISOString(),
      })
      .eq("auth_user_id", user.id)
      .select("id, plan_tipo, lineas_cantidad, plan, abono")
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, client: updatedClient });
  } catch (error) {
    console.error("[Guardar Plan] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

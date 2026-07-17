import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { plan_tipo, lineas_cantidad, id } = await request.json().catch(() => ({}));

    const selectedPlanTipo = plan_tipo === "chatbot_ia" ? "chatbot_ia" : "masivo_meta";
    let selectedLines = Number(lineas_cantidad) || 1;
    if (selectedPlanTipo === "chatbot_ia") selectedLines = 1;
    if (selectedLines < 1) selectedLines = 1;
    if (selectedLines > 3) selectedLines = 3;

    let currentProject = null;
    if (id) {
      const { data } = await supabase
        .from("proyectos_railway")
        .select("id, plan_tipo, railway_project_id, deployment_url, clientes!inner(auth_user_id)")
        .eq("id", id)
        .eq("clientes.auth_user_id", user.id)
        .single();
      currentProject = data;
    } else {
      const { data } = await supabase
        .from("proyectos_railway")
        .select("id, plan_tipo, railway_project_id, deployment_url, clientes!inner(auth_user_id)")
        .eq("clientes.auth_user_id", user.id)
        .eq("is_deleted", false)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      currentProject = data;
    }

    if (!currentProject) {
      return NextResponse.json({ error: "Proyecto no encontrado." }, { status: 404 });
    }

    const { data: dbPlan } = await supabase
      .from("catalogo_planes")
      .select("nombre, precio")
      .eq("plan_tipo", selectedPlanTipo)
      .eq("lineas_cantidad", selectedLines)
      .eq("activo", true)
      .maybeSingle();

    const planConfig = dbPlan || { nombre: "Standard + 1", precio: 63000 };

    const { data: updatedProject, error } = await supabase
      .from("proyectos_railway")
      .update({
        plan_tipo: selectedPlanTipo,
        lineas_cantidad: selectedLines,
        plan: planConfig.nombre,
        abono: planConfig.precio,
        backoffice_activado: false,
        mp_preapproval_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", currentProject.id)
      .select("id, plan_tipo, lineas_cantidad, plan, abono")
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, client: updatedProject });
  } catch (error) {
    console.error("[Guardar Plan] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

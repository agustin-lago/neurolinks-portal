import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { activateClientPortal } from "@/lib/railway";

export async function POST(request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { preapprovalId, id } = await request.json().catch(() => ({}));
    if (!preapprovalId) return NextResponse.json({ error: "preapprovalId es requerido" }, { status: 400 });

    let query = supabase
      .from("clientes")
      .select("id, auth_user_id, lineas_cantidad, subscription_status")
      .eq("auth_user_id", user.id);

    if (id) query = query.eq("id", id);

    const { data: cliente, error: clientError } = await query.single();
    if (clientError || !cliente) {
      return NextResponse.json({ error: "No se encontro un cliente valido para vincular." }, { status: 404 });
    }

    const now = new Date().toISOString();
    const { data: updatedClient, error: updateError } = await supabase
      .from("clientes")
      .update({
        mp_preapproval_id: String(preapprovalId),
        subscription_status: "active",
        subscription_source: "mercadopago",
        updated_at: now
      })
      .eq("id", cliente.id)
      .eq("auth_user_id", user.id)
      .select("id, lineas_cantidad")
      .single();

    if (updateError) {
      return NextResponse.json({ error: "Error al actualizar la suscripcion del cliente" }, { status: 500 });
    }

    const adminDb = createAdminClient();
    const { data: pendingProjects } = await adminDb
      .from("proyectos_railway")
      .select("id, backoffice_activado, deploy_in_progress, railway_project_id")
      .eq("cliente_id", updatedClient.id)
      .eq("is_deleted", false)
      .order("created_at", { ascending: true });

    const limit = Number(updatedClient.lineas_cantidad);
    const maxActivations = Number.isFinite(limit) && limit > 0 ? limit : pendingProjects?.length || 0;
    const projectsToActivate = (pendingProjects || [])
      .filter((project) => !project.backoffice_activado && !project.deploy_in_progress && !project.railway_project_id)
      .slice(0, maxActivations);

    for (const project of projectsToActivate) {
      activateClientPortal(project.id, adminDb)
        .then((res) => console.log(`[Vincular Suscripcion] Background activation completed for project ${project.id}:`, res))
        .catch((actErr) => console.error(`[Vincular Suscripcion] Background activation failed for project ${project.id}:`, actErr));
    }

    return NextResponse.json({ ok: true, clienteId: updatedClient.id, activationsStarted: projectsToActivate.length });
  } catch (err) {
    console.error("[Vincular Suscripcion] Critical error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

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

    let targetId = id;
    if (!targetId) {
      const { data: pendingProject } = await supabase
        .from("proyectos_railway")
        .select("id, clientes!inner(auth_user_id)")
        .eq("clientes.auth_user_id", user.id)
        .eq("is_deleted", false)
        .eq("backoffice_activado", false)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      targetId = pendingProject?.id;
    }

    if (!targetId) return NextResponse.json({ error: "No se encontro un proyecto valido para vincular." }, { status: 404 });

    const { data, error } = await supabase
      .from("proyectos_railway")
      .update({ mp_preapproval_id: String(preapprovalId), updated_at: new Date().toISOString() })
      .eq("id", targetId)
      .select("id, backoffice_activado")
      .single();

    if (error) return NextResponse.json({ error: "Error al actualizar la base de datos" }, { status: 500 });

    if (!data.backoffice_activado) {
      const adminDb = createAdminClient();
      activateClientPortal(data.id, adminDb)
        .then((res) => console.log(`[Vincular Suscripcion] Background activation completed for project ${data.id}:`, res))
        .catch((actErr) => console.error(`[Vincular Suscripcion] Background activation failed for project ${data.id}:`, actErr));
    }

    return NextResponse.json({ ok: true, clienteId: data.id });
  } catch (err) {
    console.error("[Vincular Suscripcion] Critical error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

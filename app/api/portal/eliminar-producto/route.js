import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { deleteRailwayProject } from "@/lib/railway";
import { deleteDnsRecords } from "@/lib/dns";

export async function POST(request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { id, forceDeleteActive } = await request.json().catch(() => ({}));
    if (!id) return NextResponse.json({ error: "Falta el ID del producto a eliminar" }, { status: 400 });

    const { data: proyecto, error: fetchError } = await supabase
      .from("proyectos_railway")
      .select("id, cliente_id, backoffice_activado, deploy_in_progress, railway_project_id, deployment_url, proyecto_slug, clientes!inner(auth_user_id)")
      .eq("id", id)
      .eq("clientes.auth_user_id", user.id)
      .single();

    if (fetchError || !proyecto) return NextResponse.json({ error: "Instancia no encontrada o no pertenece a tu usuario" }, { status: 404 });

    const isActiveOrDeploying = proyecto.backoffice_activado || proyecto.deploy_in_progress || Boolean(proyecto.railway_project_id);
    if (isActiveOrDeploying && !forceDeleteActive) {
      return NextResponse.json({ error: "Esta instancia esta activa o en proceso de despliegue. Confirma la eliminacion destructiva." }, { status: 400 });
    }

    const adminDb = createAdminClient();

    if (isActiveOrDeploying) {
      if (proyecto.railway_project_id) {
        try { await deleteRailwayProject(proyecto.railway_project_id); }
        catch (err) { console.error(`[Teardown] Error deleting project ${proyecto.railway_project_id}:`, err.message); }
      }

      if (proyecto.proyecto_slug) {
        const dnsFilters = [
          { name: proyecto.proyecto_slug, type: "CNAME" },
          { name: `_railway-verify.${proyecto.proyecto_slug}`, type: "TXT" }
        ];
        try { await deleteDnsRecords(dnsFilters); }
        catch (err) { console.error("[Teardown] Error deleting DNS records:", err.message); }
      }

      if (proyecto.railway_project_id) {
        const pid = proyecto.railway_project_id;
        await adminDb.from("settings").delete().eq("project_id", pid);
        await adminDb.from("whatsapp_sessions").delete().eq("project_id", pid);
        await adminDb.from("routing_table").delete().eq("project_id", pid);
        await adminDb.from("meta_onboarding").delete().eq("project_id", pid);
        await adminDb.from("chat_tags").delete().eq("project_id", pid);
        await adminDb.from("tags").delete().eq("project_id", pid);
        await adminDb.from("messages").delete().eq("project_id", pid);
        await adminDb.from("chats").delete().eq("project_id", pid);
        await adminDb.from("tickets").delete().eq("project_id", pid);
      }
    }

    const { error: deleteError } = await adminDb
      .from("proyectos_railway")
      .update({
        is_deleted: true,
        backoffice_activado: false,
        railway_project_id: null,
        deployment_url: null,
        railway_public_url: null,
        deploy_in_progress: false,
        updated_at: new Date().toISOString()
      })
      .eq("id", id);

    if (deleteError) throw new Error(deleteError.message || "Error al desactivar la instancia en la base de datos.");

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Teardown] Critical error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

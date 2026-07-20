import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { activateClientPortal } from "@/lib/railway";
import { getInstanceLimit, hasPortalAccess, isPersonalizado } from "@/lib/subscription";

export async function POST(request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { proyecto_slug, proyecto_nombre } = await request.json().catch(() => ({}));
    if (!proyecto_slug) return NextResponse.json({ error: "Falta el campo requerido (slug)" }, { status: 400 });

    const cleanSlug = proyecto_slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
    if (!cleanSlug || cleanSlug === "null" || cleanSlug === "undefined") return NextResponse.json({ error: "Slug de proyecto invalido" }, { status: 400 });

    const { count: slugExists } = await supabase
      .from("proyectos_railway")
      .select("id", { count: "exact", head: true })
      .eq("proyecto_slug", cleanSlug)
      .eq("is_deleted", false);
    if (slugExists > 0) return NextResponse.json({ error: `El slug "${cleanSlug}" ya esta registrado en Neurolinks. Elegi otro.` }, { status: 400 });

    const { data: client } = await supabase
      .from("clientes")
      .select("id, is_admin, plan, plan_tipo, lineas_cantidad, subscription_status, subscription_source, mp_preapproval_id")
      .eq("auth_user_id", user.id)
      .eq("is_deleted", false)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!client) return NextResponse.json({ error: "Cliente no encontrado." }, { status: 404 });
    if (!hasPortalAccess(client)) return NextResponse.json({ error: "Necesitas una suscripcion activa para crear instancias." }, { status: 403 });
    if (isPersonalizado(client)) return NextResponse.json({ error: "Tu plan personalizado requiere activacion manual por el equipo de Neurolinks." }, { status: 403 });

    const limit = getInstanceLimit(client);
    if (limit) {
      const { count } = await supabase
        .from("proyectos_railway")
        .select("id", { count: "exact", head: true })
        .eq("cliente_id", client.id)
        .eq("is_deleted", false);
      if ((count || 0) >= limit) return NextResponse.json({ error: `Ya usaste ${count}/${limit} instancias de tu plan.` }, { status: 400 });
    }

    const { data: newProject, error: projectErr } = await supabase
      .from("proyectos_railway")
      .insert({
        cliente_id: client.id,
        railway_project_id: null,
        nombre_personalizado: proyecto_nombre || cleanSlug,
        proyecto_slug: cleanSlug,
        backoffice_activado: false,
        deployment_url: null,
        railway_public_url: null,
        deploy_in_progress: false,
        is_deleted: false,
        source: "portal",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (projectErr) throw new Error("Error al insertar el proyecto en la base de datos.");

    const adminDb = createAdminClient();
    activateClientPortal(newProject.id, adminDb)
      .then((res) => console.log(`[Nuevo Producto] Background activation completed for project ${newProject.id}:`, res))
      .catch((actErr) => console.error(`[Nuevo Producto] Background activation failed for project ${newProject.id}:`, actErr));

    return NextResponse.json({ success: true, client: newProject });
  } catch (error) {
    console.error("[Nuevo Producto] Critical error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
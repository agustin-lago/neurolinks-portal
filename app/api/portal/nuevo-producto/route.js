import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { proyecto_slug, proyecto_nombre } = await request.json().catch(() => ({}));

    if (!proyecto_slug) {
      return NextResponse.json({ error: "Falta el campo requerido (slug)" }, { status: 400 });
    }

    const cleanSlug = proyecto_slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
    if (!cleanSlug || cleanSlug === "null" || cleanSlug === "undefined") {
      return NextResponse.json({ error: "Slug de proyecto invalido" }, { status: 400 });
    }

    const { count: slugExists } = await supabase
      .from("proyectos_railway")
      .select("id", { count: "exact", head: true })
      .eq("proyecto_slug", cleanSlug)
      .eq("is_deleted", false);

    if (slugExists > 0) {
      return NextResponse.json({ error: `El slug "${cleanSlug}" ya esta registrado en Neurolinks. Elegi otro.` }, { status: 400 });
    }

    const { data: existingClient } = await supabase
      .from("clientes")
      .select("id, is_admin")
      .eq("auth_user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    let clienteId;
    let isNewClientAdmin = false;

    if (existingClient) {
      clienteId = existingClient.id;
      isNewClientAdmin = existingClient.is_admin;
    } else {
      isNewClientAdmin = !!(
        user.email === "duskcodes.pereyrahugo@gmail.com" ||
        user.email === "neurolinksarg@gmail.com"
      );

      const { data: newClientData, error: clientErr } = await supabase
        .from("clientes")
        .insert({
          auth_user_id: user.id,
          email: user.email,
          nombre: user.user_metadata?.nombre || user.user_metadata?.full_name || user.user_metadata?.name || user.email.split("@")[0],
          telefono: user.user_metadata?.telefono ?? "",
          empresa: user.user_metadata?.empresa || "",
          is_admin: isNewClientAdmin,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (clientErr) throw new Error("Error al crear perfil de cliente en la base de datos.");
      clienteId = newClientData.id;
    }

    const selectedPlanTipo = "masivo_meta";
    const selectedLines = 1;

    const { data: dbPlan } = await supabase
      .from("catalogo_planes")
      .select("nombre, precio")
      .eq("plan_tipo", selectedPlanTipo)
      .eq("lineas_cantidad", selectedLines)
      .eq("activo", true)
      .maybeSingle();

    const planConfig = dbPlan || { nombre: "Standard + 1", precio: 63000 };

    const { data: newProject, error: projectErr } = await supabase
      .from("proyectos_railway")
      .insert({
        cliente_id: clienteId,
        railway_project_id: null,
        nombre_personalizado: proyecto_nombre || cleanSlug,
        proyecto_slug: cleanSlug,
        plan_tipo: selectedPlanTipo,
        lineas_cantidad: selectedLines,
        plan: planConfig.nombre,
        abono: planConfig.precio,
        backoffice_activado: false,
        deployment_url: null,
        railway_public_url: null,
        mp_preapproval_id: null,
        deploy_in_progress: false,
        is_deleted: false,
        source: "portal",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (projectErr) {
      console.error("[Nuevo Producto] Database insert error:", projectErr);
      throw new Error("Error al insertar el proyecto en la base de datos.");
    }

    console.log(`[Nuevo Producto] Successfully created project ${newProject.id} for user ${user.id}`);
    return NextResponse.json({ success: true, client: newProject });
  } catch (error) {
    console.error("[Nuevo Producto] Critical error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

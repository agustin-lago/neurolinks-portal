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

    // Clean and validate slug (lowercase, alphanumeric and hyphens only)
    const cleanSlug = proyecto_slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
    if (!cleanSlug) {
      return NextResponse.json({ error: "Slug de proyecto inválido" }, { status: 400 });
    }

    // Check if the slug already exists in the database
    const { count: slugExists } = await supabase
      .from("suscripciones_proyectos")
      .select("id", { count: "exact", head: true })
      .eq("proyecto_slug", cleanSlug);

    if (slugExists > 0) {
      return NextResponse.json({ error: `El slug "${cleanSlug}" ya está registrado en Neurolinks. Elegí otro.` }, { status: 400 });
    }

    // Check if the user already exists in clientes (to avoid duplicates)
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

      // Create new client row (only once per user)
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

    // Resolve default plan configuration (will be re-selected on the payment step)
    const selectedPlanTipo = "masivo_meta";
    const selectedLines = 1;
    
    // Get pricing and plan name from DB
    const { data: dbPlan } = await supabase
      .from('catalogo_planes')
      .select('nombre, precio')
      .eq('plan_tipo', selectedPlanTipo)
      .eq('lineas_cantidad', selectedLines)
      .eq('activo', true)
      .maybeSingle();
      
    const planConfig = dbPlan || { nombre: 'Standard + 1', precio: 63000 };

    // Insert new product record in suscripciones_proyectos
    const { data: newSub, error: subErr } = await supabase
      .from("suscripciones_proyectos")
      .insert({
        cliente_id: clienteId,
        proyecto_slug: cleanSlug,
        proyecto_nombre: proyecto_nombre || cleanSlug,
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
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (subErr) {
      console.error("[Nuevo Producto] Database insert error:", subErr);
      throw new Error("Error al insertar la suscripción en la base de datos.");
    }

    console.log(`[Nuevo Producto] Successfully created product ${newSub.id} for user ${user.id}`);
    
    return NextResponse.json({ success: true, client: newSub });
  } catch (error) {
    console.error("[Nuevo Producto] Critical error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

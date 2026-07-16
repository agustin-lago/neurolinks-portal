import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";



export async function POST(request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { proyecto_slug } = await request.json().catch(() => ({}));

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
      .from("clientes")
      .select("id", { count: "exact", head: true })
      .eq("proyecto_slug", cleanSlug);

    if (slugExists > 0) {
      return NextResponse.json({ error: `El slug "${cleanSlug}" ya está registrado en Neurolinks. Elegí otro.` }, { status: 400 });
    }

    // Check if the user is an admin (has any existing client row with is_admin = true)
    const { data: existingAdminCheck } = await supabase
      .from("clientes")
      .select("is_admin")
      .eq("auth_user_id", user.id)
      .eq("is_admin", true)
      .limit(1);

    const isNewClientAdmin = !!(
      (existingAdminCheck && existingAdminCheck.length > 0) ||
      user.email === "duskcodes.pereyrahugo@gmail.com" ||
      user.email === "neurolinksarg@gmail.com"
    );

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

    // Comprobar si ya existe una fila vacía creada por el administrador para este usuario
    const { data: existingEmptyClient } = await supabase
      .from("clientes")
      .select("id")
      .eq("auth_user_id", user.id)
      .is("proyecto_slug", null)
      .limit(1)
      .maybeSingle();

    let newClient;
    let insertError;

    if (existingEmptyClient) {
      // Actualizar la fila vacía existente en lugar de duplicar
      const { data, error } = await supabase
        .from("clientes")
        .update({
          email: user.email,
          nombre: user.user_metadata?.nombre || user.user_metadata?.full_name || user.user_metadata?.name || user.email.split("@")[0],
          telefono: user.user_metadata?.telefono ?? "",
          proyecto_slug: cleanSlug,
          empresa: user.user_metadata?.empresa || "",
          plan_tipo: selectedPlanTipo,
          lineas_cantidad: selectedLines,
          plan: planConfig.nombre,
          abono: planConfig.precio,
          is_admin: isNewClientAdmin,
          updated_at: new Date().toISOString()
        })
        .eq("id", existingEmptyClient.id)
        .select()
        .single();
        
      newClient = data;
      insertError = error;
    } else {
      // Insert new product record in Supabase
      const { data, error } = await supabase
        .from("clientes")
        .insert({
          auth_user_id: user.id,
          email: user.email,
          nombre: user.user_metadata?.nombre || user.user_metadata?.full_name || user.user_metadata?.name || user.email.split("@")[0],
          telefono: user.user_metadata?.telefono ?? "",
          proyecto_slug: cleanSlug,
          empresa: user.user_metadata?.empresa || "",
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
          is_admin: isNewClientAdmin,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();
        
      newClient = data;
      insertError = error;
    }

    if (insertError) {
      console.error("[Nuevo Producto] Database insert error:", insertError);
      throw new Error(insertError.message || "Error al insertar el producto en la base de datos.");
    }

    console.log(`[Nuevo Producto] Successfully created product ${newClient.id} for user ${user.id}`);
    
    // Delete any duplicate row the DB trigger may have created for this auth_user_id
    if (newClient?.id && user.id) {
      await supabase
        .from("clientes")
        .delete()
        .eq("auth_user_id", user.id)
        .neq("id", newClient.id)
        .is("proyecto_slug", null);
    }
    
    return NextResponse.json({ success: true, client: newClient });
  } catch (error) {
    console.error("[Nuevo Producto] Critical error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

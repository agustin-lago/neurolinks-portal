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

    if (!user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { proyecto_slug, empresa } = await request.json().catch(() => ({}));

    if (!proyecto_slug || !empresa) {
      return NextResponse.json({ error: "Faltan campos requeridos (slug, empresa)" }, { status: 400 });
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

    // Resolve default plan configuration (will be re-selected on the payment step)
    const selectedPlanTipo = "masivo_meta";
    const selectedLines = 1;
    const planConfig = PLANS_PRICING[selectedPlanTipo][selectedLines];

    // Insert new product record in Supabase
    const { data: newClient, error: insertError } = await supabase
      .from("clientes")
      .insert({
        auth_user_id: user.id,
        email: user.email,
        nombre: user.user_metadata?.nombre ?? user.email.split("@")[0],
        telefono: user.user_metadata?.telefono ?? "",
        proyecto_slug: cleanSlug,
        empresa: empresa.trim(),
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

    if (insertError) {
      console.error("[Nuevo Producto] Database insert error:", insertError);
      throw new Error(insertError.message || "Error al insertar el producto en la base de datos.");
    }

    console.log(`[Nuevo Producto] Successfully created product ${newClient.id} for user ${user.id}`);
    return NextResponse.json({ success: true, client: newClient });
  } catch (error) {
    console.error("[Nuevo Producto] Critical error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

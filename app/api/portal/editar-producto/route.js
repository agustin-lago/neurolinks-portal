import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Helper para limpiar y normalizar dominios
function normalizeDomain(url) {
  if (!url) return null;
  let cleaned = url.trim().toLowerCase();
  // Eliminar protocolos http://, https:// y subdominio www.
  cleaned = cleaned.replace(/^(https?:\/\/)?(www\.)?/, "");
  // Conservar solo el host (eliminar paths y query params)
  cleaned = cleaned.split("/")[0];
  return cleaned || null;
}

export async function POST(request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { id, empresa, proyecto_slug, deployment_url, deployment_urls, observaciones } = body;

    if (!id) {
      return NextResponse.json({ error: "Falta el ID del producto a editar" }, { status: 400 });
    }

    const adminDb = createAdminClient();

    // 1. Obtener la suscripción para verificar propiedad
    const { data: suscripcion, error: fetchError } = await adminDb
      .from("suscripciones_proyectos")
      .select("id, backoffice_activado, proyecto_slug, proyecto_nombre, clientes!inner(auth_user_id)")
      .eq("id", id)
      .single();

    if (fetchError || !suscripcion) {
      return NextResponse.json({ error: "Instancia no encontrada" }, { status: 404 });
    }

    // 2. Verificar permisos (dueño del recurso o administrador)
    let isUserAdmin = false;
    const { data: adminCheck } = await adminDb
      .from("clientes")
      .select("is_admin")
      .eq("auth_user_id", user.id)
      .eq("is_admin", true)
      .limit(1);

    if (adminCheck && adminCheck.length > 0) {
      isUserAdmin = true;
    }

    const isOwner = suscripcion.clientes?.auth_user_id === user.id;

    if (!isOwner && !isUserAdmin) {
      return NextResponse.json({ error: "No tienes permisos para modificar este producto" }, { status: 403 });
    }

    // 3. Validar Slug
    if (proyecto_slug) {
      const slugCleaned = proyecto_slug.trim().toLowerCase();
      const slugRegex = /^[a-z0-9-]+$/;
      if (!slugRegex.test(slugCleaned)) {
        return NextResponse.json({ 
          error: "El slug del proyecto solo debe contener letras minúsculas, números y guiones (sin espacios)." 
        }, { status: 400 });
      }

      // Restricción de seguridad: no permitir cambiar el slug de una instancia activa si no es admin
      if (slugCleaned !== suscripcion.proyecto_slug && suscripcion.backoffice_activado && !isUserAdmin) {
        return NextResponse.json({ 
          error: "Por razones de seguridad, no puedes cambiar el slug de una instancia activa. Contacta al administrador." 
        }, { status: 400 });
      }
    }

    // 4. Limpiar y normalizar los dominios
    let finalUrl = null;
    let finalUrls = [];

    if (deployment_urls && Array.isArray(deployment_urls)) {
      finalUrls = deployment_urls.map(url => normalizeDomain(url)).filter(Boolean);
      finalUrl = finalUrls[0] || null;
    } else if (deployment_url) {
      finalUrl = normalizeDomain(deployment_url);
      finalUrls = finalUrl ? [finalUrl] : [];
    }

    // 5. Actualizar Supabase
    console.log(`[Edit Instance] Updating client row ${id} with:`, {
      empresa,
      proyecto_slug,
      deployment_url: finalUrl,
      deployment_urls: finalUrls
    });

    const updateFields = {
      updated_at: new Date().toISOString()
    };

    if (empresa !== undefined) updateFields.proyecto_nombre = empresa.trim(); // Frontend still sends 'empresa', map to 'proyecto_nombre'
    if (proyecto_slug !== undefined) updateFields.proyecto_slug = proyecto_slug.trim().toLowerCase();
    if (finalUrl !== null || (deployment_url === "")) updateFields.deployment_url = finalUrl;
    if (finalUrls.length > 0 || (deployment_urls && deployment_urls.length === 0)) updateFields.deployment_urls = finalUrls;
    if (observaciones !== undefined && Array.isArray(observaciones)) {
      updateFields.observaciones = observaciones.map(o => o ? o.toString().trim() : "");
    }

    const { error: updateError } = await adminDb
      .from("suscripciones_proyectos")
      .update(updateFields)
      .eq("id", id);

    if (updateError) {
      console.error("[Edit Instance] Database update error:", updateError);
      throw new Error(updateError.message || "Error al actualizar la base de datos.");
    }

    console.log(`[Edit Instance] Successfully updated client ${id}`);
    return NextResponse.json({ success: true });

  } catch (error) {
    console.error("[Edit Instance] Critical error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { configureCustomDomainForProject, updateRailwayProjectName } from "@/lib/railway";

function normalizeDomain(url) {
  if (!url) return null;
  let cleaned = url.trim().toLowerCase();
  cleaned = cleaned.replace(/^(https?:\/\/)?(www\.)?/, "");
  cleaned = cleaned.split("/")[0];
  if (!cleaned || cleaned === "null" || cleaned === "undefined" || cleaned.startsWith("null.")) return null;
  return cleaned;
}

export async function POST(request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const { id, empresa, proyecto_slug, deployment_url, observaciones } = body;
    if (!id) return NextResponse.json({ error: "Falta el ID del producto a editar" }, { status: 400 });

    const adminDb = createAdminClient();
    const { data: proyecto, error: fetchError } = await adminDb
      .from("proyectos_railway")
      .select("id, railway_project_id, deployment_url, backoffice_activado, proyecto_slug, nombre_personalizado, clientes!inner(auth_user_id)")
      .eq("id", id)
      .single();

    if (fetchError || !proyecto) return NextResponse.json({ error: "Instancia no encontrada" }, { status: 404 });

    const { data: adminCheck } = await adminDb
      .from("clientes")
      .select("is_admin")
      .eq("auth_user_id", user.id)
      .eq("is_admin", true)
      .limit(1);

    const isUserAdmin = !!(adminCheck && adminCheck.length > 0);
    const isOwner = proyecto.clientes?.auth_user_id === user.id;
    if (!isOwner && !isUserAdmin) return NextResponse.json({ error: "No tienes permisos para modificar este producto" }, { status: 403 });

    if (proyecto_slug) {
      const slugCleaned = proyecto_slug.trim().toLowerCase();
      if (!/^[a-z0-9-]+$/.test(slugCleaned)) {
        return NextResponse.json({ error: "El slug del proyecto solo debe contener letras minusculas, numeros y guiones." }, { status: 400 });
      }
      if (slugCleaned !== proyecto.proyecto_slug && proyecto.backoffice_activado && !isUserAdmin) {
        return NextResponse.json({ error: "Por razones de seguridad, no puedes cambiar el slug de una instancia activa. Contacta al administrador." }, { status: 400 });
      }
    }

    const urlFieldWasSubmitted = deployment_url !== undefined;
    const finalUrl = deployment_url !== undefined ? normalizeDomain(deployment_url) : null;

    const updateFields = { updated_at: new Date().toISOString() };
    const baseDomain = (process.env.HOSTINGER_DOMAIN || "clientesneurolinks.com").replace(/^"(.*)"$/, "$1");
    const isManagedDomain = finalUrl && (finalUrl === baseDomain || finalUrl.endsWith(`.${baseDomain}`));
    const shouldConfigureCustomDomain = Boolean(isManagedDomain && finalUrl !== proyecto.deployment_url);

    if (shouldConfigureCustomDomain) {
      if (!proyecto.railway_project_id) {
        return NextResponse.json({ error: "Esta instancia todavia no tiene proyecto Railway vinculado." }, { status: 400 });
      }
      await configureCustomDomainForProject({ projectId: proyecto.railway_project_id, customDomain: finalUrl });
    }

    const nameFieldWasSubmitted = empresa !== undefined;
    const finalProjectName = nameFieldWasSubmitted ? empresa.trim() : null;
    const shouldRenameRailwayProject = Boolean(
      finalProjectName &&
      proyecto.railway_project_id &&
      finalProjectName !== proyecto.nombre_personalizado
    );

    if (shouldRenameRailwayProject) {
      await updateRailwayProjectName(proyecto.railway_project_id, finalProjectName);
    }

    if (nameFieldWasSubmitted) updateFields.nombre_personalizado = finalProjectName;
    if (proyecto_slug !== undefined) {
      const cleanedSlug = proyecto_slug.trim().toLowerCase();
      updateFields.proyecto_slug = cleanedSlug && cleanedSlug !== "null" && cleanedSlug !== "undefined" ? cleanedSlug : null;
    }
    if (urlFieldWasSubmitted) updateFields.deployment_url = finalUrl;
    if (observaciones !== undefined && Array.isArray(observaciones)) updateFields.observaciones = observaciones.map(o => o ? o.toString().trim() : "");

    const { error: updateError } = await adminDb
      .from("proyectos_railway")
      .update(updateFields)
      .eq("id", id);

    if (updateError) throw new Error(updateError.message || "Error al actualizar la base de datos.");
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Edit Instance] Critical error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

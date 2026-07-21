import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { activateClientPortal } from "@/lib/railway";

export async function POST(request) {
  try {
    const authHeader = request.headers.get("authorization") || "";
    const token = authHeader.replace("Bearer ", "").trim();
    const expectedToken = (process.env.DEPLOY_SECRET_KEY || "").trim();

    if (!expectedToken || token !== expectedToken) {
      console.warn("[Deploy Portal Route] Unauthorized deploy trigger attempt.");
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { projectRowId, clienteId } = await request.json().catch(() => ({}));
    if (!projectRowId && !clienteId) {
      return NextResponse.json({ error: "projectRowId o clienteId es requerido" }, { status: 400 });
    }

    const adminDb = createAdminClient();
    let projectRows = [];

    if (projectRowId) {
      projectRows = [{ id: projectRowId }];
    } else {
      const { data, error } = await adminDb
        .from("proyectos_railway")
        .select("id")
        .eq("cliente_id", clienteId)
        .eq("is_deleted", false)
        .eq("backoffice_activado", false)
        .order("created_at", { ascending: true });

      if (error) throw error;
      projectRows = data || [];
    }

    if (projectRows.length === 0) {
      return NextResponse.json({ ok: true, message: "No hay instancias pendientes para desplegar" });
    }

    projectRows.forEach(project => {
      activateClientPortal(project.id, adminDb)
        .then((res) => console.log(`[Deploy Portal Route] Background activation completed for project row '${project.id}':`, res))
        .catch((actErr) => console.error(`[Deploy Portal Route] Background activation failed for project row '${project.id}':`, actErr));
    });

    return NextResponse.json({ ok: true, message: "Deploy triggered successfully", count: projectRows.length });
  } catch (err) {
    console.error("[Deploy Portal Route] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

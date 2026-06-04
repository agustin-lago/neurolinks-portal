import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { activateClientPortal } from "@/lib/railway";

export async function GET(request) {
  try {
    // Optional basic auth using DEPLOY_SECRET_KEY to prevent spam
    const authHeader = request.headers.get("authorization") || "";
    const token = authHeader.replace("Bearer ", "").trim();
    const expectedToken = (process.env.DEPLOY_SECRET_KEY || "").trim();

    const url = new URL(request.url);
    const queryKey = url.searchParams.get("key") || "";

    if ((expectedToken && token !== expectedToken) && (expectedToken && queryKey !== expectedToken)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    console.log("[Cron Sync API] Fetching pending client deployments to sync...");
    const adminDb = createAdminClient();

    const { data: pendingClients, error } = await adminDb
      .from("clientes")
      .select("id, proyecto_slug")
      .eq("is_deleted", false)
      .eq("backoffice_activado", false)
      .not("token_backoffice", "is", null);

    if (error) {
      throw error;
    }

    const synced = [];
    if (pendingClients && pendingClients.length > 0) {
      for (const client of pendingClients) {
        // Trigger activation asynchronously in background
        activateClientPortal(client.id, adminDb)
          .then((res) => {
            console.log(`[Cron Sync API] Client ${client.proyecto_slug} sync result:`, res);
          })
          .catch((err) => {
            console.error(`[Cron Sync API] Client ${client.proyecto_slug} sync failed:`, err.message);
          });
        synced.push({ id: client.id, slug: client.proyecto_slug });
      }
    }

    return NextResponse.json({ ok: true, syncedCount: synced.length, synced });
  } catch (err) {
    console.error("[Cron Sync API] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

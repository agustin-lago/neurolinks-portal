export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Dynamically import dependencies as recommended for Next.js instrumentation bootstrap
    const { createAdminClient } = await import("./lib/supabase/admin.js");
    const { activateClientPortal } = await import("./lib/railway.js");

    console.log("[Instrumentation] Registering background cron sync loop (runs every 5 minutes)...");

    // Run sync loop every 5 minutes
    setInterval(async () => {
      console.log("[Cron Sync Loop] Checking for pending client deployments...");
      try {
        const adminDb = createAdminClient();
        const { data: pendingClients } = await adminDb
          .from("clientes")
          .select("id, proyecto_slug")
          .eq("is_deleted", false)
          .eq("backoffice_activado", false)
          .not("token_backoffice", "is", null);

        if (pendingClients && pendingClients.length > 0) {
          console.log(`[Cron Sync Loop] Found ${pendingClients.length} pending client(s) to sync. Triggering...`);
          for (const client of pendingClients) {
            activateClientPortal(client.id, adminDb)
              .then((res) => {
                if (!res?.ignored) {
                  console.log(`[Cron Sync Loop] Synchronized client ${client.proyecto_slug} successfully.`);
                }
              })
              .catch((err) => {
                console.error(`[Cron Sync Loop] Failed to sync client ${client.proyecto_slug}:`, err.message);
              });
          }
        }
      } catch (cronErr) {
        console.error("[Cron Sync Loop] Error:", cronErr.message);
      }
    }, 5 * 60 * 1000);
  }
}

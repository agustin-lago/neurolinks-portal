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
        const { data: pendingSubscriptions } = await adminDb
          .from("proyectos_railway")
          .select("id, proyecto_slug")
          .eq("is_deleted", false)
          .eq("backoffice_activado", false)
          .eq("deploy_in_progress", false)
          .not("mp_preapproval_id", "is", null);

        if (pendingSubscriptions && pendingSubscriptions.length > 0) {
          console.log(`[Cron Sync Loop] Found ${pendingSubscriptions.length} pending subscription(s) to sync. Triggering...`);
          for (const sub of pendingSubscriptions) {
            activateClientPortal(sub.id, adminDb)
              .then((res) => {
                if (!res?.ignored) {
                  console.log(`[Cron Sync Loop] Synchronized subscription ${sub.proyecto_slug} successfully.`);
                }
              })
              .catch((err) => {
                console.error(`[Cron Sync Loop] Failed to sync subscription ${sub.proyecto_slug}:`, err.message);
              });
          }
        }
      } catch (cronErr) {
        console.error("[Cron Sync Loop] Error:", cronErr.message);
      }
    }, 5 * 60 * 1000);
  }
}

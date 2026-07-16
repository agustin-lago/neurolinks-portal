import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import DashboardClient from "@/components/portal/DashboardClient";
import { getRailwayProjectNames } from "@/lib/railway";

export const metadata = { title: "Dashboard | Neurolinks" };

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/portal");

  const { data: clientes } = await supabase
    .from("clientes")
    .select("id, nombre, plan, abono, backoffice_activado, deployment_url, deployment_urls, railway_public_url, activated_at, updated_at, plan_tipo, lineas_cantidad, proyecto_slug, empresa, created_at, is_admin, mp_preapproval_id, observaciones, tokens_backoffice")
    .eq("auth_user_id", user.id)
    .eq("is_deleted", false)
    .order("created_at", { ascending: false });

  const { data: adminCheck } = await supabase
    .from("clientes")
    .select("is_admin")
    .eq("auth_user_id", user.id)
    .eq("is_admin", true)
    .limit(1);

  const validClientes = (clientes || []).filter(c => c.proyecto_slug);

  // Get all Railway Project IDs linked to this user's clients
  const rwIds = validClientes.flatMap(c => c.tokens_backoffice || []);
  const railwayProjects = await getRailwayProjectNames(rwIds);

  const isUserAdmin = !!(adminCheck && adminCheck.length > 0);

  return <DashboardClient user={user} initialClientes={validClientes} initialRailwayProjects={railwayProjects} isUserAdmin={isUserAdmin} />;
}

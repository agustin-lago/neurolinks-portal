import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import DashboardClient from "@/components/portal/DashboardClient";
import { getRailwayProjectNames } from "@/lib/railway";

export const metadata = { title: "Dashboard | Neurolinks" };

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/portal");

  // 1. Ensure the user exists in the clientes table.
  const { data: existingClient } = await supabase
    .from("clientes")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!existingClient) {
    const isNewClientAdmin = !!(
      user.email === "duskcodes.pereyrahugo@gmail.com" ||
      user.email === "neurolinksarg@gmail.com"
    );

    await supabase.from("clientes").insert({
      auth_user_id: user.id,
      email: user.email,
      nombre: user.user_metadata?.nombre || user.user_metadata?.full_name || user.user_metadata?.name || user.email.split("@")[0],
      telefono: user.user_metadata?.telefono ?? "",
      empresa: user.user_metadata?.empresa || "",
      is_admin: isNewClientAdmin,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
  }

  // 2. Fetch all user products/projects from the canonical project table.
  const { data: proyectos } = await supabase
    .from("proyectos_railway")
    .select(`
      id, railway_project_id, nombre_personalizado, plan, abono, backoffice_activado,
      deployment_url, railway_public_url, activated_at, updated_at, plan_tipo,
      lineas_cantidad, proyecto_slug, created_at, mp_preapproval_id, observaciones,
      is_deleted, deploy_in_progress,
      clientes!inner ( nombre, empresa, is_admin, is_deleted, auth_user_id )
    `)
    .eq("clientes.auth_user_id", user.id)
    .eq("clientes.is_deleted", false)
    .eq("is_deleted", false)
    .order("created_at", { ascending: false });

  const { data: adminCheck } = await supabase
    .from("clientes")
    .select("is_admin")
    .eq("auth_user_id", user.id)
    .eq("is_admin", true)
    .limit(1);

  const validClientes = (proyectos || []).map(project => ({
    ...project,
    backoffice_activado: project.backoffice_activado || Boolean(project.railway_project_id),
    nombre: project.clientes.nombre,
    empresa: project.clientes.empresa,
    proyecto_nombre_db: project.nombre_personalizado,
    is_admin: project.clientes.is_admin,
    tokens_backoffice: project.railway_project_id ? [project.railway_project_id] : [],
    deployment_urls: project.deployment_url ? [project.deployment_url] : (project.railway_public_url ? [project.railway_public_url] : []),
    observaciones: Array.isArray(project.observaciones) ? project.observaciones : []
  }));

  const rwIds = validClientes.map(c => c.railway_project_id).filter(Boolean);
  const railwayProjects = await getRailwayProjectNames(rwIds);
  const isUserAdmin = !!(adminCheck && adminCheck.length > 0);

  return <DashboardClient user={user} initialClientes={validClientes} initialRailwayProjects={railwayProjects} isUserAdmin={isUserAdmin} />;
}

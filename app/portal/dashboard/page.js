import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import DashboardClient from "@/components/portal/DashboardClient";
import { getRailwayProjectNames } from "@/lib/railway";

export const metadata = { title: "Dashboard | Neurolinks" };

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/portal");

  // 1. Ensure the user exists in the "clientes" table
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

  // 2. Fetch all user subscriptions (projects)
  const { data: suscripciones } = await supabase
    .from("suscripciones_proyectos")
    .select(`
      id, plan, abono, backoffice_activado, deployment_url, deployment_urls, railway_public_url, 
      activated_at, updated_at, plan_tipo, lineas_cantidad, proyecto_slug, proyecto_nombre, created_at, 
      mp_preapproval_id, tokens_backoffice,
      clientes!inner ( nombre, empresa, is_admin, is_deleted )
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

  const validClientes = (suscripciones || []).map(sub => ({
    ...sub,
    nombre: sub.clientes.nombre,
    empresa: sub.clientes.empresa, // Keep original behavior for anything that needs global company
    proyecto_nombre_db: sub.proyecto_nombre, // Explicitly pass the DB field
    is_admin: sub.clientes.is_admin,
    observaciones: ""
  }));

  // Get all Railway Project IDs linked to this user's clients
  const rwIds = validClientes.flatMap(c => c.tokens_backoffice || []);
  const railwayProjects = await getRailwayProjectNames(rwIds);

  const isUserAdmin = !!(adminCheck && adminCheck.length > 0);

  return <DashboardClient user={user} initialClientes={validClientes} initialRailwayProjects={railwayProjects} isUserAdmin={isUserAdmin} />;
}

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import DashboardClient from "@/components/portal/DashboardClient";
import { getRailwayProjectNames } from "@/lib/railway";
import { hasPortalAccess, getUsageLabel } from "@/lib/subscription";

export const metadata = { title: "Dashboard | Neurolinks" };

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/portal");

  let { data: client } = await supabase
    .from("clientes")
    .select("id, nombre, empresa, email, telefono, is_admin, is_deleted, auth_user_id, vendedor_id, plan, plan_tipo, lineas_cantidad, abono, vencimiento, mp_preapproval_id, subscription_status, subscription_source")
    .eq("auth_user_id", user.id)
    .eq("is_deleted", false)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!client) {
    const userEmail = String(user.email || "").trim();
    if (userEmail) {
      const { data: existingByEmail } = await supabase
        .from("clientes")
        .select("id, nombre, empresa, email, telefono, is_admin, is_deleted, auth_user_id, vendedor_id, plan, plan_tipo, lineas_cantidad, abono, vencimiento, mp_preapproval_id, subscription_status, subscription_source")
        .ilike("email", userEmail)
        .eq("is_deleted", false)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (existingByEmail && !existingByEmail.auth_user_id) {
        await supabase
          .from("clientes")
          .update({ auth_user_id: user.id, updated_at: new Date().toISOString() })
          .eq("id", existingByEmail.id);
        client = { ...existingByEmail, auth_user_id: user.id };
      }
    }
  }

  if (!client) {
    const isNewClientAdmin = user.email === "duskcodes.pereyrahugo@gmail.com" || user.email === "neurolinksarg@gmail.com";
    const { data: createdClient } = await supabase.from("clientes").insert({
      auth_user_id: user.id,
      email: user.email,
      nombre: user.user_metadata?.nombre || user.user_metadata?.full_name || user.user_metadata?.name || user.email.split("@")[0],
      telefono: user.user_metadata?.telefono ?? "",
      empresa: user.user_metadata?.empresa || "",
      is_admin: isNewClientAdmin,
      subscription_status: "pending",
      subscription_source: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }).select("id").single();

    if (createdClient?.id) redirect("/portal/pago");
    redirect("/portal");
  }

  if (!hasPortalAccess(client)) redirect("/portal/pago");

  const { data: proyectos } = await supabase
    .from("proyectos_railway")
    .select("id, railway_project_id, nombre_personalizado, backoffice_activado, deployment_url, railway_public_url, activated_at, updated_at, proyecto_slug, created_at, observaciones, is_deleted, deploy_in_progress")
    .eq("cliente_id", client.id)
    .eq("is_deleted", false)
    .order("created_at", { ascending: false });

  const validClientes = (proyectos || []).map(project => ({
    ...project,
    backoffice_activado: project.backoffice_activado || Boolean(project.railway_project_id),
    nombre: client.nombre,
    empresa: client.empresa,
    proyecto_nombre_db: project.nombre_personalizado,
    is_admin: client.is_admin,
    plan: client.plan,
    plan_tipo: client.plan_tipo,
    lineas_cantidad: client.lineas_cantidad,
    abono: client.abono,
    vencimiento: client.vencimiento,
    mp_preapproval_id: client.mp_preapproval_id,
    subscription_status: client.subscription_status,
    subscription_source: client.subscription_source,
    observaciones: Array.isArray(project.observaciones) ? project.observaciones : []
  }));

  const rwIds = validClientes.map(c => c.railway_project_id).filter(Boolean);
  const railwayProjects = await getRailwayProjectNames(rwIds);
  const subscription = { ...client, project_count: validClientes.length, usage_label: getUsageLabel(client, validClientes.length) };

  return <DashboardClient user={user} initialClientes={validClientes} initialRailwayProjects={railwayProjects} isUserAdmin={Boolean(client.is_admin)} subscription={subscription} />;
}
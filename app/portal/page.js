import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import PortalFlow from "@/components/portal/PortalFlow";

export const metadata = {
  title: "Portal Cliente | Neurolinks",
};

export default async function PortalPage({ searchParams }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let cliente = null;

  if (user) {
    const { data: clientData } = await supabase
      .from("clientes")
      .select("id, nombre")
      .eq("auth_user_id", user.id)
      .single();

    if (clientData?.id) {
      const { data: projectData } = await supabase
        .from("proyectos_railway")
        .select("plan, abono, backoffice_activado, deployment_url, railway_public_url, railway_project_id")
        .eq("cliente_id", clientData.id)
        .eq("is_deleted", false)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      cliente = { ...clientData, ...(projectData || {}) };

      const isActive = projectData?.backoffice_activado || Boolean(projectData?.railway_project_id);
      const targetUrl = projectData?.deployment_url || projectData?.railway_public_url;
      if (isActive && targetUrl) {
        redirect(`https://${targetUrl}`);
      }
    }
  }

  const params          = await searchParams;
  const paymentApproved = params?.collection_status === "approved";

  if (user && !paymentApproved) {
    redirect("/portal/dashboard");
  }

  const initialStep = !user ? "auth" : "polling";

  return <PortalFlow initialStep={initialStep} cliente={cliente} />;
}

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
    const { data } = await supabase
      .from("clientes")
      .select("id, nombre, plan, abono, backoffice_activado, deployment_url")
      .eq("auth_user_id", user.id)
      .single();

    cliente = data;

    if (cliente?.backoffice_activado && cliente?.deployment_url) {
      redirect(`https://${cliente.deployment_url}`);
    }
  }

  const params          = await searchParams;
  const paymentApproved = params?.collection_status === "approved";

  const initialStep = !user ? "auth" : paymentApproved ? "polling" : "pago";

  return <PortalFlow initialStep={initialStep} cliente={cliente} />;
}

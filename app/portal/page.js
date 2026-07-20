import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import PortalFlow from "@/components/portal/PortalFlow";

export const metadata = {
  title: "Portal Cliente | Neurolinks",
};

export default async function PortalPage({ searchParams }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const params = await searchParams;
  const paymentApproved = params?.collection_status === "approved";

  let cliente = null;

  if (user) {
    const { data: clientData } = await supabase
      .from("clientes")
      .select("id, nombre, plan, plan_tipo, lineas_cantidad, abono, vencimiento, mp_preapproval_id, subscription_status, subscription_source")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    cliente = clientData || null;
  }

  if (user && !paymentApproved) {
    redirect("/portal/dashboard");
  }

  const initialStep = !user ? "auth" : "polling";

  return <PortalFlow initialStep={initialStep} cliente={cliente} />;
}

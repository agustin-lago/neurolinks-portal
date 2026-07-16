import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import PerfilClient from "@/components/portal/PerfilClient";

export const metadata = { title: "Mi Cuenta | Neurolinks" };

export default async function PerfilPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/portal");

  const { data: clientData } = await supabase
    .from("clientes")
    .select("is_admin, nombre, empresa, telefono")
    .eq("auth_user_id", user.id)
    .limit(1)
    .single();

  const isUserAdmin = !!(clientData?.is_admin);

  return <PerfilClient user={user} isUserAdmin={isUserAdmin} clientDbData={clientData} />;
}

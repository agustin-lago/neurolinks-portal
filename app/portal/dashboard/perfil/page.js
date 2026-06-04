import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import PerfilClient from "@/components/portal/PerfilClient";

export const metadata = { title: "Mi Cuenta | Neurolinks" };

export default async function PerfilPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/portal");

  return <PerfilClient user={user} />;
}

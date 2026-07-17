import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import PagoClient from "@/components/portal/PagoClient";

export const metadata = { title: "Pago | Neurolinks" };

export default async function PagoPage({ searchParams }) {
  const params = await searchParams;
  const id = params?.id;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/portal");

  let query = supabase
    .from("proyectos_railway")
    .select("id, plan, abono, backoffice_activado, deployment_url, railway_public_url, railway_project_id, clientes!inner(nombre, vendedor_id, auth_user_id)")
    .eq("clientes.auth_user_id", user.id)
    .eq("is_deleted", false);

  if (id) query = query.eq("id", id).single();
  else query = query.order("created_at", { ascending: false }).limit(1).single();

  const { data: proyecto } = await query;
  if (!proyecto) redirect("/portal/dashboard/nuevo");

  const isActive = proyecto?.backoffice_activado || Boolean(proyecto?.railway_project_id);
  const targetUrl = proyecto?.deployment_url || proyecto?.railway_public_url;
  if (isActive && targetUrl) redirect(`https://${targetUrl}`);

  let planesPrincipales = [];
  if (proyecto?.clientes?.vendedor_id) {
    const { data } = await supabase
      .from("mp_planes")
      .select("*")
      .eq("vendedor_id", proyecto.clientes.vendedor_id);
    planesPrincipales = data || [];
  }

  return <PagoClient cliente={proyecto} planesPrincipales={planesPrincipales} />;
}

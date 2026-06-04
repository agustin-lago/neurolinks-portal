import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import PagoClient from "@/components/portal/PagoClient";

export const metadata = { title: "Activar portal | Neurolinks" };

export default async function PagoPage({ searchParams }) {
  const { id } = await searchParams || {};
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/portal");

  let query = supabase
    .from("clientes")
    .select("id, nombre, plan, abono, backoffice_activado, deployment_url")
    .eq("auth_user_id", user.id);

  if (id) {
    query = query.eq("id", id).single();
  } else {
    query = query.limit(1).single();
  }

  const { data: cliente } = await query;

  if (!cliente) redirect("/portal/dashboard");

  // Already paid — send directly to their backoffice
  if (cliente?.backoffice_activado && cliente?.deployment_url) {
    redirect(`https://${cliente.deployment_url}`);
  }

  // Determine if the current user is admin (has at least one client row with is_admin = true)
  const { data: userClientes } = await supabase
    .from("clientes")
    .select("is_admin")
    .eq("auth_user_id", user.id);
  const isAdmin = userClientes?.some(c => c.is_admin) || false;

  // Fetch dynamic plans from the principal seller to show official subscription prices
  let planesPrincipales = [];
  try {
    let sellerId = null;

    // 1. Try to find the seller by the principal user_id '39957203' (from MP_ACCESS_TOKEN)
    const { data: mainSeller } = await supabase
      .from("mp_vendedores")
      .select("id")
      .eq("mp_user_id", "39957203")
      .single();

    if (mainSeller) {
      sellerId = mainSeller.id;
    } else {
      // 2. Fallback: get the first registered seller
      const { data: firstSeller } = await supabase
        .from("mp_vendedores")
        .select("id")
        .order("created_at", { ascending: true })
        .limit(1)
        .single();
      
      if (firstSeller) {
        sellerId = firstSeller.id;
      }
    }

    if (sellerId) {
      const { data: plans } = await supabase
        .from("mp_planes")
        .select("plan_tipo, lineas_cantidad, monto")
        .eq("vendedor_id", sellerId);
      
      if (plans) {
        planesPrincipales = plans;
      }
    }
  } catch (err) {
    console.error("[PagoPage] Error loading dynamic prices:", err);
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <PagoClient cliente={cliente} planesPrincipales={planesPrincipales} isAdmin={isAdmin} />
    </div>
  );
}

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import PagoClient from "@/components/portal/PagoClient";

export const metadata = { title: "Activar portal | Neurolinks" };

export default async function PagoPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/portal");

  const { data: cliente } = await supabase
    .from("clientes")
    .select("id, nombre, plan, abono, backoffice_activado, deployment_url")
    .eq("auth_user_id", user.id)
    .single();

  // Already paid — send directly to their backoffice
  if (cliente?.backoffice_activado && cliente?.deployment_url) {
    redirect(`https://${cliente.deployment_url}`);
  }

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
      <PagoClient cliente={cliente} planesPrincipales={planesPrincipales} />
    </div>
  );
}

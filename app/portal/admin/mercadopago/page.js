import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import AdminMercadoPago from "@/components/portal/AdminMercadoPago";

export const metadata = { title: "Panel Admin Mercado Pago | Neurolinks" };

export default async function AdminMercadoPagoPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/portal");

  // Get client details and verify is_admin
  const { data: cliente } = await supabase
    .from("clientes")
    .select("is_admin")
    .eq("auth_user_id", user.id)
    .single();

  if (!cliente || !cliente.is_admin) {
    redirect("/portal/pago"); // Redirect normal clients to their payment page
  }

  return (
    <div className="min-h-screen py-10 px-4 max-w-6xl mx-auto">
      <AdminMercadoPago />
    </div>
  );
}

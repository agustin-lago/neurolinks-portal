import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import PagoClient from "@/components/portal/PagoClient";
import { hasPortalAccess } from "@/lib/subscription";

export const metadata = { title: "Pago | Neurolinks" };

export default async function PagoPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/portal");

  let { data: cliente } = await supabase
    .from("clientes")
    .select("id, nombre, empresa, email, auth_user_id, vendedor_id, is_admin, plan, plan_tipo, lineas_cantidad, abono, vencimiento, mp_preapproval_id, subscription_status, subscription_source")
    .eq("auth_user_id", user.id)
    .eq("is_deleted", false)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!cliente) {
    const userEmail = String(user.email || "").trim();
    if (userEmail) {
      const { data: existingByEmail } = await supabase
        .from("clientes")
        .select("id, nombre, empresa, email, auth_user_id, vendedor_id, is_admin, plan, plan_tipo, lineas_cantidad, abono, vencimiento, mp_preapproval_id, subscription_status, subscription_source")
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
        cliente = { ...existingByEmail, auth_user_id: user.id };
      }
    }
  }

  if (!cliente) {
    const isNewClientAdmin = user.email === "duskcodes.pereyrahugo@gmail.com" || user.email === "neurolinksarg@gmail.com";
    const { data: created, error } = await supabase.from("clientes").insert({
      auth_user_id: user.id,
      email: user.email,
      nombre: user.user_metadata?.nombre || user.user_metadata?.full_name || user.user_metadata?.name || user.email.split("@")[0],
      telefono: user.user_metadata?.telefono ?? "",
      empresa: user.user_metadata?.empresa || "",
      is_admin: isNewClientAdmin,
      subscription_status: "pending",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }).select("id, nombre, empresa, email, auth_user_id, vendedor_id, is_admin, plan, plan_tipo, lineas_cantidad, abono, vencimiento, mp_preapproval_id, subscription_status, subscription_source").single();
    if (error) redirect("/portal");
    cliente = created;
  }

  if (hasPortalAccess(cliente)) redirect("/portal/dashboard");

  let planesPrincipales = [];
  const { data: catalogPlans } = await supabase
    .from("catalogo_planes")
    .select("*")
    .eq("activo", true);
  planesPrincipales = catalogPlans || [];

  return <PagoClient cliente={cliente} planesPrincipales={planesPrincipales} isAdmin={Boolean(cliente?.is_admin)} />;
}
import { createClient } from "@/lib/supabase/server";
import { toSlug } from "@/lib/utils/slug";
import { redirect } from "next/navigation";

export async function generateMetadata({ params }) {
  const { proyecto } = await params;
  return { title: `${proyecto} | Neurolinks Portal` };
}

export default async function DashboardPage({ params }) {
  const { proyecto } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/portal");

  // Verificar que el usuario posee este proyecto
  const { data: cliente } = await supabase
    .from("clientes")
    .select("id")
    .eq("auth_user_id", user.id)
    .eq("proyecto_slug", proyecto)
    .limit(1)
    .maybeSingle();

  if (!cliente) redirect("/portal/dashboard");

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="text-center">
        <p className="text-white/25 text-xs font-heading font-semibold tracking-widest uppercase mb-3">
          Portal de cliente
        </p>
        <h1 className="font-heading font-extrabold text-white text-3xl mb-2">
          ¡Bienvenido, {user.user_metadata?.nombre ?? user.email}!
        </h1>
        <p className="text-white/40 text-sm mb-2">{user.email}</p>
        <p className="text-gradient-accent font-heading font-bold text-lg mb-8">{userProyecto}</p>
        <p className="text-white/20 text-xs">Dashboard en construcción — próximamente.</p>
      </div>
    </div>
  );
}

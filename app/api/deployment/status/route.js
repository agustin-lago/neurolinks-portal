import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ready: false });

  let query = supabase
    .from("proyectos_railway")
    .select("backoffice_activado, deployment_url, railway_public_url, railway_project_id, activated_at, updated_at, clientes!inner(auth_user_id)")
    .eq("clientes.auth_user_id", user.id)
    .eq("is_deleted", false);

  if (id) query = query.eq("id", id).single();
  else query = query.order("created_at", { ascending: false }).limit(1).single();

  const { data: proyecto } = await query;
  const isActive = proyecto?.backoffice_activado || Boolean(proyecto?.railway_project_id);
  const ready = !!(isActive && (proyecto?.deployment_url || proyecto?.railway_public_url));
  let targetUrl = proyecto?.deployment_url || proyecto?.railway_public_url || null;

  if (isActive && proyecto?.railway_public_url) {
    const activationTime = proyecto.activated_at ? new Date(proyecto.activated_at) : new Date(proyecto.updated_at);
    const diffMs = Date.now() - activationTime.getTime();
    if (diffMs < 15 * 60 * 1000) targetUrl = proyecto.railway_public_url;
  }

  return NextResponse.json({ ready, url: targetUrl });
}

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ready: false });

  let query = supabase
    .from("clientes")
    .select("backoffice_activado, deployment_url")
    .eq("auth_user_id", user.id);

  if (id) {
    query = query.eq("id", id).single();
  } else {
    query = query.limit(1).single();
  }

  const { data: cliente } = await query;
  const ready = !!(cliente?.backoffice_activado && cliente?.deployment_url);
  return NextResponse.json({ ready, url: cliente?.deployment_url ?? null });
}

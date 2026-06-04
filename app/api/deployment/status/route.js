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
    .select("backoffice_activado, deployment_url, railway_public_url, activated_at, updated_at")
    .eq("auth_user_id", user.id);

  if (id) {
    query = query.eq("id", id).single();
  } else {
    query = query.limit(1).single();
  }

  const { data: cliente } = await query;
  const ready = !!(cliente?.backoffice_activado && (cliente?.deployment_url || cliente?.railway_public_url));
  
  let targetUrl = cliente?.deployment_url ?? null;

  if (cliente?.backoffice_activado && cliente?.railway_public_url) {
    const activationTime = cliente.activated_at ? new Date(cliente.activated_at) : new Date(cliente.updated_at);
    const diffMs = Date.now() - activationTime.getTime();
    const fifteenMinutesMs = 15 * 60 * 1000;

    if (diffMs < fifteenMinutesMs) {
      let pubUrl = cliente.railway_public_url;
      if (pubUrl.startsWith("[")) {
        try {
          const parsed = JSON.parse(pubUrl);
          pubUrl = parsed[0] || null;
        } catch (e) {
          console.error("[status API] Failed to parse railway_public_url array:", e);
        }
      }
      if (pubUrl) {
        targetUrl = pubUrl;
      }
    }
  }

  return NextResponse.json({ ready, url: targetUrl });
}

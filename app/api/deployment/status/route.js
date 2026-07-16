import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ready: false });

  let query = supabase
    .from("suscripciones_proyectos")
    .select("backoffice_activado, deployment_url, railway_public_url, activated_at, updated_at, clientes!inner(auth_user_id)")
    .eq("clientes.auth_user_id", user.id);

  if (id) {
    query = query.eq("id", id).single();
  } else {
    query = query.limit(1).single();
  }

  const { data: suscripcion } = await query;
  const ready = !!(suscripcion?.backoffice_activado && (suscripcion?.deployment_url || suscripcion?.railway_public_url));
  
  let targetUrl = suscripcion?.deployment_url ?? null;

  if (suscripcion?.backoffice_activado && suscripcion?.railway_public_url) {
    const activationTime = suscripcion.activated_at ? new Date(suscripcion.activated_at) : new Date(suscripcion.updated_at);
    const diffMs = Date.now() - activationTime.getTime();
    const fifteenMinutesMs = 15 * 60 * 1000;

    if (diffMs < fifteenMinutesMs) {
      let pubUrl = suscripcion.railway_public_url;
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

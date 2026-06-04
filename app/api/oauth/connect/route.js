import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    // Check if the user is admin
    const { data: clientes } = await supabase
      .from("clientes")
      .select("is_admin")
      .eq("auth_user_id", user.id);

    const isAdmin = clientes?.some(c => c.is_admin);

    if (!isAdmin) {
      return NextResponse.json({ error: "Solo administradores" }, { status: 403 });
    }

    const reqUrl = new URL(request.url);
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || `${reqUrl.protocol}//${reqUrl.host}`;
    const redirectUri = `${siteUrl}/api/oauth/callback`;

    const clientId = process.env.MP_CLIENT_ID || "8887282663567774"; // Parse or fallback
    
    const mpAuthUrl = `https://auth.mercadopago.com/authorization?client_id=${clientId}&response_type=code&platform_id=mp&state=${user.id}&redirect_uri=${encodeURIComponent(redirectUri)}`;

    return NextResponse.redirect(mpAuthUrl);
  } catch (error) {
    console.error("[OAuth Connect] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

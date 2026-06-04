import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const STANDARDIZED_PLANS = [
  {
    plan_tipo: "masivo_meta",
    lineas_cantidad: 1,
    nombre: "Envíos Masivos y API de META - 1 Línea",
    monto: 63000,
  },
  {
    plan_tipo: "masivo_meta",
    lineas_cantidad: 2,
    nombre: "Envíos Masivos y API de META - 2 Líneas",
    monto: 99000,
  },
  {
    plan_tipo: "masivo_meta",
    lineas_cantidad: 3,
    nombre: "Envíos Masivos y API de META - 3 Líneas",
    monto: 120000,
  },
  {
    plan_tipo: "chatbot_ia",
    lineas_cantidad: 1,
    nombre: "Chatbot IA - Atención Clientes",
    monto: 210000,
  }
];

export async function GET(request) {
  const reqUrl = new URL(request.url);
  const code = reqUrl.searchParams.get("code");
  const adminUserId = reqUrl.searchParams.get("state"); // Associated admin user

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || `${reqUrl.protocol}//${reqUrl.host}`;
  const redirectUri = `${siteUrl}/api/oauth/callback`;

  if (!code || !adminUserId) {
    return NextResponse.redirect(new URL("/portal/admin/mercadopago?error=missing_params", request.url));
  }

  try {
    const supabase = createAdminClient();

    // Verify the state user is indeed an admin
    const { data: clientes } = await supabase
      .from("clientes")
      .select("is_admin")
      .eq("auth_user_id", adminUserId);

    const isAdmin = clientes?.some(c => c.is_admin);

    if (!isAdmin) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const clientId = process.env.MP_CLIENT_ID || "8887282663567774";
    const clientSecret = process.env.MP_CLIENT_SECRET || process.env.MP_ACCESS_TOKEN;

    // Exchange authorization code for token
    const tokenRes = await fetch("https://api.mercadopago.com/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code: code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      console.error("[OAuth Callback] MP OAuth token exchange error:", tokenData);
      throw new Error(tokenData.message || "Error al obtener tokens de Mercado Pago");
    }

    const { access_token, refresh_token, user_id: mp_user_id, expires_in } = tokenData;
    const expires_at = new Date(Date.now() + (expires_in || 15552000) * 1000).toISOString();

    // Query seller name and last name from Mercado Pago API
    let nombre = null;
    let apellido = null;
    try {
      console.log(`[OAuth Callback] Querying Mercado Pago user details for user ID ${mp_user_id}...`);
      const userRes = await fetch(`https://api.mercadopago.com/users/${mp_user_id}`, {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      });

      if (userRes.ok) {
        const userData = await userRes.json();
        nombre = userData.first_name || userData.nickname || null;
        apellido = userData.last_name || null;
        console.log(`[OAuth Callback] Successfully fetched seller info: ${nombre} ${apellido}`);
      } else {
        const userErrText = await userRes.text();
        console.warn(`[OAuth Callback] Failed to fetch MP user details. Status: ${userRes.status}, Response: ${userErrText}`);
      }
    } catch (fetchUserErr) {
      console.error("[OAuth Callback] Error fetching seller user info:", fetchUserErr.message);
    }

    // Insert or Update the seller connected account
    const { data: vendedor, error: sellerError } = await supabase
      .from("mp_vendedores")
      .upsert(
        {
          user_id: adminUserId,
          mp_user_id: String(mp_user_id),
          access_token,
          refresh_token,
          expires_at,
          nombre,
          apellido,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "mp_user_id" }
      )
      .select()
      .single();

    if (sellerError || !vendedor) {
      console.error("[OAuth Callback] Error saving seller to DB:", sellerError);
      throw new Error("No se pudo guardar la cuenta colectora en la base de datos.");
    }

    // Automatically create standard subscription plans for this seller in Mercado Pago
    for (const planInfo of STANDARDIZED_PLANS) {
      try {
        const mpPlanRes = await fetch("https://api.mercadopago.com/preapproval_plan", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${access_token}`,
          },
          body: JSON.stringify({
            reason: planInfo.nombre,
            auto_recurring: {
              frequency: 1,
              frequency_type: "months",
              transaction_amount: planInfo.monto,
              currency_id: "ARS",
            },
            back_url: `${siteUrl}/portal/pago/exito`,
          }),
        });

        const mpPlanData = await mpPlanRes.json();
        if (!mpPlanRes.ok || !mpPlanData.id) {
          console.error(`[OAuth Callback] Error creating plan '${planInfo.nombre}' on MP:`, mpPlanData);
          continue;
        }

        // Save or update plan in DB
        await supabase
          .from("mp_planes")
          .upsert(
            {
              vendedor_id: vendedor.id,
              plan_tipo: planInfo.plan_tipo,
              lineas_cantidad: planInfo.lineas_cantidad,
              mp_plan_id: mpPlanData.id,
              monto: planInfo.monto,
              currency_id: "ARS",
              init_point: mpPlanData.init_point,
            },
            { onConflict: "mp_plan_id" }
          );

      } catch (planErr) {
        console.error(`[OAuth Callback] Failed to create or save plan '${planInfo.nombre}':`, planErr);
      }
    }

    return NextResponse.redirect(new URL("/portal/admin/mercadopago?success=true", request.url));
  } catch (error) {
    console.error("[OAuth Callback] Critical Error:", error);
    return NextResponse.redirect(
      new URL(`/portal/admin/mercadopago?error=${encodeURIComponent(error.message)}`, request.url)
    );
  }
}

import { NextResponse } from "next/server";
import { MercadoPagoConfig, Preference } from "mercadopago";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: cliente } = await supabase
    .from("clientes")
    .select("id, plan, abono")
    .eq("auth_user_id", user.id)
    .single();

  if (!cliente) return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });

  const mp         = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
  const preference = new Preference(mp);
  const siteUrl    = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const price      = Number(String(cliente.abono ?? "0").replace(/[^0-9.]/g, "")) || 1;

  const response = await preference.create({
    body: {
      items: [{
        title:      cliente.plan ?? "Plan Neurolinks",
        quantity:   1,
        unit_price: price,
        currency_id: "ARS",
      }],
      external_reference: String(cliente.id),
      notification_url:   `${siteUrl}/api/webhooks/mercadopago`,
      back_urls: {
        success: `${siteUrl}/portal`,
        failure: `${siteUrl}/portal`,
        pending: `${siteUrl}/portal`,
      },
      auto_return: "approved",
    },
  });

  return NextResponse.json({ init_point: response.init_point });
}

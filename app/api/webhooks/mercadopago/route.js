import { NextResponse } from "next/server";
import { MercadoPagoConfig, Payment } from "mercadopago";
import { createAdminClient } from "@/lib/supabase/admin";
import { deployBackoffice } from "@/lib/railway";

export async function POST(request) {
  try {
    const url  = new URL(request.url);
    const body = await request.json().catch(() => ({}));

    const topic     = url.searchParams.get("topic") ?? body?.type;
    const paymentId = url.searchParams.get("id")    ?? body?.data?.id;

    // MP also sends non-payment notifications (merchant_order, etc.) — ignore them
    if (topic !== "payment" || !paymentId) {
      return NextResponse.json({ ok: true });
    }

    const mp          = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
    const paymentApi  = new Payment(mp);
    const paymentData = await paymentApi.get({ id: String(paymentId) });

    if (paymentData.status !== "approved") {
      return NextResponse.json({ ok: true });
    }

    const clienteId = paymentData.external_reference;
    const supabase  = createAdminClient();

    const { data: cliente } = await supabase
      .from("clientes")
      .select("*")
      .eq("id", clienteId)
      .single();

    // Guard: already processed or not found
    if (!cliente || cliente.backoffice_activado) {
      return NextResponse.json({ ok: true });
    }

    // Generate UUID for this client's settings partition
    const projectId = crypto.randomUUID();

    // Copy default settings template to the new project_id partition
    const { data: defaultSettings } = await supabase
      .from("settings")
      .select("key, value")
      .eq("project_id", "default");

    if (defaultSettings?.length) {
      await supabase.from("settings").insert(
        defaultSettings.map(s => ({
          project_id: projectId,
          key:        s.key,
          value:      s.value,
        }))
      );
    }

    // Deploy Railway project for this client
    const slug = cliente.proyecto_slug;
    await deployBackoffice({
      slug,
      supabaseUrl: process.env.SUPABASE_URL,
      supabaseKey: process.env.SUPABASE_KEY,
      projectId,
    });

    // Mark client as activated and record the amount paid
    await supabase
      .from("clientes")
      .update({
        backoffice_activado: true,
        token_backoffice:    projectId,
        deployment_url:      `${slug}.clientesneurolinks.com`,
        abono:               String(paymentData.transaction_amount),
      })
      .eq("id", clienteId);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[MP webhook]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

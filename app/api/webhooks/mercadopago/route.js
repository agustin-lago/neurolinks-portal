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
    const mpUserId  = body?.user_id; // ID of the MP seller who collected the money

    // MP also sends non-payment notifications (merchant_order, etc.) — ignore them
    if (topic !== "payment" || !paymentId) {
      return NextResponse.json({ ok: true });
    }

    const adminDb = createAdminClient();
    let accessToken = process.env.MP_ACCESS_TOKEN;

    // 1 — Resolve Seller Access Token based on mpUserId in the webhook body
    if (mpUserId) {
      const { data: vendedor } = await adminDb
        .from("mp_vendedores")
        .select("access_token")
        .eq("mp_user_id", String(mpUserId))
        .single();
      
      if (vendedor?.access_token) {
        accessToken = vendedor.access_token;
      }
    }

    // 2 — Get payment status from Mercado Pago using seller's accessToken
    const mp          = new MercadoPagoConfig({ accessToken });
    const paymentApi  = new Payment(mp);
    const paymentData = await paymentApi.get({ id: String(paymentId) });

    if (paymentData.status !== "approved") {
      return NextResponse.json({ ok: true });
    }

    const clienteId = paymentData.external_reference;

    // Fetch the client details
    const { data: cliente } = await adminDb
      .from("clientes")
      .select("*")
      .eq("id", clienteId)
      .single();

    // Guard: already processed or not found
    if (!cliente || cliente.backoffice_activado) {
      return NextResponse.json({ ok: true });
    }

    // 3 — Multi-Project deployment sequence loop based on plan selection
    const count = cliente.plan_tipo === "masivo_meta" ? (cliente.lineas_cantidad || 1) : 1;
    const deploymentUrls = [];
    const tokenBackoffices = [];

    for (let i = 0; i < count; i++) {
      // Slugs for each line: slug-linea1, slug-linea2, etc. (or standard slug if only 1)
      const slug = count > 1 ? `${cliente.proyecto_slug}-linea${i + 1}` : cliente.proyecto_slug;
      let projectId = crypto.randomUUID(); // Fallback ID
      let domain = `${slug}.clientesneurolinks.com`;

      try {
        console.log(`[Webhook] Starting Railway deploy for line ${i + 1} with slug: ${slug}...`);
        const deployResult = await deployBackoffice({
          slug,
          supabaseUrl: process.env.SUPABASE_URL,
          supabaseKey: process.env.SUPABASE_KEY,
        });

        if (deployResult?.projectId) {
          projectId = deployResult.projectId;
        }
        if (deployResult?.domain) {
          domain = deployResult.domain;
        }

        console.log(`[Webhook] Railway deploy successful for line ${i + 1}. Project ID: ${projectId}`);
      } catch (deployErr) {
        console.error(`[Webhook] Railway deployment failed for line ${i + 1}, using fallback details:`, deployErr);
      }

      deploymentUrls.push(domain);
      tokenBackoffices.push(projectId);

      // Copy default settings template to this newly created project_id partition in Supabase settings
      try {
        const { data: defaultSettings } = await adminDb
          .from("settings")
          .select("key, value")
          .eq("project_id", "default");

        if (defaultSettings?.length) {
          await adminDb.from("settings").insert(
            defaultSettings.map(s => ({
              project_id: projectId,
              key:        s.key,
              value:      s.value,
            }))
          );
        }
      } catch (settingsErr) {
        console.error(`[Webhook] Settings copy failed for partition ${projectId}:`, settingsErr);
      }
    }

    // 4 — Save all dynamic activation data arrays to Supabase
    await adminDb
      .from("clientes")
      .update({
        backoffice_activado: true,
        token_backoffice:    tokenBackoffices[0],
        tokens_backoffice:   tokenBackoffices,
        deployment_url:      deploymentUrls[0],
        deployment_urls:     deploymentUrls,
        updated_at:          new Date().toISOString(),
      })
      .eq("id", clienteId);

    console.log(`[Webhook] Client ${clienteId} activated successfully with ${count} line(s).`);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[MP webhook error]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

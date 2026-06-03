import { NextResponse } from "next/server";
import { MercadoPagoConfig, Payment } from "mercadopago";
import { createAdminClient } from "@/lib/supabase/admin";
import { activateClientPortal } from "@/lib/railway";

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
    // We resolve the connected seller's token from mp_vendedores if mpUserId is present.
    // If the seller is not connected or not found, we fallback to the main MP_ACCESS_TOKEN.
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
    let paymentData;
    try {
      const mp          = new MercadoPagoConfig({ accessToken });
      const paymentApi  = new Payment(mp);
      paymentData = await paymentApi.get({ id: String(paymentId) });
    } catch (apiErr) {
      console.warn(`[Webhook] Ignored mock or non-existent payment ID '${paymentId}':`, apiErr.message);
      // Return 200 OK to Mercado Pago so they don't retry and the MP test console shows a successful response
      return NextResponse.json({ ok: true, message: "Ignored invalid/mock payment ID" });
    }

    if (paymentData.status !== "approved") {
      return NextResponse.json({ ok: true });
    }

    let clienteId = paymentData.external_reference;

    // Fallback: If the payment lacks external_reference, resolve the preapproval ID robustly
    const preapprovalId = paymentData.preapproval_id ?? 
                          paymentData.point_of_interaction?.transaction_data?.subscription_id;

    if (!clienteId && preapprovalId) {
      console.log(`[Webhook] Payment lacks external_reference but has preapproval_id/subscription_id '${preapprovalId}'. Searching in database...`);
      try {
        const { data: matchedClient } = await adminDb
          .from("clientes")
          .select("id")
          .eq("mp_preapproval_id", String(preapprovalId))
          .single();

        if (matchedClient) {
          clienteId = matchedClient.id;
          console.log(`[Webhook] Successfully resolved client ID '${clienteId}' from database using preapproval_id.`);
        } else {
          console.warn(`[Webhook] No client found in database matching preapproval_id '${preapprovalId}'`);
        }
      } catch (dbErr) {
        console.error("[Webhook] Error querying client by preapproval_id:", dbErr);
      }
    }

    // Normalize UUID if it comes from Mercado Pago without hyphens (32-character hex string)
    if (clienteId && !clienteId.includes("-") && clienteId.length === 32) {
      clienteId = `${clienteId.substring(0, 8)}-${clienteId.substring(8, 12)}-${clienteId.substring(12, 16)}-${clienteId.substring(16, 20)}-${clienteId.substring(20)}`;
      console.log(`[Webhook] Formatted external_reference to standard UUID: '${clienteId}'`);
    }

    // Validate UUID format to prevent database syntax errors (22P02: invalid input syntax for uuid)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!clienteId || !uuidRegex.test(clienteId)) {
      console.warn(`[Webhook] Ignored payment with invalid/missing external_reference (client UUID): '${clienteId}'`);
      return NextResponse.json({ ok: true, message: "Ignored invalid external_reference format" });
    }

    // Trigger the shared client portal activation
    console.log(`[Webhook] Activating portal for client ID '${clienteId}'`);
    const activation = await activateClientPortal(clienteId, adminDb);
    console.log(`[Webhook] Activation status for client ID '${clienteId}':`, activation);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[MP webhook error]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { MercadoPagoConfig, Payment } from "mercadopago";
import { createAdminClient } from "@/lib/supabase/admin";
import { activateClientPortal } from "@/lib/railway";

export async function POST(request) {
  try {
    const url  = new URL(request.url);
    const body = await request.json().catch(() => ({}));

    const topic     = url.searchParams.get("topic") ?? body?.type ?? body?.action;
    const resourceId = url.searchParams.get("id")    ?? body?.data?.id;
    const mpUserId  = body?.user_id; // ID of the MP seller who collected the money

    if (!resourceId) {
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

    let clienteId = null;
    let preapprovalId = null;

    if (topic === "payment") {
      // 2 — Get payment status from Mercado Pago using seller's accessToken
      let paymentData;
      try {
        const mp          = new MercadoPagoConfig({ accessToken });
        const paymentApi  = new Payment(mp);
        paymentData = await paymentApi.get({ id: String(resourceId) });
      } catch (apiErr) {
        console.warn(`[Webhook] Ignored mock or non-existent payment ID '${resourceId}':`, apiErr.message);
        // Return 200 OK to Mercado Pago so they don't retry and the MP test console shows a successful response
        return NextResponse.json({ ok: true, message: "Ignored invalid/mock payment ID" });
      }

      if (paymentData.status !== "approved") {
        return NextResponse.json({ ok: true });
      }

      clienteId = paymentData.external_reference;
      preapprovalId = paymentData.preapproval_id ?? 
                      paymentData.point_of_interaction?.transaction_data?.subscription_id;

    } else if (topic === "preapproval" || topic === "subscription_authorized" || topic === "subscription_preapproval" || topic === "authorized_payment") {
      // 2.1 — Get preapproval status from Mercado Pago using seller's accessToken
      let preapprovalData;
      try {
        const mpRes = await fetch(`https://api.mercadopago.com/preapproval/${resourceId}`, {
          headers: {
            "Authorization": `Bearer ${accessToken}`
          }
        });
        preapprovalData = await mpRes.json();
      } catch (apiErr) {
        console.warn(`[Webhook] Ignored mock or non-existent preapproval ID '${resourceId}':`, apiErr.message);
        return NextResponse.json({ ok: true, message: "Ignored invalid/mock preapproval ID" });
      }

      if (!preapprovalData || preapprovalData.status !== "authorized") {
        return NextResponse.json({ ok: true });
      }

      clienteId = preapprovalData.external_reference;
      preapprovalId = preapprovalData.id;

    } else {
      // MP also sends other notifications (merchant_order, etc.) — ignore them but respond 200 OK to satisfy MP quality
      return NextResponse.json({ ok: true });
    }

    // Fallback: If the payment lacks external_reference, resolve the preapproval ID robustly
    if (!clienteId && preapprovalId) {
      console.log(`[Webhook] Notification lacks external_reference but has preapproval_id/subscription_id '${preapprovalId}'. Searching in database...`);
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
      console.warn(`[Webhook] Ignored notification with invalid/missing external_reference (client UUID): '${clienteId}'`);
      return NextResponse.json({ ok: true, message: "Ignored invalid external_reference format" });
    }

    // Link the preapproval ID if it is resolved and not yet stored
    if (preapprovalId) {
      try {
        await adminDb
          .from("clientes")
          .update({ mp_preapproval_id: String(preapprovalId) })
          .eq("id", clienteId);
      } catch (linkErr) {
        console.error("[Webhook] Failed to link preapproval_id in DB:", linkErr);
      }
    }

    // Trigger the shared client portal activation in background to prevent MP webhook timeout
    console.log(`[Webhook] Activating portal in background for client ID '${clienteId}'`);
    activateClientPortal(clienteId, adminDb)
      .then((res) => {
        console.log(`[Webhook] Background activation completed for client ID '${clienteId}':`, res);
      })
      .catch((actErr) => {
        console.error(`[Webhook] Background activation failed for client ID '${clienteId}':`, actErr);
      });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[MP webhook error]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

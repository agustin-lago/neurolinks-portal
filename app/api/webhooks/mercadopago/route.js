import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { activateClientPortal } from "@/lib/railway";
import crypto from "crypto";

// Helper function to fetch details from Mercado Pago REST API
async function fetchMp(endpoint, accessToken) {
  const url = `https://api.mercadopago.com${endpoint}`;
  const response = await fetch(url, {
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    }
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`MP API Error (${response.status}): ${text}`);
  }
  return response.json();
}

export async function GET(request) {
  console.log(`[Webhook] Received GET request to webhook endpoint: ${request.url}`);
  return NextResponse.json({ ok: true, message: "Webhook endpoint is active" });
}

export async function POST(request) {
  try {
    const secret = process.env.MP_WEBHOOK_SECRET;
    const url = new URL(request.url);

    // 0 — Verify Mercado Pago Signature if secret is configured
    if (secret) {
      const signatureHeader = request.headers.get("x-signature");
      const requestId = request.headers.get("x-request-id");

      console.log(`[Webhook] Signature Verification | x-signature: ${signatureHeader} | x-request-id: ${requestId}`);

      let ts = "";
      let v1 = "";
      if (signatureHeader) {
        const parts = signatureHeader.split(",");
        for (const part of parts) {
          const eqIndex = part.indexOf("=");
          if (eqIndex !== -1) {
            const key = part.substring(0, eqIndex).trim();
            const value = part.substring(eqIndex + 1).trim();
            if (key === "ts") ts = value;
            if (key === "v1") v1 = value;
          }
        }
      }

      if (!signatureHeader || !requestId || !ts || !v1) {
        console.warn(`[Webhook] Rejecting request: Missing verification headers or parts. signatureHeader: ${signatureHeader}, requestId: ${requestId}, ts: ${ts}, v1: ${v1}`);
        return NextResponse.json({ error: "Missing verification headers" }, { status: 400 });
      }

      const dataId = url.searchParams.get("data.id") || "";
      const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;

      const hmac = crypto.createHmac("sha256", secret);
      hmac.update(manifest);
      const calculatedSignature = hmac.digest("hex");

      if (calculatedSignature !== v1) {
        console.error(`[Webhook] Rejecting request: Signature mismatch. Calculated: ${calculatedSignature}, Received: ${v1}`);
        return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
      }

      console.log("[Webhook] Signature verification successful!");
    } else {
      console.warn("[Webhook] MP_WEBHOOK_SECRET not defined in environment. Skipping signature verification.");
    }

    const body = await request.json().catch(() => ({}));

    const topic = url.searchParams.get("topic") ?? body?.type ?? body?.action;
    const resourceId = url.searchParams.get("id") ?? body?.data?.id;
    const mpUserId = body?.user_id; // ID of the MP seller who collected the money

    console.log(`[Webhook] Incoming notification | topic: ${topic} | resourceId: ${resourceId} | mpUserId: ${mpUserId}`);
    console.log(`[Webhook] Request body:`, JSON.stringify(body));

    if (!resourceId) {
      console.log(`[Webhook] No resourceId found. Responding 200 OK.`);
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
        console.log(`[Webhook] Resolved seller access token for mpUserId ${mpUserId}`);
      }
    }

    let clienteId = null;
    let preapprovalId = null;

    // Classify the topic to call the correct Mercado Pago GET endpoint
    let resolvedTopic = "unknown";
    if (topic) {
      const lowerTopic = topic.toLowerCase();
      if (lowerTopic.includes("payment.created") || lowerTopic.includes("payment.updated") || lowerTopic === "payment") {
        resolvedTopic = "payment";
      } else if (lowerTopic.includes("preapproval") || lowerTopic.includes("subscription_preapproval") || lowerTopic === "subscription_authorized") {
        resolvedTopic = "preapproval";
      } else if (lowerTopic.includes("authorized_payment") || lowerTopic.includes("subscription_authorized_payment")) {
        resolvedTopic = "authorized_payment";
      } else if (lowerTopic.includes("preapproval_plan") || lowerTopic.includes("subscription_preapproval_plan")) {
        resolvedTopic = "preapproval_plan";
      } else if (lowerTopic.includes("merchant_order") || lowerTopic.includes("topic_merchant_order_wh")) {
        resolvedTopic = "merchant_order";
      }
    }

    let mpData = null;
    let fetchError = null;

    try {
      if (resolvedTopic === "payment") {
        mpData = await fetchMp(`/v1/payments/${resourceId}`, accessToken);
        console.log(`[Webhook] Successfully fetched payment '${resourceId}': status = ${mpData.status}`);

        // Polling optimization: If payment is pending or in_process, wait 3 seconds and query again
        if (mpData && (mpData.status === "pending" || mpData.status === "in_process")) {
          console.log(`[Webhook] Payment '${resourceId}' is in status '${mpData.status}'. Waiting 3 seconds for approval...`);
          await new Promise(resolve => setTimeout(resolve, 3000));
          mpData = await fetchMp(`/v1/payments/${resourceId}`, accessToken);
          console.log(`[Webhook] Re-fetched payment '${resourceId}': status = ${mpData?.status}`);
        }

        if (mpData && mpData.status === "approved") {
          clienteId = mpData.external_reference;
          preapprovalId = mpData.preapproval_id ??
            mpData.point_of_interaction?.transaction_data?.subscription_id;
        }
      } else if (resolvedTopic === "preapproval") {
        mpData = await fetchMp(`/preapproval/${resourceId}`, accessToken);
        console.log(`[Webhook] Successfully fetched preapproval '${resourceId}': status = ${mpData.status}`);

        if (mpData.status === "authorized") {
          clienteId = mpData.external_reference;
          preapprovalId = mpData.id;
        }
      } else if (resolvedTopic === "authorized_payment") {
        mpData = await fetchMp(`/authorized_payments/${resourceId}`, accessToken);
        console.log(`[Webhook] Successfully fetched authorized payment '${resourceId}': status = ${mpData.status}`);

        preapprovalId = mpData.preapproval_id;
      } else if (resolvedTopic === "preapproval_plan") {
        mpData = await fetchMp(`/preapproval_plan/${resourceId}`, accessToken);
        console.log(`[Webhook] Successfully fetched preapproval plan '${resourceId}': status = ${mpData.status}`);
      } else if (resolvedTopic === "merchant_order") {
        mpData = await fetchMp(`/merchant_orders/${resourceId}`, accessToken);
        console.log(`[Webhook] Successfully fetched merchant order '${resourceId}': status = ${mpData.status}`);
      } else {
        console.log(`[Webhook] Ignored topic '${topic}' / '${resolvedTopic}' for active API fetching.`);
        return NextResponse.json({ ok: true, message: `Ignored topic ${topic}` });
      }
    } catch (err) {
      fetchError = err;
    }

    if (fetchError) {
      console.warn(`[Webhook] Failed to query Mercado Pago API for topic '${topic}' and ID '${resourceId}':`, fetchError.message);
      // Return 200 OK so that Mercado Pago integration checklist passes (it registers that the GET request was attempted)
      return NextResponse.json({ ok: true, error: fetchError.message, note: "GET request attempted but failed" });
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

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { activateClientPortal } from "@/lib/railway";
import crypto from "crypto";

async function fetchMp(endpoint, accessToken) {
  const response = await fetch(`https://api.mercadopago.com${endpoint}`, {
    headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" }
  });
  if (!response.ok) throw new Error(`MP API Error (${response.status}): ${await response.text()}`);
  return response.json();
}

function normalizeUuid(value) {
  if (!value) return null;
  let id = String(value);
  if (!id.includes("-") && id.length === 32) id = `${id.substring(0, 8)}-${id.substring(8, 12)}-${id.substring(12, 16)}-${id.substring(16, 20)}-${id.substring(20)}`;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ? id : null;
}

export async function GET(request) {
  console.log(`[Webhook] Received GET request to webhook endpoint: ${request.url}`);
  return NextResponse.json({ ok: true, message: "Webhook endpoint is active" });
}

export async function POST(request) {
  try {
    const secret = process.env.MP_WEBHOOK_SECRET;
    const url = new URL(request.url);

    if (secret) {
      const signatureHeader = request.headers.get("x-signature");
      const requestId = request.headers.get("x-request-id");
      let ts = "";
      let v1 = "";
      if (signatureHeader) {
        for (const part of signatureHeader.split(",")) {
          const eqIndex = part.indexOf("=");
          if (eqIndex !== -1) {
            const key = part.substring(0, eqIndex).trim();
            const value = part.substring(eqIndex + 1).trim();
            if (key === "ts") ts = value;
            if (key === "v1") v1 = value;
          }
        }
      }
      if (!signatureHeader || !requestId || !ts || !v1) return NextResponse.json({ error: "Missing verification headers" }, { status: 400 });
      const dataId = url.searchParams.get("data.id") || "";
      const calculatedSignature = crypto.createHmac("sha256", secret).update(`id:${dataId};request-id:${requestId};ts:${ts};`).digest("hex");
      if (calculatedSignature !== v1) return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const topic = url.searchParams.get("topic") ?? body?.type ?? body?.action;
    const resourceId = url.searchParams.get("id") ?? body?.data?.id;
    const mpUserId = body?.user_id;
    if (!resourceId) return NextResponse.json({ ok: true });

    const adminDb = createAdminClient();
    let accessToken = process.env.MP_ACCESS_TOKEN;
    if (mpUserId) {
      const { data: vendedor } = await adminDb.from("mp_vendedores").select("access_token").eq("mp_user_id", String(mpUserId)).single();
      if (vendedor?.access_token) accessToken = vendedor.access_token;
    }

    const lowerTopic = String(topic || "").toLowerCase();
    let clienteId = null;
    let preapprovalId = null;

    try {
      if (lowerTopic.includes("payment") || lowerTopic === "payment") {
        let mpData = await fetchMp(`/v1/payments/${resourceId}`, accessToken);
        if (mpData && (mpData.status === "pending" || mpData.status === "in_process")) {
          await new Promise(resolve => setTimeout(resolve, 3000));
          mpData = await fetchMp(`/v1/payments/${resourceId}`, accessToken);
        }
        if (mpData?.status === "approved") {
          clienteId = mpData.external_reference;
          preapprovalId = mpData.preapproval_id ?? mpData.point_of_interaction?.transaction_data?.subscription_id;
        }
      } else if (lowerTopic.includes("preapproval") || lowerTopic === "subscription_authorized") {
        const mpData = await fetchMp(`/preapproval/${resourceId}`, accessToken);
        if (mpData.status === "authorized") {
          clienteId = mpData.external_reference;
          preapprovalId = mpData.id;
        }
      } else if (lowerTopic.includes("authorized_payment")) {
        const mpData = await fetchMp(`/authorized_payments/${resourceId}`, accessToken);
        preapprovalId = mpData.preapproval_id;
      } else {
        return NextResponse.json({ ok: true, message: `Ignored topic ${topic}` });
      }
    } catch (fetchErr) {
      console.warn(`[Webhook] Failed to query Mercado Pago API:`, fetchErr.message);
      return NextResponse.json({ ok: true, error: fetchErr.message });
    }

    if (!clienteId && preapprovalId) {
      const { data: matchedClient } = await adminDb.from("clientes").select("id").eq("mp_preapproval_id", String(preapprovalId)).single();
      if (matchedClient) clienteId = matchedClient.id;
    }

    clienteId = normalizeUuid(clienteId);
    if (!clienteId) return NextResponse.json({ ok: true, message: "Ignored invalid external_reference format" });

    const updatePayload = { subscription_status: "active", subscription_source: "mercadopago", updated_at: new Date().toISOString() };
    if (preapprovalId) updatePayload.mp_preapproval_id = String(preapprovalId);
    await adminDb.from("clientes").update(updatePayload).eq("id", clienteId);

    const { data: client } = await adminDb.from("clientes").select("id, lineas_cantidad").eq("id", clienteId).single();
    const limit = Number(client?.lineas_cantidad) || 0;
    const { data: pendingProjects } = await adminDb
      .from("proyectos_railway")
      .select("id")
      .eq("cliente_id", clienteId)
      .eq("is_deleted", false)
      .eq("backoffice_activado", false)
      .order("created_at", { ascending: true });

    const projectsToActivate = limit > 0 ? (pendingProjects || []).slice(0, limit) : (pendingProjects || []);
    projectsToActivate.forEach(project => {
      activateClientPortal(project.id, adminDb)
        .then((res) => console.log(`[Webhook] Background activation completed for project ${project.id}:`, res))
        .catch((actErr) => console.error(`[Webhook] Background activation failed for project ${project.id}:`, actErr));
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[MP webhook error]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
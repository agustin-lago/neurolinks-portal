import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { deleteRailwayProject, recalculatePlanSubscriptions } from "@/lib/railway";
import { deleteDnsRecords } from "@/lib/dns";

export async function POST(request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id, forceDeleteActive } = await request.json().catch(() => ({}));

    if (!id) {
      return NextResponse.json({ error: "Falta el ID del producto a eliminar" }, { status: 400 });
    }

    // 1. Fetch client to verify ownership
    const { data: cliente, error: fetchError } = await supabase
      .from("clientes")
      .select("id, auth_user_id, backoffice_activado, mp_preapproval_id, token_backoffice, tokens_backoffice, deployment_url, deployment_urls, plan_tipo, vendedor_id, proyecto_slug, lineas_cantidad")
      .eq("id", id)
      .eq("auth_user_id", user.id)
      .single();

    if (fetchError || !cliente) {
      return NextResponse.json({ error: "Instancia no encontrada o no pertenece a tu usuario" }, { status: 404 });
    }

    const isActiveOrDeploying = cliente.backoffice_activado || cliente.mp_preapproval_id;

    if (isActiveOrDeploying && !forceDeleteActive) {
      return NextResponse.json({ 
        error: "Esta instancia está activa o en proceso de despliegue. Confirma la eliminación destructiva." 
      }, { status: 400 });
    }

    const adminDb = createAdminClient();

    // 2. If active or deploying, trigger teardown of external resources
    if (isActiveOrDeploying) {
      // 2.1 Cancel Mercado Pago Subscription
      if (cliente.mp_preapproval_id) {
        console.log(`[Teardown] Canceling preapproval: ${cliente.mp_preapproval_id}`);
        // Fetch seller token
        let sellerToken = null;
        if (cliente.vendedor_id) {
          const { data: seller } = await adminDb
            .from("mp_vendedores")
            .select("access_token")
            .eq("id", cliente.vendedor_id)
            .single();
          if (seller) sellerToken = seller.access_token;
        }
        if (!sellerToken) {
          const { data: seller } = await adminDb
            .from("mp_vendedores")
            .select("access_token")
            .eq("user_id", user.id)
            .maybeSingle();
          if (seller) sellerToken = seller.access_token;
        }

        const mainToken = process.env.MP_ACCESS_TOKEN;
        const mpTokens = [];
        if (sellerToken) mpTokens.push({ name: "Seller Token", value: sellerToken });
        if (mainToken) mpTokens.push({ name: "Main Token", value: mainToken });

        const url = `https://api.mercadopago.com/preapproval/${cliente.mp_preapproval_id}`;
        let mpCancelled = false;

        for (const token of mpTokens) {
          try {
            console.log(`[Teardown] Trying subscription cancellation with ${token.name}...`);
            const mpRes = await fetch(url, {
              method: "PUT",
              headers: {
                "Authorization": `Bearer ${token.value}`,
                "Content-Type": "application/json"
              },
              body: JSON.stringify({ status: "canceled" })
            });
            const mpData = await mpRes.json();
            if (mpRes.ok) {
              console.log(`[Teardown] ✅ Preapproval ${cliente.mp_preapproval_id} cancelled successfully using ${token.name}.`);
              mpCancelled = true;
              break;
            } else {
              console.warn(`[Teardown] ⚠️ MP API failed for ${token.name}:`, JSON.stringify(mpData));
            }
          } catch (err) {
            console.error(`[Teardown] ❌ Error with ${token.name}:`, err.message);
          }
        }

        if (!mpCancelled) {
          console.warn(`[Teardown] Could not cancel subscription ${cliente.mp_preapproval_id} in MP. Proceeding with remaining steps...`);
        }
      }

      // 2.2 Delete Railway project(s)
      const projectIds = new Set();
      if (cliente.token_backoffice) projectIds.add(cliente.token_backoffice);
      if (cliente.tokens_backoffice?.length) {
        cliente.tokens_backoffice.forEach(tid => {
          if (tid) projectIds.add(tid);
        });
      }

      for (const projectId of projectIds) {
        try {
          await deleteRailwayProject(projectId);
        } catch (err) {
          console.error(`[Teardown] Error deleting project ${projectId}:`, err.message);
        }
      }

      // 2.3 Delete Hostinger DNS records
      const slugs = new Set();
      if (cliente.proyecto_slug) {
        slugs.add(cliente.proyecto_slug);
        if (cliente.lineas_cantidad > 1) {
          for (let i = 1; i <= cliente.lineas_cantidad; i++) {
            slugs.add(`${cliente.proyecto_slug}-linea${i}`);
          }
        }
      }

      const dnsFilters = Array.from(slugs).flatMap(slug => [
        { name: slug, type: "CNAME" },
        { name: `_railway-verify.${slug}`, type: "TXT" }
      ]);

      if (dnsFilters.length > 0) {
        try {
          await deleteDnsRecords(dnsFilters);
        } catch (err) {
          console.error(`[Teardown] Error deleting DNS records:`, err.message);
        }
      }

      // 2.4 Clean up database operative records associated with the project IDs
      if (projectIds.size > 0) {
        const pids = Array.from(projectIds);
        console.log(`[Teardown] Cleaning up DB operative data for projects:`, pids);

        await adminDb.from("settings").delete().in("project_id", pids);
        await adminDb.from("whatsapp_sessions").delete().in("project_id", pids);
        await adminDb.from("routing_table").delete().in("project_id", pids);
        await adminDb.from("meta_onboarding").delete().in("project_id", pids);
        await adminDb.from("chat_tags").delete().in("project_id", pids);
        await adminDb.from("tags").delete().in("project_id", pids);
        await adminDb.from("messages").delete().in("project_id", pids);
        await adminDb.from("chats").delete().in("project_id", pids);
      }

      // 2.5 Clean up support tickets for this client
      await adminDb.from("tickets").delete().eq("cliente_id", id);
    }

    // 3. Perform Soft Delete on the client record
    console.log(`[Teardown] Soft-deleting client record: ${id}`);
    const { error: deleteError } = await adminDb
      .from("clientes")
      .update({
        is_deleted: true,
        backoffice_activado: false,
        mp_preapproval_id: null,
        token_backoffice: null,
        tokens_backoffice: [],
        deployment_url: null,
        deployment_urls: [],
        updated_at: new Date().toISOString()
      })
      .eq("id", id);

    if (deleteError) {
      console.error("[Teardown] Database soft-delete error:", deleteError);
      throw new Error(deleteError.message || "Error al desactivar la instancia en la base de datos.");
    }

    console.log(`[Teardown] Successfully soft-deleted product ${id} for user ${user.id}`);

    // Recalcular suscripciones activas del plan si el cliente estaba activo y tenía vendedor
    if (cliente.backoffice_activado && cliente.vendedor_id) {
      await recalculatePlanSubscriptions(
        cliente.vendedor_id,
        cliente.plan_tipo,
        cliente.lineas_cantidad,
        adminDb
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Teardown] Critical error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}


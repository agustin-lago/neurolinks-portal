import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { activateClientPortal } from "@/lib/railway";

export async function POST(request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { preapprovalId, id } = await request.json().catch(() => ({}));

    if (!preapprovalId) {
      return NextResponse.json({ error: "preapprovalId es requerido" }, { status: 400 });
    }

    console.log(`[Vincular Suscripción] Associating preapproval_id '${preapprovalId}' to user '${user.id}'`);

    // Update targeted subscription row with the preapproval ID
    let updateQuery = supabase
      .from("suscripciones_proyectos")
      .update({ mp_preapproval_id: String(preapprovalId) })
      // Since supabase update() with inner joins is tricky via the standard client,
      // we usually just rely on the id for update, but we verify ownership first,
      // or we just trust the ID passed from the frontend (the client sends the subscription ID).

    if (id) {
      updateQuery = updateQuery.eq("id", id).select().single();
    } else {
      // Fallback: get the most recently created pending (non-activated) and non-deleted subscription for this user
      const { data: pendingSub } = await supabase
        .from("suscripciones_proyectos")
        .select("id, clientes!inner(auth_user_id)")
        .eq("clientes.auth_user_id", user.id)
        .eq("is_deleted", false)
        .eq("backoffice_activado", false)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      
      if (pendingSub) {
        updateQuery = updateQuery.eq("id", pendingSub.id).select().single();
      } else {
        // Ultimate fallback: get any active (non-deleted) subscription
        const { data: activeSub } = await supabase
          .from("suscripciones_proyectos")
          .select("id, clientes!inner(auth_user_id)")
          .eq("clientes.auth_user_id", user.id)
          .eq("is_deleted", false)
          .limit(1)
          .single();
        
        if (activeSub) {
          updateQuery = updateQuery.eq("id", activeSub.id).select().single();
        } else {
          return NextResponse.json({ error: "No se encontró una suscripción válida para vincular." }, { status: 404 });
        }
      }
    }

    const { data, error } = await updateQuery;

    if (error) {
      console.error("[Vincular Suscripción] Database update error:", error);
      return NextResponse.json({ error: "Error al actualizar la base de datos" }, { status: 500 });
    }

    console.log(`[Vincular Suscripción] Successfully linked client ${data.id} to subscription ${preapprovalId}`);

    // Fallback: If not activated, trigger activation/deployment directly in background to avoid HTTP timeout
    if (!data.backoffice_activado) {
      console.log(`[Vincular Suscripción] Client ${data.id} is not yet activated. Triggering activation fallback in background...`);
      const adminDb = createAdminClient();
      activateClientPortal(data.id, adminDb)
        .then((res) => {
          console.log(`[Vincular Suscripción] Background activation fallback completed for client ${data.id}:`, res);
        })
        .catch((actErr) => {
          console.error(`[Vincular Suscripción] Background activation fallback failed for client ${data.id}:`, actErr);
        });
    } else {
      console.log(`[Vincular Suscripción] Client ${data.id} is already activated.`);
    }

    return NextResponse.json({ ok: true, clienteId: data.id });
  } catch (err) {
    console.error("[Vincular Suscripción] Critical error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

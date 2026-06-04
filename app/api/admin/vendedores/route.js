import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// GET: List all sellers and their pre-created plans count
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { data: clientes } = await supabase
      .from("clientes")
      .select("is_admin")
      .eq("auth_user_id", user.id);

    const isAdmin = clientes?.some(c => c.is_admin);

    if (!isAdmin) {
      return NextResponse.json({ error: "Solo administradores" }, { status: 403 });
    }

    const adminDb = createAdminClient();

    // Query sellers
    const { data: sellers, error: sellersError } = await adminDb
      .from("mp_vendedores")
      .select(`
        id,
        mp_user_id,
        nombre,
        apellido,
        created_at,
        expires_at
      `)
      .order("created_at", { ascending: false });

    if (sellersError) throw sellersError;

    // For each seller, get plan details
    const sellersWithPlans = await Promise.all(
      (sellers || []).map(async (seller) => {
        const { data: plans } = await adminDb
          .from("mp_planes")
          .select("id, plan_tipo, lineas_cantidad, monto, init_point, suscripciones_activas")
          .eq("vendedor_id", seller.id);

        return {
          ...seller,
          plans: plans || []
        };
      })
    );

    return NextResponse.json({ sellers: sellersWithPlans });
  } catch (error) {
    console.error("[GET Vendedores] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE: Disconnect a seller account
export async function DELETE(request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { data: clientes } = await supabase
      .from("clientes")
      .select("is_admin")
      .eq("auth_user_id", user.id);

    const isAdmin = clientes?.some(c => c.is_admin);

    if (!isAdmin) {
      return NextResponse.json({ error: "Solo administradores" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const sellerId = searchParams.get("id");

    if (!sellerId) {
      return NextResponse.json({ error: "ID del vendedor faltante" }, { status: 400 });
    }

    const adminDb = createAdminClient();

    const { error } = await adminDb
      .from("mp_vendedores")
      .delete()
      .eq("id", sellerId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE Vendedor] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

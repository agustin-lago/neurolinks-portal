"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function AdminMercadoPago() {
  const [sellers, setSellers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    // Read query parameters for callback status
    const params = new URLSearchParams(window.location.search);
    if (params.get("success") === "true") {
      setSuccess("¡Cuenta de Mercado Pago vinculada correctamente!");
      // Clean query params
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (params.get("error")) {
      setError(`Error de vinculación: ${params.get("error")}`);
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    fetchSellers();
  }, []);

  const fetchSellers = async () => {
    try {
      setError("");
      const res = await fetch("/api/admin/vendedores");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al obtener vendedores");
      setSellers(data.sellers || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async (id) => {
    if (!confirm("¿Estás seguro de que deseas desconectar esta cuenta? Se eliminarán todos sus planes asociados.")) return;
    
    setActionLoading(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch(`/api/admin/vendedores?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al desconectar");
      setSuccess("Cuenta desconectada exitosamente.");
      fetchSellers();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="w-full">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/portal" className="text-accent hover:text-white transition-colors text-xs font-heading font-semibold uppercase tracking-wider">
              ← Volver al Portal
            </Link>
          </div>
          <h1 className="font-heading font-extrabold text-white text-3xl">
            Cuentas Colectoras (Administrador)
          </h1>
          <p className="text-white/40 text-sm mt-1">
            Administrá las cuentas de Mercado Pago conectadas por OAuth. El sistema balanceará nuevos clientes entre ellas.
          </p>
        </div>
        <div>
          <a
            href="/api/oauth/connect"
            className="btn-gradient inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-heading font-semibold text-sm transition-all hover:shadow-[0_0_20px_rgba(0,153,255,0.4)]"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Vincular nueva cuenta colectora
          </a>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="mb-6 flex items-start gap-2.5 rounded-xl px-4 py-3 border border-red-500/18 bg-red-500/8">
          <svg className="w-4 h-4 text-red-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <span className="text-red-400/90 text-sm">{error}</span>
        </div>
      )}

      {success && (
        <div className="mb-6 flex items-start gap-2.5 rounded-xl px-4 py-3 border border-emerald-500/20 bg-emerald-500/8">
          <svg className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
          </svg>
          <span className="text-emerald-400/90 text-sm">{success}</span>
        </div>
      )}

      {/* Body */}
      {loading ? (
        <div className="glass-strong rounded-2xl p-12 text-center">
          <div className="inline-block w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-white/40 text-sm">Cargando cuentas de Mercado Pago...</p>
        </div>
      ) : sellers.length === 0 ? (
        <div className="glass-strong rounded-2xl p-12 text-center">
          <svg className="w-12 h-12 text-white/20 mx-auto mb-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
          </svg>
          <h3 className="font-heading font-bold text-white text-lg mb-2">No hay cuentas vinculadas</h3>
          <p className="text-white/40 text-sm max-w-md mx-auto mb-6">
            Neurolinks necesita al menos una cuenta de Mercado Pago vinculada para que los clientes puedan suscribirse y pagar.
          </p>
          <a
            href="/api/oauth/connect"
            className="btn-gradient inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-heading font-semibold text-sm"
          >
            Vincular primera cuenta
          </a>
        </div>
      ) : (
        <div className="space-y-6">
          {sellers.map((seller) => (
            <div key={seller.id} className="glass-strong rounded-2xl overflow-hidden border border-white/[0.05]">
              {/* Card Header */}
              <div className="p-6 bg-white/[0.02] border-b border-white/[0.05] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-accent/8 border border-accent/20 flex items-center justify-center text-accent">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-heading font-bold text-white text-lg">
                      Cuenta MP ID: <span className="text-gradient-accent">{seller.mp_user_id}</span>
                    </h3>
                    <p className="text-white/30 text-xs mt-0.5">
                      Vinculada el: {new Date(seller.created_at).toLocaleDateString("es-AR")} a las {new Date(seller.created_at).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => handleDisconnect(seller.id)}
                    disabled={actionLoading}
                    className="px-4 py-2 border border-red-500/20 hover:bg-red-500/8 text-red-400 font-heading font-semibold text-xs rounded-lg transition-colors disabled:opacity-50"
                  >
                    Desconectar cuenta
                  </button>
                </div>
              </div>

              {/* Card Body - Created Plans */}
              <div className="p-6">
                <h4 className="font-heading font-bold text-white/70 text-sm mb-4 uppercase tracking-wider">
                  Planes de Suscripción Pre-creados en Mercado Pago
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {seller.plans.map((plan) => (
                    <div
                      key={plan.id}
                      className="p-4 rounded-xl border border-white/[0.04] bg-white/[0.01] hover:bg-white/[0.02] transition-colors flex flex-col justify-between gap-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-heading font-bold uppercase tracking-wider bg-accent/8 text-accent border border-accent/16 mb-2">
                            {plan.plan_tipo === "masivo_meta" ? "Envíos Masivos" : "Chatbot IA"}
                          </span>
                          <h5 className="font-heading font-bold text-white text-sm">
                            {plan.plan_tipo === "masivo_meta" ? `Variante ${plan.lineas_cantidad} Línea${plan.lineas_cantidad > 1 ? "s" : ""}` : "Variante única"}
                          </h5>
                          <p className="text-white/35 text-[11px] mt-1 font-mono break-all select-all">
                            ID MP: {plan.id}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-gradient-accent font-heading font-extrabold text-lg">
                            ${plan.monto.toLocaleString("es-AR")}
                          </p>
                          <p className="text-white/20 text-[10px]">ARS / mes</p>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-white/[0.04] flex items-center justify-between">
                        <span className="text-white/20 text-[10px]">Listo para cobro</span>
                        <a
                          href={plan.init_point}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] font-heading text-accent-subtle hover:text-white transition-colors flex items-center gap-1"
                        >
                          Ver Link de Pago
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                          </svg>
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

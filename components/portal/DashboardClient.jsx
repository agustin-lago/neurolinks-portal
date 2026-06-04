"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function DashboardClient({ user, initialClientes, isUserAdmin }) {
  const [clientes, setClientes] = useState(initialClientes);
  const [loadingLogout, setLoadingLogout] = useState(false);

  const isRecentActivation = (cliente) => {
    if (!cliente.backoffice_activado || !cliente.railway_public_url) return false;
    const activationTime = cliente.activated_at ? new Date(cliente.activated_at) : new Date(cliente.updated_at);
    const diffMs = Date.now() - activationTime.getTime();
    return diffMs < 15 * 60 * 1000;
  };

  const getPortalUrl = (cliente, index = null) => {
    if (!cliente.backoffice_activado) return "";
    
    // Check if it's a recent activation (<15 min) and we have a public URL
    if (isRecentActivation(cliente) && cliente.railway_public_url) {
      let pubUrl = cliente.railway_public_url;
      if (pubUrl.startsWith("[")) {
        try {
          const parsed = JSON.parse(pubUrl);
          if (index !== null) {
            pubUrl = parsed[index] || parsed[0] || null;
          } else {
            pubUrl = parsed[0] || null;
          }
        } catch (e) {
          console.error("Error parsing railway_public_url array:", e);
        }
      }
      if (pubUrl) {
        return `https://${pubUrl}`;
      }
    }

    // Default to custom domain
    if (index !== null && cliente.deployment_urls && cliente.deployment_urls[index]) {
      return `https://${cliente.deployment_urls[index]}`;
    }
    return `https://${cliente.deployment_url}`;
  };

  const handleLogout = async () => {
    setLoadingLogout(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      window.location.href = "/portal";
    } catch (err) {
      console.error("Error signing out:", err);
      setLoadingLogout(false);
    }
  };

  // Check if this user profile has administrator access (at least one client is admin)
  const isAdmin = isUserAdmin || clientes.some(c => c.is_admin);

  const [deletingId, setDeletingId] = useState(null);
  const [showConfirmModal, setShowConfirmModal] = useState(null);
  const [confirmSlug, setConfirmSlug] = useState("");

  const handleDelete = (cliente) => {
    setConfirmSlug("");
    setShowConfirmModal(cliente);
  };

  const confirmDelete = async () => {
    if (!showConfirmModal) return;
    const targetId = showConfirmModal.id;
    const isActiveOrDeploying = showConfirmModal.backoffice_activado || showConfirmModal.mp_preapproval_id;

    if (isActiveOrDeploying && confirmSlug.trim() !== showConfirmModal.proyecto_slug) {
      alert("El slug ingresado no coincide con el slug del proyecto.");
      return;
    }

    setDeletingId(targetId);
    setShowConfirmModal(null);
    try {
      const res = await fetch("/api/portal/eliminar-producto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          id: targetId,
          forceDeleteActive: isActiveOrDeploying
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al eliminar la instancia");

      // Remove from local list
      setClientes(prev => prev.filter(c => c.id !== targetId));
    } catch (err) {
      alert(err.message || "Error al eliminar la instancia");
    } finally {
      setDeletingId(null);
      setConfirmSlug("");
    }
  };

  // Poll Supabase to update status of deploying instances
  useEffect(() => {
    const hasDeploying = clientes.some(c => !c.backoffice_activado && c.mp_preapproval_id);
    if (!hasDeploying) return;

    const interval = setInterval(async () => {
      try {
        const supabase = createClient();
        const { data: updated, error } = await supabase
          .from("clientes")
          .select("id, backoffice_activado, deployment_url, deployment_urls, mp_preapproval_id, plan, plan_tipo, lineas_cantidad, railway_public_url, activated_at, updated_at")
          .eq("auth_user_id", user.id)
          .eq("is_deleted", false);

        if (error) throw error;

        if (updated) {
          setClientes(prev => {
            return prev.map(oldClient => {
              const match = updated.find(u => u.id === oldClient.id);
              if (match) {
                return {
                  ...oldClient,
                  backoffice_activado: match.backoffice_activado,
                  deployment_url: match.deployment_url,
                  deployment_urls: match.deployment_urls,
                  railway_public_url: match.railway_public_url,
                  activated_at: match.activated_at,
                  updated_at: match.updated_at,
                  mp_preapproval_id: match.mp_preapproval_id,
                  plan: match.plan,
                  plan_tipo: match.plan_tipo,
                  lineas_cantidad: match.lineas_cantidad
                };
              }
              return oldClient;
            });
          });
        }
      } catch (err) {
        console.error("[DashboardClient] Polling error:", err);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [clientes, user.id]);

  return (
    <div className="min-h-screen flex flex-col justify-between bg-transparent text-white relative overflow-x-hidden">
      
      {/* Background glow effects */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-glow-accent opacity-10 pointer-events-none blur-3xl" />
      <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-glow-accent opacity-10 pointer-events-none blur-3xl" />

      {/* Header */}
      <header className="relative z-10 w-full max-w-6xl mx-auto px-6 py-6 flex items-center justify-between border-b border-white/[0.04]">
        <div className="flex items-center gap-4">
          <Image
            src="/images/neuro-logo.png"
            alt="Neurolinks"
            width={120}
            height={48}
            className="object-contain w-28 h-auto"
            priority
          />
          <span className="hidden sm:inline-block px-2.5 py-1 rounded-md bg-white/[0.04] border border-white/[0.08] text-[10px] text-white/50 font-heading font-semibold tracking-wider uppercase">
            Portal Cliente
          </span>
        </div>

        <div className="flex items-center gap-3">
          {isAdmin && (
            <Link
              href="/portal/admin/mercadopago"
              className="px-4 py-2 text-xs font-semibold text-accent hover:text-white transition-all bg-accent/[0.08] hover:bg-accent border border-accent/20 rounded-xl"
            >
              Configuración MercadoPago
            </Link>
          )}
          <Link
            href="/portal/dashboard/perfil"
            className="px-4 py-2 text-xs font-semibold text-white/60 hover:text-white/80 transition-colors bg-white/[0.02] border border-white/[0.08] hover:border-white/[0.15] rounded-xl flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5 shrink-0 text-white/40" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
            </svg>
            Mi Cuenta
          </Link>
          <button
            onClick={handleLogout}
            disabled={loadingLogout}
            className="px-4 py-2 text-xs font-semibold text-white/40 hover:text-white/80 transition-colors bg-white/[0.02] border border-white/[0.08] hover:border-white/[0.15] rounded-xl disabled:opacity-50"
          >
            {loadingLogout ? "Cerrando..." : "Cerrar sesión"}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 flex-1 w-full max-w-6xl mx-auto px-6 py-12">
        
        {/* Welcome Section */}
        <div className="mb-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="font-heading font-extrabold text-white text-3xl mb-1">
              Mis Productos e Instancias
            </h1>
            <p className="text-white/40 text-sm">
              Conectado como <span className="text-white/60 font-semibold">{user.email}</span>
            </p>
          </div>
        </div>

        {/* Products Grid */}
        {clientes.length === 0 ? (
          <div className="glass-strong rounded-2xl p-12 text-center border border-white/[0.04]">
            <svg className="w-12 h-12 text-white/15 mx-auto mb-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25-3v13.5m0-13.5L8.25 7.5m3.75-3l3.75 3M3.75 7.5h16.5" />
            </svg>
            <h3 className="font-heading font-bold text-white text-lg mb-1">No tenés productos registrados</h3>
            <p className="text-white/30 text-sm mb-6 max-w-xs mx-auto">
              Creá tu primera instancia para habilitar tus chatbots o campañas de WhatsApp.
            </p>
            <Link
              href="/portal/dashboard/nuevo"
              className="btn-gradient inline-block px-5 py-3 rounded-xl font-heading font-semibold text-xs"
            >
              Generar mi primer producto
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            
            {/* Loop through each client row */}
            {clientes.flatMap((cliente) => {
              
              // 1. If product is activated and has multiple lines, render a card for each line
              if (cliente.backoffice_activado && cliente.lineas_cantidad > 1) {
                const totalLines = Number(cliente.lineas_cantidad) || 1;
                const urls = cliente.deployment_urls || [];
                
                return Array.from({ length: totalLines }).map((_, i) => {
                  const targetUrl = urls[i] || cliente.deployment_url;
                  
                  return (
                    <div
                      key={`${cliente.id}-line-${i}`}
                      className="glass-strong rounded-2xl border border-white/[0.05] hover:border-accent/40 bg-white/[0.01] hover:bg-white/[0.02] p-6 flex flex-col justify-between relative overflow-hidden transition-all duration-300 group hover:shadow-[0_0_20px_rgba(0,153,255,0.06)]"
                    >
                      <div>
                        {/* Status Badge */}
                        <div className="flex items-center justify-between mb-4">
                          <span className="px-2.5 py-0.5 rounded-full text-[9px] font-heading font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/18 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            Activo
                          </span>
                          <span className="text-[10px] text-white/30 font-heading uppercase tracking-wide">
                            Línea {i + 1}
                          </span>
                        </div>

                        {/* Title & Product Type */}
                        <h3 className="font-heading font-extrabold text-white text-lg mb-1 leading-snug group-hover:text-accent-light transition-colors">
                          {cliente.empresa || cliente.proyecto_slug}
                        </h3>
                        <p className="text-white/35 text-xs mb-4">
                          {cliente.plan}
                        </p>

                        <div className="h-px bg-white/[0.04] my-3" />

                        {/* Specs */}
                        <div className="space-y-2 text-xs text-white/50">
                          <div className="flex justify-between">
                            <span>Tipo:</span>
                            <span className="text-white/80 font-semibold">
                              {cliente.plan_tipo === "chatbot_ia" ? "🤖 Chatbot IA" : "📩 API Meta"}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>Slug:</span>
                            <span className="text-white/70 font-mono text-[10px]">
                              {cliente.proyecto_slug}-linea{i + 1}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Action Link */}
                      <div className="mt-6 flex gap-2">
                        <div className="flex-1 flex flex-col gap-1">
                          <a
                            href={getPortalUrl(cliente, i)}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center justify-center gap-2 bg-white/[0.03] group-hover:bg-accent border border-white/[0.08] group-hover:border-accent/40 rounded-xl py-3 text-xs font-semibold text-white transition-all duration-200"
                          >
                            Acceder al Backoffice
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                            </svg>
                          </a>
                          {isRecentActivation(cliente) && (
                            <span className="text-[9px] text-cyan-400/80 text-center animate-pulse">
                              DNS en proceso. Usando enlace temporal seguro.
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDelete(cliente)}
                          disabled={deletingId === cliente.id}
                          className="px-3.5 flex items-center justify-center bg-red-500/[0.04] hover:bg-red-500 border border-red-500/20 hover:border-red-500 rounded-xl text-red-400 hover:text-white transition-all duration-200 disabled:opacity-40 shrink-0"
                          title="Eliminar e Instancia y Suscripción"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.34 9m-4.78 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  );
                });
              }

              const isActive = cliente.backoffice_activado && cliente.deployment_url;
              const isDeploying = !cliente.backoffice_activado && cliente.mp_preapproval_id;
              
              return (
                <div
                  key={cliente.id}
                  className={`glass-strong rounded-2xl border p-6 flex flex-col justify-between relative overflow-hidden transition-all duration-300 group hover:shadow-[0_0_20px_rgba(0,153,255,0.06)] ${
                    isActive 
                      ? "border-white/[0.05] hover:border-accent/40 bg-white/[0.01] hover:bg-white/[0.02]" 
                      : isDeploying
                        ? "border-cyan-500/20 bg-white/[0.01]"
                        : "border-white/[0.05] hover:border-amber-500/30 bg-white/[0.01]"
                  }`}
                >
                  <div>
                    {/* Status Badge */}
                    <div className="flex items-center justify-between mb-4">
                      {isActive ? (
                        <span className="px-2.5 py-0.5 rounded-full text-[9px] font-heading font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/18 flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          Activo
                        </span>
                      ) : isDeploying ? (
                        <span className="px-2.5 py-0.5 rounded-full text-[9px] font-heading font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/18 flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
                          Desplegando portal y DNS...
                        </span>
                      ) : (
                        <span className="px-2.5 py-0.5 rounded-full text-[9px] font-heading font-bold bg-amber-500/10 text-amber-400 border border-amber-500/18 flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                          Pendiente de pago
                        </span>
                      )}
                    </div>

                    {/* Title & Product Type */}
                    <h3 className="font-heading font-extrabold text-white text-lg mb-1 leading-snug group-hover:text-accent-light transition-colors">
                      {cliente.empresa || cliente.proyecto_slug}
                    </h3>
                    <p className="text-white/35 text-xs mb-4">
                      {cliente.plan}
                    </p>

                    <div className="h-px bg-white/[0.04] my-3" />

                    {/* Specs */}
                    <div className="space-y-2 text-xs text-white/50">
                      <div className="flex justify-between">
                        <span>Tipo:</span>
                        <span className="text-white/80 font-semibold">
                          {cliente.plan_tipo === "chatbot_ia" ? "🤖 Chatbot IA" : "📩 API Meta"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Slug de proyecto:</span>
                        <span className="text-white/75 font-mono text-[10px]">
                          {cliente.proyecto_slug}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Creado:</span>
                        <span className="text-white/70">
                          {new Date(cliente.created_at).toLocaleDateString("es-AR")}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="mt-6">
                    {isActive ? (
                      <div className="flex gap-2 w-full">
                        <div className="flex-1 flex flex-col gap-1">
                          <a
                            href={getPortalUrl(cliente)}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center justify-center gap-2 bg-white/[0.03] group-hover:bg-accent border border-white/[0.08] group-hover:border-accent/40 rounded-xl py-3 text-xs font-semibold text-white transition-all duration-200"
                          >
                            Acceder al Backoffice
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                            </svg>
                          </a>
                          {isRecentActivation(cliente) && (
                            <span className="text-[9px] text-cyan-400/80 text-center animate-pulse">
                              DNS en proceso. Usando enlace temporal seguro.
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDelete(cliente)}
                          disabled={deletingId === cliente.id}
                          className="px-3.5 flex items-center justify-center bg-red-500/[0.04] hover:bg-red-500 border border-red-500/20 hover:border-red-500 rounded-xl text-red-400 hover:text-white transition-all duration-200 disabled:opacity-40 shrink-0"
                          title="Eliminar Instancia y Suscripción"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.34 9m-4.78 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                          </svg>
                        </button>
                      </div>
                    ) : isDeploying ? (
                      <div className="flex gap-2 w-full">
                        <button
                          disabled
                          className="flex-1 flex items-center justify-center gap-2 bg-white/[0.02] border border-white/[0.08] rounded-xl py-3 text-xs font-semibold text-white/40 cursor-not-allowed"
                        >
                          <svg className="w-3.5 h-3.5 animate-spin text-cyan-400" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          Configurando servidor...
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(cliente)}
                          disabled={deletingId === cliente.id}
                          className="px-3.5 flex items-center justify-center bg-red-500/[0.04] hover:bg-red-500 border border-red-500/20 hover:border-red-500 rounded-xl text-red-400 hover:text-white transition-all duration-200 disabled:opacity-40 shrink-0"
                          title="Eliminar Instancia y Suscripción"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.34 9m-4.78 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                          </svg>
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <Link
                          href={`/portal/pago?id=${cliente.id}`}
                          disabled={deletingId === cliente.id}
                          className={`flex-1 flex items-center justify-center gap-1.5 bg-amber-500/[0.06] hover:bg-amber-500 border border-amber-500/20 hover:border-amber-500 rounded-xl py-3 text-xs font-semibold text-amber-400 hover:text-white transition-all duration-200 ${
                            deletingId === cliente.id ? "opacity-40 pointer-events-none" : ""
                          }`}
                        >
                          Pagar y Activar
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
                          </svg>
                        </Link>
                        <button
                          type="button"
                          onClick={() => handleDelete(cliente)}
                          disabled={deletingId === cliente.id}
                          className="px-3.5 flex items-center justify-center bg-red-500/[0.04] hover:bg-red-500 border border-red-500/20 hover:border-red-500 rounded-xl text-red-400 hover:text-white transition-all duration-200 disabled:opacity-40 shrink-0"
                          title="Eliminar instancia impaga"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.34 9m-4.78 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Create new instance card placeholder */}
            <Link
              href="/portal/dashboard/nuevo"
              className="glass-strong rounded-2xl border border-dashed border-white/10 hover:border-accent/40 bg-white/[0.005] hover:bg-white/[0.02] p-6 flex flex-col items-center justify-center text-center min-h-[260px] transition-all duration-300 group hover:shadow-[0_0_20px_rgba(0,153,255,0.04)]"
            >
              <div className="w-10 h-10 rounded-full bg-white/[0.03] group-hover:bg-accent/15 border border-white/[0.08] group-hover:border-accent/25 flex items-center justify-center mb-3 transition-colors">
                <span className="text-white/40 group-hover:text-accent-light font-heading font-bold text-xl leading-none">+</span>
              </div>
              <h3 className="font-heading font-bold text-white/50 group-hover:text-white text-sm mb-1">
                Generar otra instancia
              </h3>
              <p className="text-white/20 text-xs max-w-[180px]">
                Adquirí otro chatbot o canal de envíos masivos.
              </p>
            </Link>

          </div>
        )}

      </main>

      {/* Footer */}
      <footer className="relative z-10 py-6 text-center text-white/20 text-xs border-t border-white/[0.04]">
        Neurolinks Portal © {new Date().getFullYear()} · Todos los derechos reservados.
      </footer>

      {/* Custom Confirmation Modal */}
      {showConfirmModal && (() => {
        const isActiveOrDeploying = showConfirmModal.backoffice_activado || showConfirmModal.mp_preapproval_id;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm transition-all duration-300">
            <div className="glass-strong w-full max-w-md p-6 border border-white/[0.08] shadow-[0_0_50px_rgba(0,0,0,0.5)] transform scale-100 transition-all duration-300">
              {isActiveOrDeploying ? (
                <>
                  <div className="flex items-center gap-3 mb-4 text-red-500">
                    <svg className="w-6.5 h-6.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                    </svg>
                    <h3 className="font-heading font-extrabold text-white text-lg">⚠️ ¡PELIGRO: Dar de baja instancia!</h3>
                  </div>
                  
                  <div className="text-white/80 text-xs mb-4 leading-relaxed bg-red-950/20 border border-red-500/20 p-3 rounded-xl space-y-1.5">
                    <strong className="text-red-400 block">Esta acción destructiva realizará lo siguiente:</strong>
                    <div>• Se <strong>cancelará la suscripción</strong> en Mercado Pago para detener cobros futuros.</div>
                    <div>• Se <strong>eliminará por completo el servidor</strong> en Railway.</div>
                    <div>• Se <strong>borrarán permanentemente todos los chats y mensajes</strong>.</div>
                    <div>• Se darán de baja los registros DNS.</div>
                    <div className="text-white/40 border-t border-white/[0.06] pt-1.5 mt-1.5">
                      ℹ️ El registro de la cuenta, logs de API e historial de pagos se conservarán por motivos administrativos.
                    </div>
                  </div>

                  <p className="text-white/60 text-xs mb-3">
                    Para confirmar la baja de <strong className="text-white">"{showConfirmModal.empresa || showConfirmModal.proyecto_slug}"</strong>, escribe el slug de proyecto <strong className="text-accent-light font-mono select-all">{showConfirmModal.proyecto_slug}</strong> a continuación:
                  </p>

                  <input
                    type="text"
                    value={confirmSlug}
                    onChange={(e) => setConfirmSlug(e.target.value)}
                    placeholder={showConfirmModal.proyecto_slug}
                    className="w-full bg-white/[0.04] border border-white/[0.08] focus:border-red-500/40 rounded-xl px-4 py-2.5 text-xs text-white placeholder-white/20 focus:outline-none mb-6 font-mono"
                  />
                </>
              ) : (
                <>
                  <div className="flex items-center gap-3 mb-4 text-amber-400">
                    <svg className="w-6.5 h-6.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                    </svg>
                    <h3 className="font-heading font-extrabold text-white text-lg">¿Confirmas eliminar la instancia?</h3>
                  </div>
                  
                  <p className="text-white/60 text-sm mb-6 leading-relaxed">
                    Estás por eliminar de forma permanente la instancia impaga de <strong className="text-white">"{showConfirmModal.empresa || showConfirmModal.proyecto_slug}"</strong> (subdominio: <code className="text-accent-light font-mono text-xs">{showConfirmModal.proyecto_slug}.clientesneurolinks.com</code>). Esta acción no se puede deshacer.
                  </p>
                </>
              )}

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowConfirmModal(null);
                    setConfirmSlug("");
                  }}
                  className="px-4 py-2.5 text-xs font-semibold text-white/50 hover:text-white transition-colors bg-white/[0.02] border border-white/[0.08] hover:border-white/[0.15] rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={confirmDelete}
                  disabled={isActiveOrDeploying && confirmSlug.trim() !== showConfirmModal.proyecto_slug}
                  className="px-4 py-2.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-500 border border-red-600/30 rounded-xl transition-all shadow-[0_0_15px_rgba(220,38,38,0.2)] hover:shadow-[0_0_20px_rgba(220,38,38,0.3)] disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
                >
                  {isActiveOrDeploying ? "Sí, dar de baja" : "Sí, eliminar"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

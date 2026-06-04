"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function DashboardClient({ user, initialClientes }) {
  const [clientes, setClientes] = useState(initialClientes);
  const [loadingLogout, setLoadingLogout] = useState(false);

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
  const isAdmin = clientes.some(c => c.is_admin);

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

          <Link
            href="/portal/dashboard/nuevo"
            className="btn-gradient self-start sm:self-auto px-5 py-3 rounded-xl font-heading font-semibold text-xs transition-all hover:scale-[1.02] hover:shadow-[0_0_20px_rgba(0,153,255,0.3)]"
          >
            + Generar Nuevo Producto
          </Link>
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
                      <div className="mt-6">
                        <a
                          href={`https://${targetUrl}`}
                          target="_blank"
                          rel="noreferrer"
                          className="w-full flex items-center justify-center gap-2 bg-white/[0.03] group-hover:bg-accent border border-white/[0.08] group-hover:border-accent/40 rounded-xl py-3 text-xs font-semibold text-white transition-all duration-200"
                        >
                          Acceder al Backoffice
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                          </svg>
                        </a>
                      </div>
                    </div>
                  );
                });
              }

              // 2. Otherwise render a single card for the product (active or pending)
              const isActive = cliente.backoffice_activado && cliente.deployment_url;
              
              return (
                <div
                  key={cliente.id}
                  className={`glass-strong rounded-2xl border p-6 flex flex-col justify-between relative overflow-hidden transition-all duration-300 group hover:shadow-[0_0_20px_rgba(0,153,255,0.06)] ${
                    isActive 
                      ? "border-white/[0.05] hover:border-accent/40 bg-white/[0.01] hover:bg-white/[0.02]" 
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
                      ) : (
                        <span className="px-2.5 py-0.5 rounded-full text-[9px] font-heading font-bold bg-amber-500/10 text-amber-400 border border-amber-500/18 flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                          Pendiente de pago / activación
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
                      <a
                        href={`https://${cliente.deployment_url}`}
                        target="_blank"
                        rel="noreferrer"
                        className="w-full flex items-center justify-center gap-2 bg-white/[0.03] group-hover:bg-accent border border-white/[0.08] group-hover:border-accent/40 rounded-xl py-3 text-xs font-semibold text-white transition-all duration-200"
                      >
                        Acceder al Backoffice
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                        </svg>
                      </a>
                    ) : (
                      <Link
                        href={`/portal/pago?id=${cliente.id}`}
                        className="w-full flex items-center justify-center gap-2 bg-amber-500/[0.06] hover:bg-amber-500 border border-amber-500/20 hover:border-amber-500 rounded-xl py-3 text-xs font-semibold text-amber-400 hover:text-white transition-all duration-200"
                      >
                        Pagar y Activar
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
                        </svg>
                      </Link>
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
    </div>
  );
}

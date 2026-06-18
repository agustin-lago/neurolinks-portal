"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import Swal from "sweetalert2";
import withReactContent from "sweetalert2-react-content";

const MySwal = withReactContent(Swal);

export default function DashboardClient({ user, initialClientes, isUserAdmin }) {
  const [clientes, setClientes] = useState(initialClientes);
  const [loadingLogout, setLoadingLogout] = useState(false);
  const navPillRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const [hoverBubble, setHoverBubble] = useState(null);
  const [activeBubble, setActiveBubble] = useState(null);
  const pathname = usePathname();

  useEffect(() => {
    if (!navPillRef.current) return;
    const active = navPillRef.current.querySelector("[data-active='true']");
    setActiveBubble(active ? getBubble(active) : null);
  }, [pathname]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleWheel = (e) => {
      const isScrollable = container.scrollWidth > container.clientWidth;
      if (!isScrollable) return;

      const atLeftEdge = container.scrollLeft <= 0;
      const atRightEdge = Math.ceil(container.scrollLeft + container.clientWidth) >= container.scrollWidth;

      if (e.deltaY !== 0) {
        if ((e.deltaY > 0 && !atRightEdge) || (e.deltaY < 0 && !atLeftEdge)) {
          e.preventDefault();
          container.scrollBy({ left: e.deltaY > 0 ? 340 : -340, behavior: "smooth" });
        }
      }
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, []);

  const getBubble = (el) => {
    if (!navPillRef.current || !el) return null;
    const navRect = navPillRef.current.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    return {
      left: elRect.left - navRect.left,
      top: elRect.top - navRect.top,
      width: elRect.width,
      height: elRect.height,
    };
  };

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

  const [editingClient, setEditingClient] = useState(null);
  const [editForm, setEditForm] = useState({
    id: "",
    empresa: "",
    proyecto_slug: "",
    deployment_url: "",
    deployment_urls: [],
    observaciones: []
  });
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState("");

  const handleEditClick = (cliente) => {
    setEditError("");
    setEditingClient(cliente);
    setEditForm({
      id: cliente.id,
      empresa: cliente.empresa || "",
      proyecto_slug: cliente.proyecto_slug || "",
      deployment_url: cliente.deployment_url || "",
      deployment_urls: cliente.deployment_urls ? [...cliente.deployment_urls] : [],
      observaciones: cliente.observaciones ? [...cliente.observaciones] : []
    });
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    setEditLoading(true);
    setEditError("");
    try {
      const res = await fetch("/api/portal/editar-producto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al actualizar la información");

      // Update state locally
      setClientes(prev => prev.map(c => {
        if (c.id === editForm.id) {
          let finalUrl = null;
          let finalUrls = [];
          if (editForm.deployment_urls && editForm.deployment_urls.length > 0) {
            finalUrls = editForm.deployment_urls.map(url => {
              if (!url) return null;
              let cleaned = url.trim().toLowerCase().replace(/^(https?:\/\/)?(www\.)?/, "");
              return cleaned.split("/")[0];
            }).filter(Boolean);
            finalUrl = finalUrls[0] || null;
          } else if (editForm.deployment_url) {
            finalUrl = editForm.deployment_url.trim().toLowerCase().replace(/^(https?:\/\/)?(www\.)?/, "").split("/")[0];
            finalUrls = finalUrl ? [finalUrl] : [];
          }

          return {
            ...c,
            empresa: editForm.empresa.trim(),
            proyecto_slug: editForm.proyecto_slug.trim().toLowerCase(),
            deployment_url: finalUrl,
            deployment_urls: finalUrls,
            observaciones: editForm.observaciones.map(o => o?.trim() || "")
          };
        }
        return c;
      }));

      setEditingClient(null);
    } catch (err) {
      setEditError(err.message);
    } finally {
      setEditLoading(false);
    }
  };

  const confirmDeleteLogic = async (cliente) => {
    const targetId = cliente.id;
    const isActiveOrDeploying = cliente.backoffice_activado || cliente.mp_preapproval_id;

    setDeletingId(targetId);
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
      
      MySwal.fire({
        icon: 'success',
        title: '¡Eliminada!',
        text: 'La instancia fue eliminada correctamente.',
        background: "#080c14",
        color: "#fff",
        customClass: { 
          popup: "border border-white/[0.08] rounded-2xl shadow-[0_0_50px_rgba(0,0,0,0.5)]", 
          title: "font-heading font-bold text-lg text-white", 
          htmlContainer: "text-white/60 text-sm", 
          confirmButton: "px-5 py-2.5 text-xs font-semibold text-white bg-accent hover:bg-accent-light rounded-xl transition-all" 
        }
      });
    } catch (err) {
      MySwal.fire({
        icon: 'error',
        title: 'Error',
        text: err.message || "Error al eliminar la instancia",
        background: "#080c14",
        color: "#fff",
        customClass: { 
          popup: "border border-white/[0.08] rounded-2xl shadow-[0_0_50px_rgba(0,0,0,0.5)]", 
          title: "font-heading font-bold text-lg text-white", 
          htmlContainer: "text-white/60 text-sm", 
          confirmButton: "px-5 py-2.5 text-xs font-semibold text-white bg-accent hover:bg-accent-light rounded-xl transition-all" 
        }
      });
    } finally {
      setDeletingId(null);
    }
  };

  const handleDelete = async (cliente) => {
    const isActiveOrDeploying = cliente.backoffice_activado || cliente.mp_preapproval_id;
    
    if (isActiveOrDeploying) {
      const result = await MySwal.fire({
        icon: 'warning',
        iconColor: '#ef4444',
        title: '⚠️ ¡PELIGRO: Dar de baja instancia!',
        html: (
          <div className="text-left mt-2">
            <div className="text-white/80 text-xs mb-4 leading-relaxed bg-red-950/20 border border-red-500/20 p-4 rounded-xl space-y-2">
              <strong className="text-red-400 block mb-1">Esta acción destructiva realizará lo siguiente:</strong>
              <div>• Se <strong>cancelará la suscripción</strong> en Mercado Pago para detener cobros futuros.</div>
              <div>• Se <strong>eliminará por completo el servidor</strong> en Railway.</div>
              <div>• Se <strong>borrarán permanentemente todos los chats y mensajes</strong>.</div>
              <div>• Se darán de baja los registros DNS.</div>
              <div className="text-white/40 border-t border-white/[0.06] pt-2 mt-2">
                ℹ️ El registro de la cuenta, logs de API e historial de pagos se conservarán por motivos administrativos.
              </div>
            </div>
            <p className="text-white/60 text-xs mb-3">
              Para confirmar la baja de <strong className="text-white">"{cliente.empresa || cliente.proyecto_slug}"</strong>, escribe el slug de proyecto <strong className="text-accent-light font-mono select-all">{cliente.proyecto_slug}</strong> a continuación:
            </p>
          </div>
        ),
        input: 'text',
        inputPlaceholder: cliente.proyecto_slug,
        inputAttributes: {
          style: "background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); color: white; border-radius: 0.75rem; padding: 0.75rem 1rem; font-size: 0.875rem; font-family: monospace; outline: none; margin: 0; margin-top: 0.5rem; width: 100%; box-sizing: border-box;"
        },
        showCancelButton: true,
        confirmButtonText: "Eliminar definitivamente",
        cancelButtonText: "Cancelar",
        buttonsStyling: false,
        background: "#080c14",
        color: "#fff",
        customClass: {
          popup: "border border-white/[0.08] rounded-2xl shadow-[0_0_50px_rgba(0,0,0,0.5)] !pb-6",
          title: "font-heading font-extrabold text-xl text-white pt-2",
          htmlContainer: "m-0 px-6",
          actions: "mt-6 flex justify-end gap-3 w-full px-6",
          cancelButton: "px-5 py-2.5 text-xs font-semibold text-white/50 hover:text-white transition-colors bg-white/[0.02] border border-white/[0.08] hover:border-white/[0.15] rounded-xl m-0",
          confirmButton: "px-5 py-2.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-500 rounded-xl border border-red-500/50 shadow-[0_0_15px_rgba(220,38,38,0.3)] transition-all m-0 ml-3",
          input: "mx-6 mt-2 w-auto",
        },
        preConfirm: (inputValue) => {
          if (inputValue !== cliente.proyecto_slug) {
            Swal.showValidationMessage("El slug ingresado no coincide con el proyecto");
          }
        }
      });

      if (result.isConfirmed) {
        confirmDeleteLogic(cliente);
      }
    } else {
      const result = await MySwal.fire({
        icon: 'warning',
        iconColor: '#f59e0b',
        title: '¿Confirmas eliminar la instancia?',
        html: (
          <p className="text-white/60 text-sm mt-2 leading-relaxed">
            Estás por eliminar de forma permanente la instancia impaga de <strong className="text-white">"{cliente.empresa || cliente.proyecto_slug}"</strong> (subdominio: <code className="text-accent-light font-mono text-xs">{cliente.proyecto_slug}.clientesneurolinks.com</code>). Esta acción no se puede deshacer.
          </p>
        ),
        showCancelButton: true,
        confirmButtonText: "Sí, eliminar",
        cancelButtonText: "Cancelar",
        buttonsStyling: false,
        background: "#080c14",
        color: "#fff",
        customClass: {
          popup: "border border-white/[0.08] rounded-2xl shadow-[0_0_50px_rgba(0,0,0,0.5)] !pb-6",
          title: "font-heading font-extrabold text-xl text-white pt-2",
          htmlContainer: "m-0 px-6",
          actions: "mt-6 flex justify-center gap-3 w-full",
          cancelButton: "px-5 py-2.5 text-xs font-semibold text-white/50 hover:text-white transition-colors bg-white/[0.02] border border-white/[0.08] hover:border-white/[0.15] rounded-xl m-0",
          confirmButton: "px-5 py-2.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-500 rounded-xl border border-red-500/50 shadow-[0_0_15px_rgba(220,38,38,0.3)] transition-all m-0 ml-3",
        }
      });

      if (result.isConfirmed) {
        confirmDeleteLogic(cliente);
      }
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
          .select("id, backoffice_activado, deployment_url, deployment_urls, mp_preapproval_id, plan, plan_tipo, lineas_cantidad, railway_public_url, activated_at, updated_at, observaciones")
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
                  lineas_cantidad: match.lineas_cantidad,
                  observaciones: match.observaciones
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
      <header className="relative z-10 w-full px-4 sm:px-6 h-[78px] flex items-center border-b border-white/[0.04] bg-white/[0.015] backdrop-blur-sm">
        <div className="w-full max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3">
            <Image
              src="/images/neuro-logo.png"
              alt="Neurolinks"
              width={40}
              height={40}
              className="object-contain w-8 sm:w-10 h-auto"
              priority
            />
            <span className="hidden sm:inline-block px-2.5 py-1 rounded-md bg-white/[0.04] border border-white/[0.08] text-[10px] text-white/50 font-heading font-semibold tracking-wider uppercase">
              Portal
            </span>
          </div>

          <nav
            ref={navPillRef}
            aria-label="Opciones de usuario"
            className="flex items-center relative rounded-full px-1 sm:px-2 py-1.5"
            style={{
              background: "rgba(7, 17, 31, 0.72)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              border: "1px solid rgba(0, 153, 255, 0.14)",
              boxShadow: "0 4px 24px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.04)",
            }}
            onMouseLeave={() => setHoverBubble(null)}
          >
            {/* Active bubble */}
            {activeBubble && (
              <span
                aria-hidden="true"
                className="absolute rounded-full pointer-events-none transition-all duration-300"
                style={{
                  left: activeBubble.left,
                  top: activeBubble.top,
                  width: activeBubble.width,
                  height: activeBubble.height,
                  background: "linear-gradient(160deg, rgba(0,120,212,0.38), rgba(0,153,255,0.22))",
                  border: "1px solid rgba(0,153,255,0.32)",
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.1), 0 2px 12px rgba(0,120,212,0.28)",
                  zIndex: 2,
                }}
              />
            )}

            {/* Hover bubble */}
            {hoverBubble && (
              <span
                aria-hidden="true"
                className="absolute rounded-full pointer-events-none transition-all duration-150"
                style={{
                  left: hoverBubble.left,
                  top: hoverBubble.top,
                  width: hoverBubble.width,
                  height: hoverBubble.height,
                  background: "rgba(255,255,255,0.045)",
                  border: "1px solid rgba(255,255,255,0.07)",
                  zIndex: 1,
                }}
              />
            )}

            {isAdmin && (
              <Link
                href="/portal/admin/mercadopago"
                data-active={pathname === "/portal/admin/mercadopago" ? "true" : "false"}
                className={clsx(
                  "relative z-10 px-3 sm:px-4 py-2 rounded-full text-[10px] sm:text-xs font-heading font-semibold transition-all duration-200 active:scale-90 select-none",
                  pathname === "/portal/admin/mercadopago" ? "text-white" : "text-white/50 hover:text-white"
                )}
                onMouseEnter={(e) => setHoverBubble(getBubble(e.currentTarget))}
              >
                MercadoPago
              </Link>
            )}
            <Link
              href="/portal/dashboard/perfil"
              data-active={pathname === "/portal/dashboard/perfil" ? "true" : "false"}
              className={clsx(
                "relative z-10 flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-full text-[10px] sm:text-xs font-heading font-semibold transition-all duration-200 active:scale-90 select-none",
                pathname === "/portal/dashboard/perfil" ? "text-white" : "text-white/50 hover:text-white"
              )}
              onMouseEnter={(e) => setHoverBubble(getBubble(e.currentTarget))}
            >
              <svg className="w-3.5 h-3.5 shrink-0 hidden sm:block" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
              </svg>
              Mi Cuenta
            </Link>
            <button
              onClick={handleLogout}
              disabled={loadingLogout}
              className="relative z-10 px-3 sm:px-4 py-2 rounded-full text-[10px] sm:text-xs font-heading font-semibold transition-all duration-200 active:scale-90 text-white/50 hover:text-white disabled:opacity-50 select-none"
              onMouseEnter={(e) => setHoverBubble(getBubble(e.currentTarget))}
            >
              {loadingLogout ? "Cerrando..." : "Cerrar sesión"}
            </button>
          </nav>
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
              <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5m8.25-3v13.5m0-13.5L8.25 7.5m3.75-3l3.75 3M3.75 7.5h16.5" />
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
          <div className="flex flex-col lg:flex-row items-stretch gap-6 lg:gap-8 min-h-[300px]">

            {/* Create new instance card - FIXED ON LEFT */}
            <div className="w-full lg:w-[320px] shrink-0 flex flex-col">
              <Link
                href="/portal/dashboard/nuevo"
                className="flex-1 glass-strong rounded-2xl border border-dashed border-white/10 hover:border-solid hover:border-accent/40 bg-white/[0.04] hover:bg-white/[0.06] p-6 flex flex-col items-center justify-center text-center min-h-[260px] transition-all duration-500 group relative overflow-hidden"
              >
                {/* Background Glow on Hover */}
                <div className="absolute inset-0 bg-gradient-to-br from-accent/0 via-accent/0 to-accent/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                
                {/* Icon Container with HUD Animation */}
                <div className="relative z-10 w-16 h-16 rounded-2xl bg-white/[0.02] group-hover:bg-accent/10 border border-white/[0.08] group-hover:border-accent/30 flex items-center justify-center mb-5 transition-all duration-500 group-hover:scale-110 group-hover:-translate-y-2 group-hover:shadow-[0_0_30px_rgba(0,153,255,0.4)]">
                  {/* Animated HUD Rings */}
                  <div className="absolute inset-0 border border-accent/0 group-hover:border-accent/50 rounded-2xl transition-all duration-700 opacity-0 group-hover:opacity-100 group-hover:rotate-12 scale-[1.15] pointer-events-none" />
                  <div className="absolute inset-0 border border-accent/0 group-hover:border-accent/30 rounded-2xl transition-all duration-700 opacity-0 group-hover:opacity-100 group-hover:-rotate-12 scale-[1.25] delay-100 pointer-events-none" />
                  
                  {/* SVG Icon */}
                  <svg className="w-8 h-8 text-white/40 group-hover:text-accent-light transition-all duration-500 group-hover:scale-110" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                  </svg>
                </div>

                <h3 className="relative z-10 font-heading font-extrabold text-white/50 group-hover:text-white text-base mb-1.5 transition-colors duration-300">
                  Generar otra instancia
                </h3>
                <p className="relative z-10 text-white/30 group-hover:text-white/50 text-xs max-w-[200px] mx-auto transition-colors duration-300 leading-relaxed">
                  Adquirí otro chatbot o canal de envíos masivos para tu empresa.
                </p>
              </Link>
            </div>

            {/* Vertical Separator */}
            <div className="hidden lg:block w-px bg-gradient-to-b from-transparent via-white/10 to-transparent shrink-0 my-4" />

            {/* Horizontally Scrollable Instances */}
            <div 
              ref={scrollContainerRef} 
              className="flex-1 flex gap-6 overflow-x-auto pb-6 pt-2 pr-8" 
              style={{ 
                scrollbarWidth: 'thin', 
                scrollbarColor: 'rgba(255,255,255,0.15) transparent',
                WebkitMaskImage: 'linear-gradient(to right, black 85%, transparent 100%)',
                maskImage: 'linear-gradient(to right, black 85%, transparent 100%)'
              }}
            >

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
                      className="shrink-0 w-[300px] sm:w-[320px] glass-strong rounded-2xl border border-white/[0.05] hover:border-accent/40 bg-white/[0.04] hover:bg-white/[0.06] p-6 flex flex-col justify-between relative overflow-hidden transition-all duration-300 group hover:shadow-[0_0_20px_rgba(0,153,255,0.06)]"
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
                        <h3 className="font-heading font-extrabold text-white text-lg mb-0.5 leading-snug group-hover:text-accent-light transition-colors">
                          {cliente.empresa || cliente.proyecto_slug}
                        </h3>
                        {cliente.observaciones && cliente.observaciones[i] ? (
                          <p className="text-cyan-400 font-semibold text-xs mb-2">
                            {cliente.observaciones[i]}
                          </p>
                        ) : (
                          <p className="text-white/20 text-xs italic mb-2">
                            Sin observación
                          </p>
                        )}
                        <p className="text-white/35 text-xs mb-4">
                          {cliente.plan}
                        </p>

                        <div className="h-px bg-white/[0.04] my-3" />

                        {/* Specs */}
                        <div className="space-y-2 text-xs text-white/50">
                          <div className="flex justify-between items-center">
                            <span>Tipo:</span>
                            <span className="text-white/80 font-semibold flex items-center gap-1.5">
                              {cliente.plan_tipo === "chatbot_ia" ? (
                                <>
                                  <svg className="w-3.5 h-3.5 text-accent-light" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 10.5h.008v.008H8.25V10.5Zm5.25 0h.008v.008h-.008V10.5Zm-1.5 5.25h.008v.008h-.008v-.008Zm4.5-9h1.5a2.25 2.25 0 0 1 2.25 2.25v9a2.25 2.25 0 0 1-2.25 2.25H4.5A2.25 2.25 0 0 1 2.25 19.5v-9A2.25 2.25 0 0 1 4.5 8.25h1.5m4.5-3.75a3 3 0 1 1 6 0" />
                                  </svg>
                                  Chatbot IA
                                </>
                              ) : (
                                <>
                                  <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
                                  </svg>
                                  API Meta
                                </>
                              )}
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
                          onClick={() => handleEditClick(cliente)}
                          className="px-3.5 flex items-center justify-center bg-white/[0.03] hover:bg-accent border border-white/[0.08] hover:border-accent/40 rounded-xl text-white transition-all duration-200 shrink-0"
                          title="Editar Instancia"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.83 20.82a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
                          </svg>
                        </button>
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
                  className={`shrink-0 w-[300px] sm:w-[320px] glass-strong rounded-2xl border p-6 flex flex-col justify-between relative overflow-hidden transition-all duration-300 group hover:shadow-[0_0_20px_rgba(0,153,255,0.06)] ${isActive
                    ? "border-white/[0.05] hover:border-accent/40 bg-white/[0.04] hover:bg-white/[0.06]"
                    : isDeploying
                      ? "border-cyan-500/20 bg-white/[0.04]"
                      : "border-white/[0.05] hover:border-amber-500/30 bg-white/[0.04]"
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
                    <h3 className="font-heading font-extrabold text-white text-lg mb-0.5 leading-snug group-hover:text-accent-light transition-colors">
                      {cliente.empresa || cliente.proyecto_slug}
                    </h3>
                    {cliente.observaciones && cliente.observaciones[0] && (
                      <p className="text-cyan-400 font-semibold text-xs mb-2">
                        {cliente.observaciones[0]}
                      </p>
                    )}
                    <p className="text-white/35 text-xs mb-4">
                      {cliente.plan}
                    </p>

                    <div className="h-px bg-white/[0.04] my-3" />

                    {/* Specs */}
                    <div className="space-y-2 text-xs text-white/50">
                      <div className="flex justify-between items-center">
                        <span>Tipo:</span>
                        <span className="text-white/80 font-semibold flex items-center gap-1.5">
                          {cliente.plan_tipo === "chatbot_ia" ? (
                            <>
                              <svg className="w-3.5 h-3.5 text-accent-light" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 10.5h.008v.008H8.25V10.5Zm5.25 0h.008v.008h-.008V10.5Zm-1.5 5.25h.008v.008h-.008v-.008Zm4.5-9h1.5a2.25 2.25 0 0 1 2.25 2.25v9a2.25 2.25 0 0 1-2.25 2.25H4.5A2.25 2.25 0 0 1 2.25 19.5v-9A2.25 2.25 0 0 1 4.5 8.25h1.5m4.5-3.75a3 3 0 1 1 6 0" />
                              </svg>
                              Chatbot IA
                            </>
                          ) : (
                            <>
                              <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
                              </svg>
                              API Meta
                            </>
                          )}
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
                          onClick={() => handleEditClick(cliente)}
                          className="px-3.5 flex items-center justify-center bg-white/[0.03] hover:bg-accent border border-white/[0.08] hover:border-accent/40 rounded-xl text-white transition-all duration-200 shrink-0"
                          title="Editar Instancia"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.83 20.82a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
                          </svg>
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
                          className={`flex-1 flex items-center justify-center gap-1.5 bg-amber-500/[0.06] hover:bg-amber-500 border border-amber-500/20 hover:border-amber-500 rounded-xl py-3 text-xs font-semibold text-amber-400 hover:text-white transition-all duration-200 ${deletingId === cliente.id ? "opacity-40 pointer-events-none" : ""
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
            </div>
          </div>
        )}

      </main>

      {/* Footer */}
      <footer className="relative z-10 py-6 text-center text-white/20 text-xs border-t border-white/[0.04]">
        Neurolinks Portal © {new Date().getFullYear()} · Todos los derechos reservados.
      </footer>

      {/* Modal de Edición de Instancia */}
      {editingClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-md"
            onClick={() => setEditingClient(null)}
          />
          <div className="relative z-10 w-full max-w-lg bg-[#0a1523]/96 backdrop-blur-md rounded-2xl border border-[#0099ff]/20 p-6 shadow-2xl shadow-[0_0_50px_rgba(0,153,255,0.18)] overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between mb-4 border-b border-white/[0.05] pb-3">
              <h3 className="font-heading font-extrabold text-white text-lg">
                Editar Información de la Instancia
              </h3>
              <button
                type="button"
                onClick={() => setEditingClient(null)}
                className="text-white/40 hover:text-white transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              {editError && (
                <div className="flex items-start gap-2 rounded-xl px-3.5 py-2.5 border border-red-500/18 bg-red-500/8 text-red-400 text-xs">
                  <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                  <span>{editError}</span>
                </div>
              )}

              {/* Nombre de la Empresa */}
              <div>
                <label className="block text-white/50 text-xs font-semibold mb-1.5 uppercase tracking-wider">
                  Nombre de la Empresa / Organización
                </label>
                <input
                  type="text"
                  required
                  value={editForm.empresa}
                  onChange={(e) => setEditForm(prev => ({ ...prev, empresa: e.target.value }))}
                  placeholder="Ej: Mi Empresa S.A."
                  className="w-full bg-white/[0.04] border border-white/[0.08] focus:border-accent/40 rounded-xl px-4 py-2.5 text-xs text-white placeholder-white/20 focus:outline-none"
                />
              </div>

              {/* Slug de Proyecto */}
              <div>
                <label className="block text-white/50 text-xs font-semibold mb-1.5 uppercase tracking-wider">
                  Slug del Proyecto
                </label>
                <input
                  type="text"
                  required
                  disabled={editingClient.backoffice_activado && !isAdmin}
                  value={editForm.proyecto_slug}
                  onChange={(e) => setEditForm(prev => ({ ...prev, proyecto_slug: e.target.value }))}
                  placeholder="ej: mi-empresa"
                  className="w-full bg-white/[0.04] border border-white/[0.08] focus:border-accent/40 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl px-4 py-2.5 text-xs text-white placeholder-white/20 focus:outline-none font-mono"
                />
                {editingClient.backoffice_activado && !isAdmin && (
                  <span className="text-[10px] text-white/30 mt-1 block">
                    Por razones de seguridad, solo el administrador puede cambiar el slug una vez activo.
                  </span>
                )}
                {isAdmin && (
                  <span className="text-[10px] text-amber-400/80 mt-1 block">
                    ⚠️ Cambiar el slug requiere actualizar manualmente los registros DNS de Hostinger y el custom domain en Railway.
                  </span>
                )}
              </div>

              {/* Dominios Personalizados */}
              <div>
                <label className="block text-white/50 text-xs font-semibold mb-1.5 uppercase tracking-wider">
                  Dominios Personalizados (Hostinger)
                </label>

                {editingClient.lineas_cantidad > 1 ? (
                  <div className="space-y-3">
                    {Array.from({ length: Number(editingClient.lineas_cantidad) }).map((_, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <span className="text-[10px] text-white/30 w-12 font-mono shrink-0">Línea {idx + 1}:</span>
                        <input
                          type="text"
                          value={editForm.deployment_urls[idx] || ""}
                          onChange={(e) => {
                            const newUrls = [...editForm.deployment_urls];
                            newUrls[idx] = e.target.value;
                            setEditForm(prev => ({ ...prev, deployment_urls: newUrls }));
                          }}
                          placeholder={`ej: linea${idx + 1}.miempresa.com`}
                          className="flex-1 bg-white/[0.04] border border-white/[0.08] focus:border-accent/40 rounded-xl px-4 py-2.5 text-xs text-white placeholder-white/20 focus:outline-none font-mono"
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <input
                    type="text"
                    value={editForm.deployment_url}
                    onChange={(e) => setEditForm(prev => ({ ...prev, deployment_url: e.target.value }))}
                    placeholder="ej: app.miempresa.com"
                    className="w-full bg-white/[0.04] border border-white/[0.08] focus:border-accent/40 rounded-xl px-4 py-2.5 text-xs text-white placeholder-white/20 focus:outline-none font-mono"
                  />
                )}
                <span className="text-[10px] text-white/30 mt-1 block">
                  Inserta el host limpio (ej: <code>app.miempresa.com</code>). Los protocolos <code>https://</code> se removerán automáticamente.
                </span>
              </div>

              {/* Observación / Identificación de Línea */}
              <div>
                <label className="block text-white/50 text-xs font-semibold mb-1.5 uppercase tracking-wider">
                  {editingClient.lineas_cantidad > 1 ? "Observaciones por Línea" : "Observación / Nota"}
                </label>

                {editingClient.lineas_cantidad > 1 ? (
                  <div className="space-y-3">
                    {Array.from({ length: Number(editingClient.lineas_cantidad) }).map((_, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <span className="text-[10px] text-white/30 w-12 font-mono shrink-0">Línea {idx + 1}:</span>
                        <input
                          type="text"
                          value={editForm.observaciones[idx] || ""}
                          onChange={(e) => {
                            const newObs = [...editForm.observaciones];
                            newObs[idx] = e.target.value;
                            setEditForm(prev => ({ ...prev, observaciones: newObs }));
                          }}
                          placeholder={`ej: Línea de ${idx === 0 ? "Mariana" : idx === 1 ? "Nara" : "Guchi"}`}
                          className="flex-1 bg-white/[0.04] border border-white/[0.08] focus:border-[#0099ff]/40 rounded-xl px-4 py-2.5 text-xs text-white placeholder-white/20 focus:outline-none"
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <input
                    type="text"
                    value={editForm.observaciones[0] || ""}
                    onChange={(e) => {
                      const newObs = [...editForm.observaciones];
                      newObs[0] = e.target.value;
                      setEditForm(prev => ({ ...prev, observaciones: newObs }));
                    }}
                    placeholder="ej: Servidor Principal / Campañas"
                    className="w-full bg-white/[0.04] border border-white/[0.08] focus:border-[#0099ff]/40 rounded-xl px-4 py-2.5 text-xs text-white placeholder-white/20 focus:outline-none"
                  />
                )}
                <span className="text-[10px] text-white/30 mt-1 block">
                  Permite diferenciar las distintas líneas o instancias en el listado.
                </span>
              </div>

              {/* Botones */}
              <div className="flex justify-end gap-3 pt-3 border-t border-white/[0.05] mt-6">
                <button
                  type="button"
                  onClick={() => setEditingClient(null)}
                  disabled={editLoading}
                  className="px-4 py-2.5 text-xs font-semibold text-white/50 hover:text-white transition-colors bg-white/[0.02] border border-white/[0.08] hover:border-white/[0.15] rounded-xl disabled:opacity-40"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={editLoading}
                  className="px-5 py-2.5 text-xs font-semibold text-white bg-accent hover:bg-accent-light border border-accent/30 rounded-xl transition-all shadow-[0_0_15px_rgba(0,153,255,0.15)] hover:shadow-[0_0_20px_rgba(0,153,255,0.25)] disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
                >
                  {editLoading && (
                    <svg className="w-3.5 h-3.5 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  )}
                  {editLoading ? "Guardando..." : "Guardar Cambios"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

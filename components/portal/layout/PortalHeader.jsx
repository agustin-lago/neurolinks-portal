"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { createClient } from "@/lib/supabase/client";

export default function PortalHeader({ isUserAdmin, subscription }) {
  const [loadingLogout, setLoadingLogout] = useState(false);
  const navPillRef = useRef(null);
  const [hoverBubble, setHoverBubble] = useState(null);
  const [activeBubble, setActiveBubble] = useState(null);
  const pathname = usePathname();
  const planLabel = subscription?.plan || "Sin plan";
  const status = String(subscription?.subscription_status || "pending").toLowerCase();
  const badgeClass = status === "active" || status === "manual"
    ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200"
    : "border-amber-400/25 bg-amber-400/10 text-amber-200";

  useEffect(() => {
    if (!navPillRef.current) return;
    const active = navPillRef.current.querySelector("[data-active='true']");
    setActiveBubble(active ? getBubble(active) : null);
  }, [pathname]);

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

  return (
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
          <div className="hidden sm:flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-md bg-white/[0.04] border border-white/[0.08] text-[10px] text-white/50 font-heading font-semibold tracking-wider uppercase">
              Portal
            </span>
            <span className={`px-2.5 py-1 rounded-md border text-[10px] font-heading font-semibold tracking-wide ${badgeClass}`}>
              {planLabel}
            </span>
          </div>
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

          <Link
            href="/portal/dashboard"
            data-active={pathname === "/portal/dashboard" ? "true" : "false"}
            className={clsx(
              "relative z-10 px-3 sm:px-4 py-2 rounded-full text-[10px] sm:text-xs font-heading font-semibold transition-all duration-200 active:scale-90 select-none",
              pathname === "/portal/dashboard" ? "text-white" : "text-white/50 hover:text-white"
            )}
            onMouseEnter={(e) => setHoverBubble(getBubble(e.currentTarget))}
          >
            Mis Productos
          </Link>

          {isUserAdmin && (
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
              "relative z-10 flex items-center gap-2 px-3 sm:px-4 py-2 rounded-full text-[10px] sm:text-xs font-heading font-semibold transition-all duration-200 active:scale-90 select-none",
              pathname === "/portal/dashboard/perfil" ? "text-white" : "text-white/50 hover:text-white"
            )}
            onMouseEnter={(e) => setHoverBubble(getBubble(e.currentTarget))}
          >
            <svg className="w-3.5 h-3.5 opacity-80" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
            </svg>
            <span className="hidden sm:inline">Mi Cuenta</span>
          </Link>

          <div className="w-px h-4 bg-white/[0.1] mx-1 sm:mx-2" />

          <button
            type="button"
            onClick={handleLogout}
            disabled={loadingLogout}
            className="relative z-10 px-3 sm:px-4 py-2 rounded-full text-[10px] sm:text-xs font-heading font-semibold text-white/50 hover:text-red-400 transition-all duration-200 active:scale-90 select-none disabled:opacity-50 min-w-[85px] sm:min-w-[105px] flex items-center justify-center text-center"
            onMouseEnter={(e) => setHoverBubble(getBubble(e.currentTarget))}
          >
            {loadingLogout ? "Saliendo..." : "Cerrar sesión"}
          </button>
        </nav>
      </div>
    </header>
  );
}

"use client";

import PortalHeader from "./PortalHeader";
import PortalFooter from "./PortalFooter";

export default function PortalPageWrapper({ children, isUserAdmin, className = "" }) {
  return (
    <div className="min-h-[100dvh] flex flex-col justify-between bg-transparent text-white relative overflow-hidden w-full">
      {/* Glow effect central */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-glow-accent opacity-15 pointer-events-none" />

      {/* Header unificado */}
      <PortalHeader isUserAdmin={isUserAdmin} />

      {/* Contenido inyectado por la página específica */}
      <main className={`relative z-10 flex-1 flex flex-col px-4 py-8 sm:py-12 ${className}`}>
        {children}
      </main>

      {/* Footer unificado */}
      <PortalFooter />
    </div>
  );
}

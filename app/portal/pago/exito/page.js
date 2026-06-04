"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";

function Spinner() {
  return (
    <div className="w-12 h-12 rounded-full border-2 border-white/10 border-t-accent animate-spin mx-auto" />
  );
}

function ExitoPageContent() {
  const [loadingText, setLoadingText] = useState("Registrando tu pago...");
  const searchParams = useSearchParams();

  useEffect(() => {
    const linkAndRedirect = async () => {
      const preapprovalId = searchParams.get("preapproval_id");
      const clienteId = searchParams.get("external_reference");

      if (preapprovalId) {
        console.log(`[ExitoPage] Linking preapproval_id '${preapprovalId}' to client '${clienteId || "first"}'`);
        try {
          await fetch("/api/pago/vincular-suscripcion", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ preapprovalId, id: clienteId }),
          });
          setLoadingText("Pago verificado. Redirigiéndote al panel...");
        } catch (linkErr) {
          console.error("[ExitoPage] Failed to link subscription:", linkErr);
        }
      } else {
        setLoadingText("Redirigiéndote...");
      }

      // Briefly wait 1 second for visual comfort and redirect
      setTimeout(() => {
        window.location.href = "/portal/dashboard";
      }, 1000);
    };

    linkAndRedirect();
  }, [searchParams]);

  return (
    <div className="w-full max-w-md text-center">
      <Spinner />
      <h1 className="font-heading font-extrabold text-white text-2xl mt-6 mb-2">
        {loadingText}
      </h1>
      <p className="text-white/40 text-sm">
        Por favor, no cierres esta ventana.
      </p>
    </div>
  );
}

export default function ExitoPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <Suspense fallback={
        <div className="w-full max-w-md text-center">
          <Spinner />
          <h1 className="font-heading font-extrabold text-white text-2xl mt-6 mb-2">
            Cargando confirmación...
          </h1>
        </div>
      }>
        <ExitoPageContent />
      </Suspense>
    </div>
  );
}

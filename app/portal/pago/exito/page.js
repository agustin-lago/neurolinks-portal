"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";

function Spinner() {
  return (
    <div className="w-12 h-12 rounded-full border-2 border-white/10 border-t-accent animate-spin mx-auto" />
  );
}

function ExitoPageContent() {
  const [status, setStatus] = useState("polling"); // "polling" | "ready" | "error"
  const [url,    setUrl]    = useState(null);
  const searchParams = useSearchParams();

  useEffect(() => {
    let attempts = 0;
    const MAX    = 60; // 5 min total

    const associateAndPoll = async () => {
      const preapprovalId = searchParams.get("preapproval_id");
      
      // 1. Link subscription ID to the current authenticated client if present
      if (preapprovalId) {
        console.log(`[ExitoPage] Found preapproval_id '${preapprovalId}' in URL. Linking...`);
        try {
          await fetch("/api/pago/vincular-suscripcion", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ preapprovalId }),
          });
        } catch (linkErr) {
          console.error("[ExitoPage] Failed to link subscription:", linkErr);
        }
      }

      // 2. Start polling Railway deployment status
      const poll = async () => {
        try {
          const res  = await fetch("/api/deployment/status");
          const data = await res.json();

          if (data.ready && data.url) {
            setUrl(data.url);
            setStatus("ready");
            return;
          }

          attempts++;
          if (attempts >= MAX) { setStatus("error"); return; }
          setTimeout(poll, 5000);
        } catch {
          attempts++;
          if (attempts >= MAX) { setStatus("error"); return; }
          setTimeout(poll, 5000);
        }
      };

      poll();
    };

    associateAndPoll();
  }, [searchParams]);

  return (
    <div className="w-full max-w-md text-center">
      {status === "polling" && (
        <>
          <Spinner />
          <h1 className="font-heading font-extrabold text-white text-2xl mt-6 mb-2">
            Activando tu portal...
          </h1>
          <p className="text-white/40 text-sm mb-1">
            Estamos configurando tu backoffice.
          </p>
          <p className="text-white/25 text-xs">Esto puede tardar un par de minutos.</p>
        </>
      )}

      {status === "ready" && url && (
        <>
          <div className="w-12 h-12 rounded-full mx-auto mb-6 flex items-center justify-center"
            style={{ background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.25)" }}>
            <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
          </div>
          <h1 className="font-heading font-extrabold text-white text-2xl mb-2">
            ¡Tu portal está listo!
          </h1>
          <p className="text-white/40 text-sm mb-6">
            Tu backoffice fue desplegado exitosamente.
          </p>
          <a
            href={`https://${url}`}
            className="btn-gradient inline-block px-8 py-3 rounded-xl font-heading font-semibold text-sm"
          >
            Ir a mi backoffice →
          </a>
        </>
      )}

      {status === "error" && (
        <>
          <div className="w-12 h-12 rounded-full mx-auto mb-6 flex items-center justify-center"
            style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.18)" }}>
            <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>
          <h1 className="font-heading font-extrabold text-white text-2xl mb-2">
            Tomó más de lo esperado
          </h1>
          <p className="text-white/40 text-sm mb-6">
            Tu pago fue procesado. El equipo activará tu portal en breve.
          </p>
          <a href="mailto:hola@neurolinks.com.ar"
            className="text-accent-subtle hover:text-white text-sm font-semibold transition-colors">
            Contactar soporte
          </a>
        </>
      )}
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

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

export default function NuevoProductoPage() {
  const router = useRouter();
  const [empresa, setEmpresa] = useState("");
  const [slug, setSlug] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSlugChange = (e) => {
    // Only allow lowercase letters, numbers, and hyphens
    const val = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "");
    setSlug(val);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!empresa.trim() || !slug.trim()) {
      setError("Completá todos los campos requeridos.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/portal/nuevo-producto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proyecto_slug: slug,
          empresa: empresa
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Ocurrió un error al crear la instancia.");
      }

      router.push("/portal/dashboard");
      router.refresh();
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex flex-col justify-between relative overflow-hidden bg-transparent text-white w-full">
      {/* Background glow effects */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-glow-accent opacity-15 pointer-events-none" />

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

          <Link href="/portal/dashboard" className="group inline-flex items-center gap-1.5 sm:gap-2 text-white/50 hover:text-white transition-colors duration-200">
            <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 transition-transform group-hover:-translate-x-0.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
            <span className="text-[10px] sm:text-xs font-semibold">Volver al dashboard</span>
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-4 py-8 sm:py-12">
        <div className="w-full max-w-md lg:max-w-3xl">

          {/* Page intro */}
          <div className="text-center mb-8">
            <p className="text-accent-light text-xs font-heading font-semibold tracking-widest uppercase mb-2">
              Autogestión de instancias
            </p>
            <h1 className="font-heading font-extrabold text-white text-3xl mb-2">
              Nuevo Producto / Canal
            </h1>
            <p className="text-white/40 text-sm">
              Registrá una nueva instancia para implementar tus chatbots y campañas de WhatsApp.
            </p>
          </div>

          {/* Form Card */}
          <div className="glass-strong rounded-2xl p-8 border border-white/[0.05]">
            <form onSubmit={handleSubmit} className="space-y-6">

              {/* Error Banner */}
              {error && (
                <div className="flex items-start gap-2.5 rounded-xl px-4 py-3"
                  style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.18)" }}>
                  <svg className="w-4 h-4 text-red-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                  <span className="text-red-400/90 text-sm leading-snug">{error}</span>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Empresa / Proyecto */}
                <div>
                  <label className="block text-[11px] font-heading font-semibold tracking-wide uppercase text-white/40 mb-1.5">
                    Nombre del Proyecto
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Neurolinks Ventas"
                    value={empresa}
                    onChange={(e) => setEmpresa(e.target.value)}
                    className="w-full bg-white/[0.03] border border-white/[0.08] hover:border-white/[0.14] focus:border-accent/50 rounded-xl px-4 py-2.5 text-white placeholder:text-white/20 text-sm outline-none transition-all duration-200"
                  />
                </div>

                {/* Subdominio Slug */}
                <div>
                  <label className="block text-[11px] font-heading font-semibold tracking-wide uppercase text-white/40 mb-1.5">
                    Subdominio sugerido (Slug)
                  </label>
                  <div className="flex items-center bg-white/[0.03] border border-white/[0.08] hover:border-white/[0.14] focus-within:border-accent/50 rounded-xl px-4 py-2.5 transition-all duration-200">
                    <input
                      type="text"
                      required
                      placeholder="ej-mi-canal"
                      value={slug}
                      onChange={handleSlugChange}
                      className="flex-1 bg-transparent text-white placeholder:text-white/20 text-sm outline-none w-full min-w-0"
                    />
                    <span className="text-white/25 text-xs select-none shrink-0 whitespace-nowrap">.clientesneurolinks.com</span>
                  </div>
                  <p className="text-[10px] text-white/30 mt-1.5">
                    Solo minúsculas, números y guiones. Será la URL final de tu backoffice.
                  </p>
                </div>
              </div>

              {/* Submit CTA */}
              <button
                type="submit"
                disabled={loading}
                className="btn-gradient w-full py-3.5 rounded-xl font-heading font-semibold text-sm transition-all hover:scale-[1.01] hover:shadow-[0_0_20px_rgba(0,153,255,0.35)] disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? "Creando instancia..." : "Generar producto →"}
              </button>

            </form>
          </div>

        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 py-6 text-center text-white/20 text-xs border-t border-white/[0.04]">
        Neurolinks Portal © {new Date().getFullYear()} · Todos los derechos reservados.
      </footer>
    </div>
  );
}

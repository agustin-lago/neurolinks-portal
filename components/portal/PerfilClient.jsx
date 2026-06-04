"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";

export default function PerfilClient({ user }) {
  const [nombre, setNombre] = useState(user.user_metadata?.nombre || "");
  const [email, setEmail] = useState(user.email || "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!nombre.trim() || !email.trim()) {
      setError("Completá todos los campos requeridos (nombre y email).");
      return;
    }

    if (password && password.length < 6) {
      setError("La nueva contraseña debe tener al menos 6 caracteres.");
      return;
    }

    if (password && password !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const supabase = createClient();
      const updatePayload = {};

      // 1. Check for email updates
      if (email.trim().toLowerCase() !== user.email.toLowerCase()) {
        updatePayload.email = email.trim();
      }

      // 2. Check for password updates
      if (password) {
        updatePayload.password = password;
      }

      // 3. Check for metadata updates
      const currentNombre = user.user_metadata?.nombre || "";
      if (nombre.trim() !== currentNombre) {
        updatePayload.data = {
          ...user.user_metadata,
          nombre: nombre.trim()
        };
      }

      if (Object.keys(updatePayload).length === 0) {
        setSuccess("No realizaste ningún cambio.");
        setLoading(false);
        return;
      }

      // 4. Update Supabase Auth User
      const { error: authError } = await supabase.auth.updateUser(updatePayload);
      if (authError) throw authError;

      // 5. Update client details in 'clientes' database table
      const { error: dbError } = await supabase
        .from("clientes")
        .update({
          email: email.trim(),
          nombre: nombre.trim(),
          updated_at: new Date().toISOString()
        })
        .eq("auth_user_id", user.id);

      if (dbError) {
        console.error("[Perfil] DB Sync error:", dbError);
        setSuccess("Datos actualizados en tu cuenta, pero hubo un detalle sincronizando la base de datos.");
      } else {
        if (updatePayload.email) {
          setSuccess("¡Perfil actualizado con éxito! Enviamos un correo de confirmación a tu nueva dirección para completar el cambio de email.");
        } else {
          setSuccess("¡Perfil actualizado con éxito!");
        }
      }

      // Clear password fields on success
      setPassword("");
      setConfirmPassword("");
    } catch (err) {
      console.error("[Perfil] Update error:", err);
      setError(err.message || "Ocurrió un error al actualizar los datos.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-between bg-transparent text-white relative overflow-hidden w-full">
      {/* Glow effect */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-glow-accent opacity-15 pointer-events-none" />

      {/* Header */}
      <header className="relative z-10 w-full max-w-4xl mx-auto px-6 py-6 flex items-center justify-between border-b border-white/[0.04]">
        <Link href="/portal/dashboard" className="group flex items-center gap-2 text-white/50 hover:text-white transition-colors duration-200">
          <svg className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          <span className="text-xs font-semibold">Volver al dashboard</span>
        </Link>
        
        <Image
          src="/images/neuro-logo.png"
          alt="Neurolinks"
          width={110}
          height={44}
          className="object-contain w-24 h-auto"
          priority
        />
      </header>

      {/* Main Form */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          
          <div className="text-center mb-8">
            <p className="text-accent-light text-xs font-heading font-semibold tracking-widest uppercase mb-2">
              Configuración de cuenta
            </p>
            <h1 className="font-heading font-extrabold text-white text-3xl mb-2">
              Mi Perfil de Usuario
            </h1>
            <p className="text-white/40 text-sm">
              Modificá tu información de contacto o actualizá tu contraseña de acceso.
            </p>
          </div>

          <div className="glass-strong rounded-2xl p-8 border border-white/[0.05]">
            <form onSubmit={handleSubmit} className="space-y-5">
              
              {/* Error Banner */}
              {error && (
                <div className="flex items-start gap-2.5 rounded-xl px-4 py-3 bg-red-500/10 border border-red-500/20">
                  <svg className="w-4 h-4 text-red-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                  <span className="text-red-400/90 text-sm leading-snug">{error}</span>
                </div>
              )}

              {/* Success Banner */}
              {success && (
                <div className="flex items-start gap-2.5 rounded-xl px-4 py-3 bg-emerald-500/10 border border-emerald-500/20">
                  <svg className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                  <span className="text-emerald-400/90 text-sm leading-snug">{success}</span>
                </div>
              )}

              {/* Nombre */}
              <div>
                <label className="block text-[11px] font-heading font-semibold tracking-wide uppercase text-white/40 mb-1.5">
                  Nombre Completo / Empresa
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Juan Pérez"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  className="w-full bg-white/[0.03] border border-white/[0.08] hover:border-white/[0.14] focus:border-accent/50 rounded-xl px-4 py-2.5 text-white placeholder:text-white/20 text-sm outline-none transition-all duration-200"
                />
              </div>

              {/* Correo Electrónico */}
              <div>
                <label className="block text-[11px] font-heading font-semibold tracking-wide uppercase text-white/40 mb-1.5">
                  Correo Electrónico (Email)
                </label>
                <input
                  type="email"
                  required
                  placeholder="ejemplo@correo.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-white/[0.03] border border-white/[0.08] hover:border-white/[0.14] focus:border-accent/50 rounded-xl px-4 py-2.5 text-white placeholder:text-white/20 text-sm outline-none transition-all duration-200"
                />
              </div>

              <div className="h-px bg-white/[0.05] my-4" />

              {/* Nueva Contraseña */}
              <div>
                <label className="block text-[11px] font-heading font-semibold tracking-wide uppercase text-white/40 mb-1.5">
                  Nueva Contraseña (Opcional)
                </label>
                <input
                  type="password"
                  placeholder="Dejar en blanco para mantener actual"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-white/[0.03] border border-white/[0.08] hover:border-white/[0.14] focus:border-accent/50 rounded-xl px-4 py-2.5 text-white placeholder:text-white/20 text-sm outline-none transition-all duration-200"
                />
              </div>

              {/* Confirmar Contraseña */}
              <div>
                <label className="block text-[11px] font-heading font-semibold tracking-wide uppercase text-white/40 mb-1.5">
                  Confirmar Nueva Contraseña
                </label>
                <input
                  type="password"
                  placeholder="Repetí la contraseña"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full bg-white/[0.03] border border-white/[0.08] hover:border-white/[0.14] focus:border-accent/50 rounded-xl px-4 py-2.5 text-white placeholder:text-white/20 text-sm outline-none transition-all duration-200"
                />
              </div>

              {/* Submit CTA */}
              <button
                type="submit"
                disabled={loading}
                className="btn-gradient w-full py-3.5 rounded-xl font-heading font-semibold text-sm transition-all hover:scale-[1.01] hover:shadow-[0_0_20px_rgba(0,153,255,0.35)] disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? "Guardando cambios..." : "Guardar cambios"}
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

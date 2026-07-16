"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import PortalPageWrapper from "./layout/PortalPageWrapper";
import GlassCard from "../ui/GlassCard";

export default function PerfilClient({ user, isUserAdmin, clientDbData }) {
  const [nombre, setNombre] = useState(clientDbData?.nombre || user.user_metadata?.nombre || "");
  const [empresa, setEmpresa] = useState(clientDbData?.empresa || user.user_metadata?.empresa || "");
  const [telefono, setTelefono] = useState(clientDbData?.telefono || user.user_metadata?.telefono || "");
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
        if (password !== confirmPassword) {
          setError("Las contraseñas no coinciden");
          setLoading(false);
          return;
        }
        updatePayload.password = password;
      }

      // 3. Check for metadata updates
      const currentNombre = user.user_metadata?.nombre || "";
      const currentTelefono = user.user_metadata?.telefono || "";
      const currentEmpresa = user.user_metadata?.empresa || "";

      if (nombre.trim() !== currentNombre || telefono.trim() !== currentTelefono || empresa.trim() !== currentEmpresa || password) {
        updatePayload.data = {
          ...user.user_metadata,
          nombre: nombre.trim(),
          telefono: telefono.trim(),
          empresa: empresa.trim(),
          ...(password ? { plain_password: 'ENCRIPTADA' } : {})
        };
      }

      if (Object.keys(updatePayload).length === 0) {
        setSuccess("No realizaste ningún cambio.");
        setLoading(false);
        return;
      }

      // 4. Update Supabase Auth User
      const { error: authError } = await supabase.auth.updateUser(updatePayload);

      if (authError) {
        setError("Error al actualizar la cuenta: " + authError.message);
        setLoading(false);
        return;
      }

      // 5. Update client details in 'clientes' database table (Main source of truth for Control)
      // Since a user can have multiple rows in 'clientes', we update all rows for this auth_user_id
      // to keep their global profile info in sync, EXCEPT 'empresa' which is the project name.
      const { data: clientData, error: dbError } = await supabase
        .from("clientes")
        .update({
          email: email.trim(),
          nombre: nombre.trim(),
          telefono: telefono.trim() || null,
          empresa: empresa.trim() || null,
          updated_at: new Date().toISOString()
        })
        .eq("auth_user_id", user.id)
        .select('id')
        .limit(1)
        .maybeSingle();

      if (dbError) {
        console.error("[Perfil] DB Sync error:", dbError);
        setSuccess("Datos actualizados en tu cuenta, pero hubo un detalle sincronizando la base de datos.");
      } else {
        if (clientData?.id) {
          // Sync settings for password/email changes
          if (password || (email.trim() && email.trim() !== user.email)) {
            const updates = [];
            
            // Function to push settings
            const pushSetting = (pId, k, v) => {
              updates.push(supabase.from('settings').upsert({
                project_id: pId,
                key: k,
                value: 'b64:' + btoa(v),
                updated_at: new Date().toISOString()
              }, { onConflict: 'project_id,key' }));
            };

            // 1. Update fallback client settings
            if (password) pushSetting(`client_${clientData.id}`, 'ADMIN_PASS', password);
            if (email.trim() && email.trim() !== user.email) pushSetting(`client_${clientData.id}`, 'ADMIN_USER', email.trim());

            // 2. Fetch linked projects to update them as well (prevents stale password on control reload)
            const { data: subs } = await supabase
              .from('suscripciones_proyectos')
              .select('tokens_backoffice')
              .eq('cliente_id', clientData.id);

            if (subs && subs.length > 0) {
              const allProjectIds = new Set();
              subs.forEach(sub => {
                if (sub.tokens_backoffice) {
                  sub.tokens_backoffice.forEach(id => allProjectIds.add(id));
                }
              });

              for (const projectId of allProjectIds) {
                if (projectId) {
                  if (password) pushSetting(projectId, 'ADMIN_PASS', password);
                  if (email.trim() && email.trim() !== user.email) pushSetting(projectId, 'ADMIN_USER', email.trim());
                }
              }
            }

            // Execute all settings upserts concurrently
            await Promise.all(updates);
          }
        }

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
    <PortalPageWrapper isUserAdmin={isUserAdmin} className="items-center justify-center">
      <div className="w-full max-w-md lg:max-w-3xl">

        <div className="text-center mb-6 sm:mb-8">
          <p className="text-accent-light text-[10px] sm:text-xs font-heading font-semibold tracking-widest uppercase mb-1.5 sm:mb-2">
            Configuración de cuenta
          </p>
          <h1 className="font-heading font-extrabold text-white text-2xl sm:text-3xl mb-1.5 sm:mb-2">
            Mi Perfil de Usuario
          </h1>
          <p className="text-white/40 text-xs sm:text-sm px-2 sm:px-0">
            Modificá tu información de contacto o actualizá tu contraseña de acceso.
          </p>
        </div>

        <GlassCard className="p-5 sm:p-8">
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">

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

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Nombre */}
              <div>
                <label className="block text-[11px] font-heading font-semibold tracking-wide uppercase text-white/40 mb-1.5">
                  Nombre Completo
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
              {/* Empresa */}
              <div>
                <label className="block text-[11px] font-heading font-semibold tracking-wide uppercase text-white/40 mb-1.5">
                  Nombre de la Empresa
                </label>
                <input
                  type="text"
                  placeholder="Ej. Mi Compañía S.A."
                  value={empresa}
                  onChange={(e) => setEmpresa(e.target.value)}
                  className="w-full bg-white/[0.03] border border-white/[0.08] hover:border-white/[0.14] focus:border-accent/50 rounded-xl px-4 py-2.5 text-white placeholder:text-white/20 text-sm outline-none transition-all duration-200"
                />
              </div>


              {/* Teléfono */}
              <div>
                <label className="block text-[11px] font-heading font-semibold tracking-wide uppercase text-white/40 mb-1.5">
                  Teléfono de Contacto
                </label>
                <input
                  type="tel"
                  placeholder="+54 9 11 1234-5678"
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
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
            </div>

            <div className="h-px bg-white/[0.05] my-1" />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
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
            </div>

            {/* Submit CTA */}
            <button
              type="submit"
              disabled={loading}
              className="btn-gradient w-full py-3.5 rounded-xl font-heading font-semibold text-sm transition-all hover:scale-[1.01] hover:shadow-[0_0_20px_rgba(0,153,255,0.35)] disabled:opacity-60 disabled:cursor-not-allowed lg:mt-2"
            >
              {loading ? "Guardando cambios..." : "Guardar cambios"}
            </button>

          </form>
        </GlassCard>

      </div>
    </PortalPageWrapper>
  );
}

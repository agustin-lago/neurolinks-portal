"use client";

import { useState, forwardRef } from "react";
import { useForm } from "react-hook-form";
import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const slideVariants = {
  enter: (dir) => ({ x: dir * 28, opacity: 0 }),
  center: { x: 0, opacity: 1, transition: { duration: 0.22, ease: "easeOut" } },
  exit:  (dir) => ({ x: dir * -28, opacity: 0, transition: { duration: 0.16, ease: "easeIn" } }),
};

const ERROR_MAP = {
  "Invalid login credentials":               "Email o contraseña incorrectos.",
  "Email not confirmed":                     "Confirmá tu email antes de ingresar.",
  "User already registered":                 "Ya existe una cuenta con ese email.",
  "Password should be at least 6 characters":"La contraseña debe tener al menos 6 caracteres.",
};
const parseError = (msg) => ERROR_MAP[msg] ?? "Ocurrió un error. Intentá de nuevo.";

/* ── Shared UI ── */
const Input = forwardRef(function Input({ label, error, ...props }, ref) {
  return (
    <div>
      <label className="block text-[11px] font-heading font-semibold tracking-wide uppercase text-white/40 mb-1.5">
        {label}
      </label>
      <input
        ref={ref}
        className={`w-full bg-white/[0.05] border rounded-xl px-4 py-2.5 text-white placeholder:text-white/20 text-sm outline-none transition-colors duration-200 ${
          error
            ? "border-red-500/50 focus:border-red-500/70"
            : "border-white/[0.08] hover:border-white/[0.14] focus:border-accent/50"
        }`}
        {...props}
      />
      {error && <p className="text-red-400/75 text-[10px] mt-1">{error}</p>}
    </div>
  );
});

function ErrorBanner({ message }) {
  if (!message) return null;
  return (
    <div className="flex items-start gap-2.5 rounded-xl px-4 py-3"
      style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.18)" }}>
      <svg className="w-4 h-4 text-red-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
      </svg>
      <span className="text-red-400/90 text-sm">{message}</span>
    </div>
  );
}

function SuccessBanner({ message }) {
  if (!message) return null;
  return (
    <div className="flex items-start gap-2.5 rounded-xl px-4 py-3"
      style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)" }}>
      <svg className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
      </svg>
      <span className="text-emerald-400/90 text-sm">{message}</span>
    </div>
  );
}

function Divider() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-px bg-white/[0.07]" />
      <span className="text-white/25 text-[10px] font-heading font-semibold tracking-wider uppercase">o continuá con</span>
      <div className="flex-1 h-px bg-white/[0.07]" />
    </div>
  );
}

function GoogleButton({ text, loading, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="w-full flex items-center justify-center gap-3 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.09] hover:border-white/[0.18] rounded-xl px-4 py-2.5 text-white/65 hover:text-white/90 text-sm font-heading font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
      </svg>
      {text}
    </button>
  );
}

/* ── Forms ── */
function LoginForm({ onSwitch, onForgot }) {
  const { register, handleSubmit, formState: { errors } } = useForm();
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const router   = useRouter();
  const supabase = createClient();

  const onSubmit = async ({ email, contrasena }) => {
    setLoading(true);
    setError("");
    const { error } = await supabase.auth.signInWithPassword({ email, password: contrasena });
    if (error) {
      setError(parseError(error.message));
      setLoading(false);
    } else {
      router.refresh();
    }
  };

  const handleGoogle = async () => {
    setLoading(true);
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="text-center mb-6">
        <h2 className="font-heading font-extrabold text-white text-2xl mb-1">Bienvenido</h2>
        <p className="text-white/40 text-sm">Ingresá a tu portal de cliente</p>
      </div>

      <ErrorBanner message={error} />

      <Input
        label="Email"
        type="email"
        placeholder="tu@email.com"
        error={errors.email?.message}
        {...register("email", { required: "El email es obligatorio" })}
      />

      <div>
        <Input
          label="Contraseña"
          type="password"
          placeholder="••••••••"
          error={errors.contrasena?.message}
          {...register("contrasena", { required: "La contraseña es obligatoria" })}
        />
        <div className="flex justify-end mt-1.5">
          <button type="button" onClick={onForgot}
            className="text-[11px] text-white/30 hover:text-accent-subtle transition-colors">
            ¿Olvidaste tu contraseña?
          </button>
        </div>
      </div>

      <button type="submit" disabled={loading}
        className="btn-gradient w-full py-3 rounded-xl font-heading font-semibold text-sm disabled:opacity-60 disabled:cursor-not-allowed">
        {loading ? "Ingresando..." : "Ingresar"}
      </button>

      <Divider />
      <GoogleButton text="Ingresar con Google" loading={loading} onClick={handleGoogle} />

      <p className="text-center text-sm text-white/35 pt-1">
        ¿No tenés cuenta?{" "}
        <button type="button" onClick={onSwitch}
          className="text-accent-subtle hover:text-white transition-colors font-semibold">
          Creá una
        </button>
      </p>
    </form>
  );
}

function RegisterForm({ onSwitch }) {
  const { register, handleSubmit, formState: { errors } } = useForm();
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [success, setSuccess]   = useState("");
  const supabase = createClient();

  const onSubmit = async ({ nombre, apellido, email, telefono, contrasena, proyecto }) => {
    setLoading(true);
    setError("");
    const { error } = await supabase.auth.signUp({
      email,
      password: contrasena,
      options: {
        data: { nombre, apellido, telefono, proyecto },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      setError(parseError(error.message));
    } else {
      setSuccess("¡Cuenta creada! Revisá tu email para confirmar el registro.");
    }
    setLoading(false);
  };

  const handleGoogle = async () => {
    setLoading(true);
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="text-center mb-6">
        <h2 className="font-heading font-extrabold text-white text-2xl mb-1">Crear cuenta</h2>
        <p className="text-white/40 text-sm">Completá tus datos para empezar</p>
      </div>

      <ErrorBanner message={error} />
      <SuccessBanner message={success} />

      {!success && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Nombre"   placeholder="Juan"   error={errors.nombre?.message}
              {...register("nombre",   { required: "Requerido" })} />
            <Input label="Apellido" placeholder="García" error={errors.apellido?.message}
              {...register("apellido", { required: "Requerido" })} />
          </div>

          <Input label="Email" type="email" placeholder="tu@email.com" error={errors.email?.message}
            {...register("email", { required: "El email es obligatorio" })} />

          <div className="grid grid-cols-2 gap-3">
            <Input label="Teléfono" type="tel" placeholder="+54 9 11..." error={errors.telefono?.message}
              {...register("telefono", { required: "Requerido" })} />
            <Input label="Contraseña" type="password" placeholder="••••••••" error={errors.contrasena?.message}
              {...register("contrasena", { required: "Requerida", minLength: { value: 6, message: "Mín. 6 caracteres" } })} />
          </div>

          <Input label="Nombre del proyecto" placeholder="Mi proyecto" error={errors.proyecto?.message}
            {...register("proyecto", { required: "El nombre del proyecto es obligatorio" })} />

          <button type="submit" disabled={loading}
            className="btn-gradient w-full py-3 rounded-xl font-heading font-semibold text-sm disabled:opacity-60 disabled:cursor-not-allowed">
            {loading ? "Creando cuenta..." : "Crear cuenta"}
          </button>

          <Divider />
          <GoogleButton text="Registrarse con Google" loading={loading} onClick={handleGoogle} />
        </>
      )}

      <p className="text-center text-sm text-white/35 pt-1">
        ¿Ya tenés cuenta?{" "}
        <button type="button" onClick={onSwitch}
          className="text-accent-subtle hover:text-white transition-colors font-semibold">
          Ingresá
        </button>
      </p>
    </form>
  );
}

function ForgotForm({ onBack }) {
  const { register, handleSubmit, formState: { errors } } = useForm();
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [sent, setSent]       = useState(false);
  const supabase = createClient();

  const onSubmit = async ({ email }) => {
    setLoading(true);
    setError("");
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/portal/reset-password`,
    });
    if (error) {
      setError(parseError(error.message));
    } else {
      setSent(true);
    }
    setLoading(false);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="text-center mb-6">
        <h2 className="font-heading font-extrabold text-white text-2xl mb-1">Recuperar contraseña</h2>
        <p className="text-white/40 text-sm">Te enviamos un enlace a tu email</p>
      </div>

      <ErrorBanner message={error} />

      {sent ? (
        <SuccessBanner message="¡Listo! Revisá tu email para restablecer tu contraseña." />
      ) : (
        <>
          <Input label="Email" type="email" placeholder="tu@email.com" error={errors.email?.message}
            {...register("email", { required: "El email es obligatorio" })} />
          <button type="submit" disabled={loading}
            className="btn-gradient w-full py-3 rounded-xl font-heading font-semibold text-sm disabled:opacity-60 disabled:cursor-not-allowed">
            {loading ? "Enviando..." : "Enviar enlace"}
          </button>
        </>
      )}

      <p className="text-center text-sm text-white/35 pt-1">
        <button type="button" onClick={onBack}
          className="text-accent-subtle hover:text-white transition-colors font-semibold">
          ← Volver al inicio de sesión
        </button>
      </p>
    </form>
  );
}

/* ── Root card ── */
export default function AuthCard() {
  const [mode, setMode] = useState("login");
  const [dir,  setDir]  = useState(1);

  const DIRS = {
    login:    { register: 1,  forgot: 1  },
    register: { login: -1 },
    forgot:   { login: -1 },
  };

  const switchTo = (next) => {
    setDir(DIRS[mode]?.[next] ?? 1);
    setMode(next);
  };

  return (
    <div className="glass-strong rounded-2xl overflow-hidden w-full">
      <div className="p-8">
        <AnimatePresence mode="wait" custom={dir}>
          {mode === "login" ? (
            <motion.div key="login" custom={dir} variants={slideVariants} initial="enter" animate="center" exit="exit">
              <LoginForm onSwitch={() => switchTo("register")} onForgot={() => switchTo("forgot")} />
            </motion.div>
          ) : mode === "register" ? (
            <motion.div key="register" custom={dir} variants={slideVariants} initial="enter" animate="center" exit="exit">
              <RegisterForm onSwitch={() => switchTo("login")} />
            </motion.div>
          ) : (
            <motion.div key="forgot" custom={dir} variants={slideVariants} initial="enter" animate="center" exit="exit">
              <ForgotForm onBack={() => switchTo("login")} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

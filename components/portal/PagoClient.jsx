"use client";

import { useState } from "react";

const FEATURES_MAP = {
  masivo_meta: [
    "Envía campañas masivas por WhatsApp",
    "API Oficial de Meta integrada",
    "Estadísticas detalladas de envíos",
    "Soporte multi-dispositivo y multi-línea",
    "Acceso completo a plantillas aprobadas",
  ],
  chatbot_ia: [
    "Atención al cliente inteligente 24/7",
    "IA avanzada integrada con ChatGPT/Neurolinks",
    "Base de conocimiento personalizada",
    "Derivación inteligente a agentes humanos",
    "Métricas de conversión y satisfacción",
  ]
};

const PLAN_PRICES = {
  masivo_meta: {
    1: 63000,
    2: 99000,
    3: 120000,
  },
  chatbot_ia: {
    1: 210000,
  }
};

function CheckIcon() {
  return (
    <svg className="w-4 h-4 text-accent shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
    </svg>
  );
}

export default function PagoClient({ cliente, planesPrincipales = [] }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  
  // Set defaults: plan_tipo = 'masivo_meta', lineas_cantidad = 1 as per user requirements
  const [activePlan, setActivePlan] = useState("masivo_meta");
  const [linesCount, setLinesCount] = useState(1);
  const [region, setRegion] = useState("AR"); // AR = Argentina (MercadoPago), INT = Resto del Mundo (PayPal)

  // USD equivalents for international pricing
  const USD_PRICES = {
    masivo_meta: {
      1: 45,
      2: 70,
      3: 95,
    },
    chatbot_ia: {
      1: 150,
    }
  };

  // Helper to dynamically extract plan price from planesPrincipales, otherwise fallback to local constant
  const getDynamicPrice = (planTipo, lineas) => {
    const foundPlan = (planesPrincipales || []).find(
      p => p.plan_tipo === planTipo && p.lineas_cantidad === lineas
    );
    return foundPlan ? foundPlan.monto : PLAN_PRICES[planTipo][lineas];
  };

  const currentPrice = getDynamicPrice(activePlan, linesCount);
  const currentUsdPrice = USD_PRICES[activePlan][linesCount];

  const handlePay = async () => {
    if (region === "INT") {
      const planName = activePlan === "chatbot_ia" ? "Chatbot IA" : `Envíos Masivos - ${linesCount} Línea(s)`;
      const message = `Hola! Seleccioné el plan "${planName}" y quiero realizar mi pago desde el exterior (Resto del Mundo) vía PayPal. ¿Me ayudan con la activación manual?`;
      window.open(`https://wa.me/5491170644247?text=${encodeURIComponent(message)}`, "_blank");
      return;
    }

    setLoading(true);
    setError("");
    try {
      // 1. Guardar el plan seleccionado en base de datos
      const saveRes = await fetch("/api/pago/guardar-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan_tipo: activePlan,
          lineas_cantidad: linesCount
        })
      });
      const saveData = await saveRes.json();
      if (!saveRes.ok) throw new Error(saveData.error || "Error al registrar el plan elegido.");

      // 2. Generar el checkout
      const res = await fetch("/api/pago/crear", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.init_point) throw new Error(data.error ?? "Error al crear el portal de pago.");
      
      window.location.href = data.init_point;
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Header */}
      <div className="text-center mb-8">
        <p className="text-white/25 text-xs font-heading font-semibold tracking-widest uppercase mb-3 animate-pulse">
          Completar suscripción
        </p>
        <h1 className="font-heading font-extrabold text-white text-3xl md:text-4xl mb-2">
          Elegí tu plan de servicio
        </h1>
        <p className="text-white/40 text-sm max-w-md mx-auto">
          Seleccioná la solución de Neurolinks que mejor se adapte a tu negocio. Tu portal se desplegará de forma automática tras el pago.
        </p>
      </div>

      {/* Region/Country Pill Selector */}
      <div className="flex justify-center mb-8">
        <div className="inline-flex p-1 rounded-full bg-white/[0.02] border border-white/[0.08] backdrop-blur-md">
          <button
            type="button"
            onClick={() => setRegion("AR")}
            className={`px-6 py-2.5 rounded-full text-xs font-semibold transition-all duration-300 flex items-center gap-2 ${
              region === "AR"
                ? "bg-accent text-white shadow-[0_0_15px_rgba(0,153,255,0.3)]"
                : "text-white/40 hover:text-white/70"
            }`}
          >
            <span>🇦🇷</span> Argentina
          </button>
          <button
            type="button"
            onClick={() => setRegion("INT")}
            className={`px-6 py-2.5 rounded-full text-xs font-semibold transition-all duration-300 flex items-center gap-2 ${
              region === "INT"
                ? "bg-accent text-white shadow-[0_0_15px_rgba(0,153,255,0.3)]"
                : "text-white/40 hover:text-white/70"
            }`}
          >
            <span>🌐</span> Resto del Mundo
          </button>
        </div>
      </div>

      {/* Plan switch container */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* Option 1: Envíos Masivos */}
        <div
          onClick={() => {
            setActivePlan("masivo_meta");
            setLinesCount(1);
          }}
          className={`cursor-pointer p-6 rounded-2xl border transition-all duration-300 relative overflow-hidden flex flex-col justify-between ${
            activePlan === "masivo_meta"
              ? "border-accent bg-accent/[0.04] shadow-[0_0_25px_rgba(0,153,255,0.12)]"
              : "border-white/[0.08] hover:border-white/[0.16] bg-white/[0.01] hover:bg-white/[0.02]"
          }`}
        >
          {activePlan === "masivo_meta" && (
            <div className="absolute top-0 right-0 w-24 h-24 bg-accent/10 rounded-full blur-xl pointer-events-none" />
          )}
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-white/30 text-[10px] font-heading font-bold uppercase tracking-wider">Plan Oficial</span>
              {activePlan === "masivo_meta" && (
                <span className="w-2.5 h-2.5 rounded-full bg-accent animate-pulse" />
              )}
            </div>
            <h3 className="font-heading font-extrabold text-white text-lg mb-1.5">
              Envíos Masivos & API META
            </h3>
            <p className="text-white/45 text-xs leading-relaxed">
              Ideal para marketing y notificaciones masivas automatizadas conectadas al canal oficial de WhatsApp de Meta.
            </p>
          </div>
          <div className="mt-6 flex items-baseline gap-1.5">
            <span className="text-white/30 text-xs">Desde</span>
            <span className="font-heading font-extrabold text-white text-2xl">
              {region === "AR" 
                ? `$${getDynamicPrice("masivo_meta", 1).toLocaleString("es-AR")}`
                : `U$D ${USD_PRICES.masivo_meta[1]}`
              }
            </span>
            <span className="text-white/30 text-xs">
              {region === "AR" ? "ARS / mes" : "USD / mes"}
            </span>
          </div>
        </div>

        {/* Option 2: Chatbot IA */}
        <div
          onClick={() => {
            setActivePlan("chatbot_ia");
            setLinesCount(1);
          }}
          className={`cursor-pointer p-6 rounded-2xl border transition-all duration-300 relative overflow-hidden flex flex-col justify-between ${
            activePlan === "chatbot_ia"
              ? "border-accent bg-accent/[0.04] shadow-[0_0_25px_rgba(0,153,255,0.12)]"
              : "border-white/[0.08] hover:border-white/[0.16] bg-white/[0.01] hover:bg-white/[0.02]"
          }`}
        >
          {activePlan === "chatbot_ia" && (
            <div className="absolute top-0 right-0 w-24 h-24 bg-accent/10 rounded-full blur-xl pointer-events-none" />
          )}
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-white/30 text-[10px] font-heading font-bold uppercase tracking-wider">Automatizado</span>
              {activePlan === "chatbot_ia" && (
                <span className="w-2.5 h-2.5 rounded-full bg-accent animate-pulse" />
              )}
            </div>
            <h3 className="font-heading font-extrabold text-white text-lg mb-1.5">
              Chatbot Inteligencia Artificial
            </h3>
            <p className="text-white/45 text-xs leading-relaxed">
              Atención inteligente entrenada con IA para resolver dudas de clientes, cotizar y derivar chats sin intervenciones.
            </p>
          </div>
          <div className="mt-6 flex items-baseline gap-1.5">
            <span className="font-heading font-extrabold text-white text-2xl">
              {region === "AR" 
                ? `$${getDynamicPrice("chatbot_ia", 1).toLocaleString("es-AR")}`
                : `U$D ${USD_PRICES.chatbot_ia[1]}`
              }
            </span>
            <span className="text-white/30 text-xs">
              {region === "AR" ? "ARS / mes" : "USD / mes"}
            </span>
          </div>
        </div>
      </div>

      {/* Detail Card */}
      <div className="glass-strong rounded-2xl overflow-hidden border border-white/[0.05] p-6 mb-6">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
          {/* Left specs: line options & features */}
          <div className="flex-1">
            <h4 className="font-heading font-bold text-white text-base mb-3">
              Configurá tu suscripción
            </h4>

            {activePlan === "masivo_meta" ? (
              <div className="mb-5">
                <p className="text-white/40 text-xs mb-2">Cantidad de Líneas de WhatsApp asociadas:</p>
                <div className="flex gap-2">
                  {[1, 2, 3].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setLinesCount(num)}
                      className={`flex-1 py-2.5 rounded-xl border text-center transition-all ${
                        linesCount === num
                          ? "border-accent/50 bg-accent/8 text-white font-heading font-bold"
                          : "border-white/[0.08] hover:border-white/[0.15] bg-white/[0.02] text-white/50 text-sm"
                      }`}
                    >
                      {num} {num === 1 ? "Línea" : "Líneas"}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-white/30 mt-2">
                  ⚠️ Se {linesCount === 1 ? "desplegará" : "desplegarán"} {linesCount} {linesCount === 1 ? "proyecto independiente asociado" : "proyectos independientes asociados"} a tu cuenta.
                </p>
              </div>
            ) : (
              <div className="mb-5">
                <p className="text-white/40 text-xs mb-2">Líneas de WhatsApp incluidas:</p>
                <div className="py-2.5 px-4 rounded-xl border border-white/[0.08] bg-white/[0.02] text-white/60 text-xs inline-block">
                  ⚠️ Se desplegará 1 proyecto independiente asociado a tu cuenta.
                </div>
              </div>
            )}



            <div className="h-px bg-white/[0.06] my-4" />

            {/* Features */}
            <p className="text-white/40 text-xs mb-2.5">Beneficios del plan elegidos:</p>
            <ul className="space-y-2">
              {FEATURES_MAP[activePlan].map((feature) => (
                <li key={feature} className="flex items-start gap-2">
                  <CheckIcon />
                  <span className="text-white/60 text-xs leading-tight">{feature}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Right specs: total pricing and active activation CTA */}
          <div className="w-full md:w-56 bg-white/[0.02] border border-white/[0.05] rounded-xl p-5 flex flex-col justify-between self-stretch">
            <div className="text-center md:text-left mb-4">
              <p className="text-white/30 text-[10px] font-heading font-bold uppercase tracking-wider mb-1">
                Resumen de abono
              </p>
              <p className="text-gradient-accent font-heading font-extrabold text-3xl leading-none">
                {region === "AR"
                  ? `$${currentPrice.toLocaleString("es-AR")}`
                  : `U$D ${currentUsdPrice}`
                }
              </p>
              <p className="text-white/20 text-[10px] mt-1">
                {region === "AR" ? "ARS / mes" : "USD / mes"}
              </p>
            </div>

            <div className="space-y-3">
              {region === "INT" && (
                <div className="rounded-lg p-2.5 bg-yellow-500/[0.05] border border-yellow-500/18 flex flex-col gap-1">
                  <span className="text-yellow-400 font-heading font-bold text-[10px] uppercase tracking-wide">
                    🛠️ En Construcción
                  </span>
                  <span className="text-white/60 text-[9px] leading-snug">
                    La pasarela automática por PayPal está en mantenimiento técnico. Contactanos para la activación manual.
                  </span>
                </div>
              )}

              {error && (
                <div className="flex items-start gap-1.5 rounded-lg p-2 bg-red-500/10 border border-red-500/18">
                  <svg className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                  <span className="text-red-400/90 text-[10px] leading-tight">{error}</span>
                </div>
              )}

              <button
                type="button"
                onClick={handlePay}
                disabled={loading}
                className="btn-gradient w-full py-3.5 rounded-xl font-heading font-semibold text-xs transition-all hover:scale-[1.02] hover:shadow-[0_0_20px_rgba(0,153,255,0.3)] disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading 
                  ? "Preparando checkout..." 
                  : region === "AR" 
                    ? "Activar mi portal →" 
                    : "Contactar a Soporte (PayPal) →"
                }
              </button>

              <p className="text-center text-white/20 text-[9px]">
                {region === "AR" 
                  ? "Pago seguro y recurrente vía Mercado Pago."
                  : "Activación inmediata en soporte Neurolinks."
                }
              </p>
            </div>
          </div>
        </div>
      </div>

      <p className="text-center text-white/20 text-xs">
        ¿Alguna consulta técnica?{" "}
        <a href="mailto:hola@neurolinks.com.ar" className="text-accent-subtle hover:text-white transition-colors">
          Contactanos
        </a>
      </p>
    </div>
  );
}

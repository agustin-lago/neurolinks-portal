export function normalizePlanTipo(planTipo) {
  const value = String(planTipo || "").trim().toLowerCase();
  if (["chatbot", "chatbot_ia", "plus"].includes(value)) return "chatbot";
  if (["standar", "standard", "masivo_meta"].includes(value)) return "standar";
  if (value === "personalizado") return "personalizado";
  return "standar";
}

export function getPlanDisplayName(planTipo, lineasCantidad = 1) {
  const normalized = normalizePlanTipo(planTipo);
  if (normalized === "personalizado") return "Personalizado";
  const lines = Math.min(Math.max(Number(lineasCantidad) || 1, 1), 3);
  const suffix = `c/${lines} Linea${lines === 1 ? "" : "s"}`;
  return normalized === "chatbot" ? `Chatbot ${suffix}` : `Standar ${suffix}`;
}

export function isChatbotPlan(planTipo) {
  return normalizePlanTipo(planTipo) === "chatbot";
}
export function getSubscriptionStatus(client) {
  return String(client?.subscription_status || (client?.mp_preapproval_id ? "active" : "pending")).toLowerCase();
}

export function hasPortalAccess(client) {
  const status = getSubscriptionStatus(client);
  return status === "active" || status === "manual";
}

export function isPersonalizado(client) {
  return String(client?.plan || "").toLowerCase() === "personalizado" || String(client?.plan_tipo || "").toLowerCase() === "personalizado";
}

export function getPlanLabel(client) {
  return client?.plan || "Sin plan";
}

export function getInstanceLimit(client) {
  const limit = Number(client?.lineas_cantidad);
  return Number.isFinite(limit) && limit > 0 ? limit : null;
}

export function getUsageLabel(client, used = 0) {
  const limit = getInstanceLimit(client);
  return limit ? `${used}/${limit} instancias` : `${used} instancia${used === 1 ? "" : "s"}`;
}
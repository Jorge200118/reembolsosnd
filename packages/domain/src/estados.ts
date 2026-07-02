export const ESTADOS = [
  "pendiente",
  "en_corte",
  "aprobado",
  "rechazado",
  "solicitado_entrega",
  "entregado",
  "comida_pendiente",
] as const;

export type Estado = (typeof ESTADOS)[number];

// comida_pagada NO se incluye: es estado muerto (solo CSS en el HTML viejo).

export const TRANSICIONES: Record<Estado, readonly Estado[]> = {
  pendiente: ["en_corte", "aprobado", "rechazado"],
  en_corte: ["aprobado", "rechazado"],
  aprobado: ["solicitado_entrega"],
  rechazado: [],
  solicitado_entrega: ["entregado"],
  entregado: [],
  comida_pendiente: ["pendiente"],
};

export function transicionValida(desde: Estado, hacia: Estado): boolean {
  return TRANSICIONES[desde].includes(hacia);
}

const LABELS: Record<Estado, string> = {
  pendiente: "Pendiente",
  en_corte: "En corte",
  aprobado: "Aprobado",
  rechazado: "Rechazado",
  solicitado_entrega: "Solicitado entrega",
  entregado: "Entregado",
  comida_pendiente: "Comida pendiente",
};

export function labelEstado(e: Estado): string {
  return LABELS[e];
}

export const COLOR_ESTADO: Record<Estado, string> = {
  pendiente: "#ed8936",
  en_corte: "#3182ce",
  aprobado: "#38a169",
  rechazado: "#e53e3e",
  solicitado_entrega: "#06b6d4",
  entregado: "#2d3748",
  comida_pendiente: "#d69e2e",
};

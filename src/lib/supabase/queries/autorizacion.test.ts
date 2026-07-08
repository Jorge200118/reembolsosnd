import { describe, it, expect, vi, beforeEach } from "vitest";

// El cliente Supabase se mockea: cada .update(vals) registra vals y .eq() resuelve
// sin error. Así el test verifica el comportamiento (qué se escribe), no el mock.
const updates: Array<Record<string, unknown>> = [];
vi.mock("@/lib/supabase/client", () => ({
  supabase: {
    from: () => ({
      update: (vals: Record<string, unknown>) => {
        updates.push(vals);
        return { eq: () => Promise.resolve({ error: null }) };
      },
    }),
  },
}));

import { autorizarLote, rechazarLote } from "./autorizacion";

beforeEach(() => {
  updates.length = 0;
});

describe("autorizarLote", () => {
  it("marca cada id como aprobado con trazabilidad", async () => {
    const res = await autorizarLote(["a", "b"], "Lic Fernando");
    expect(res.ok).toBe(true);
    expect(res.actualizados).toBe(2);
    expect(updates).toHaveLength(2);
    expect(updates[0]).toMatchObject({ estado: "aprobado", autorizado_por: "Lic Fernando" });
    expect(updates[0]).toHaveProperty("fecha_autorizacion");
  });
  it("devuelve error si no hay ids", async () => {
    const res = await autorizarLote([], "Lic Fernando");
    expect(res.ok).toBe(false);
  });
});

describe("rechazarLote", () => {
  it("marca cada id como rechazado guardando el motivo", async () => {
    const res = await rechazarLote(["a"], "Lic Fernando", "Falta comprobante");
    expect(res.ok).toBe(true);
    expect(updates[0]).toMatchObject({
      estado: "rechazado",
      motivo_rechazo: "Falta comprobante",
      autorizado_por: "Lic Fernando",
    });
  });
  it("acepta motivo vacío (guarda null)", async () => {
    await rechazarLote(["a"], "Lic Fernando");
    expect(updates[0]).toMatchObject({ estado: "rechazado", motivo_rechazo: null });
  });
});

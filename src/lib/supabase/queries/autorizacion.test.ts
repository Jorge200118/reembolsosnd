import { describe, it, expect, vi, beforeEach } from "vitest";

// El cliente Supabase se mockea: cada .update(vals) registra vals y .eq() resuelve
// según `forzarError`. Así el test verifica el comportamiento (qué se escribe y qué
// pasa cuando las escrituras fallan), no el mock.
const updates: Array<Record<string, unknown>> = [];
let forzarError = false;
vi.mock("@/lib/supabase/client", () => ({
  supabase: {
    from: () => ({
      update: (vals: Record<string, unknown>) => {
        updates.push(vals);
        return { eq: () => Promise.resolve({ error: forzarError ? { message: "boom" } : null }) };
      },
    }),
  },
}));

import { autorizarLote, rechazarLote } from "./autorizacion";

beforeEach(() => {
  updates.length = 0;
  forzarError = false;
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
  it("devuelve ok:false si todas las escrituras fallan", async () => {
    forzarError = true;
    const res = await autorizarLote(["a", "b"], "Lic Fernando");
    expect(res.ok).toBe(false);
    expect(res.actualizados).toBe(0);
    expect(res.error).toBeTruthy();
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

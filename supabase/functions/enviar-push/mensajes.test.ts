import { describe, it, expect } from "vitest";
import { mensaje, topicCorto, fmtMonto } from "./mensajes";

describe("push mensajes", () => {
  it("topicCorto <=32 chars y base64url por tipo", () => {
    for (const t of ["codigo_listo", "comida_nueva", "recordatorio"] as const) {
      const tag = topicCorto(t, 2204);
      expect(tag.length).toBeLessThanOrEqual(32);
      expect(tag).toMatch(/^[A-Za-z0-9_-]+$/);
    }
    expect(topicCorto("codigo_listo", 2204)).toBe("cl-2204");
    expect(topicCorto("comida_nueva", 7)).toBe("cn-7");
    expect(topicCorto("recordatorio", 7)).toBe("rc-7");
  });

  it("fmtMonto formatea es-MX y nunca vacío", () => {
    expect(fmtMonto(undefined)).toBe("0");
    expect(fmtMonto(0)).toBe("0");
    expect(fmtMonto(1250)).toBe("1,250");
  });

  it("mensaje trae textos exactos + tag", () => {
    expect(mensaje("codigo_listo", { empleado_id: 1, endpoint: "e", p256dh: "p", auth: "a" }))
      .toEqual({ title: "Vales AC", body: "Ya está tu código de comida de hoy.", url: "/empleado", tag: "cl-1" });
    expect(mensaje("comida_nueva", { empleado_id: 1, endpoint: "e", p256dh: "p", auth: "a", monto: 405 }).body)
      .toBe("Se te acumuló una comida, ya son $405.");
    expect(mensaje("recordatorio", { empleado_id: 1, endpoint: "e", p256dh: "p", auth: "a" }).body)
      .toContain("Aún no usas tu código");
  });
});

describe("mensajes de material", () => {
  it("cada tipo de material tiene su texto y lleva a la pantalla de material", () => {
    const row = { empleado_id: 7, endpoint: "e", p256dh: "p", auth: "a" };
    for (const tipo of ["material_autorizada", "material_rechazada", "material_entregada"] as const) {
      const m = mensaje(tipo, row);
      expect(m.title).toBe("Vales AC");
      expect(m.body.length).toBeGreaterThan(10);
      expect(m.url).toBe("/empleado/materiales");
    }
  });

  // El aviso ya no puede decir "tu gerente": inventarios también autoriza.
  // Quién lo hizo queda en autorizado_por y se ve en el historial.
  it("el aviso de autorización no le atribuye la firma a un puesto", () => {
    const m = mensaje("material_autorizada", { empleado_id: 7, endpoint: "e", p256dh: "p", auth: "a" });
    expect(m.body).not.toMatch(/gerente/i);
    expect(m.body).toContain("código");
  });

  it("los tags de material son cortos y distintos entre sí", () => {
    const tags = new Set(
      (["material_autorizada", "material_rechazada", "material_entregada"] as const)
        .map((t) => topicCorto(t, 7)),
    );
    expect(tags.size).toBe(3);
    for (const t of tags) expect(t.length).toBeLessThanOrEqual(32);
  });
});

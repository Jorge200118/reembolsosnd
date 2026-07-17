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

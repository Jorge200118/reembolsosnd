import { describe, it, expect } from "vitest";
import { soloDigitos, esCodigoCompleto, LARGO_CODIGO } from "./codigo";

describe("soloDigitos", () => {
  it("quita todo lo que no sea número", () => {
    expect(soloDigitos("47-29 15")).toBe("472915");
    expect(soloDigitos("abc")).toBe("");
  });

  it("no deja pasar más de 6", () => {
    expect(soloDigitos("1234567890")).toBe("123456");
  });

  it("aguanta que le peguen el código completo de un jalón", () => {
    // El almacenista puede pegar desde WhatsApp, no solo teclear dígito a dígito.
    expect(soloDigitos("Tu código: 472915")).toBe("472915");
  });
});

describe("esCodigoCompleto", () => {
  it("solo con los 6 dígitos", () => {
    expect(esCodigoCompleto("472915")).toBe(true);
    expect(esCodigoCompleto("47291")).toBe(false);
    expect(esCodigoCompleto("")).toBe(false);
  });

  it("un código que empieza en cero sigue siendo válido", () => {
    // lpad genera códigos como 004729; tratarlos como número los rompería.
    expect(esCodigoCompleto("004729")).toBe(true);
  });

  it("LARGO_CODIGO es la única fuente del 6", () => {
    expect(LARGO_CODIGO).toBe(6);
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { CrearComidaInput } from "@/lib/edge/crearComida";

// El lote se prueba contra un doble de `crearComida`: lo que importa aquí no es
// la llamada HTTP sino QUÉ payload se arma por empleado.
const llamadas: CrearComidaInput[] = [];
vi.mock("@/lib/edge/crearComida", () => ({
  crearComida: vi.fn(async (input: CrearComidaInput) => {
    llamadas.push(input);
    return { ok: true, comidaId: "x", beneficiario: "y" };
  }),
}));

const { crearComidasLote } = await import("@/lib/hooks/useCrearComidasLote");

beforeEach(() => {
  llamadas.length = 0;
});

describe("crearComidasLote — sucursal_usuario", () => {
  // `rnd_reembolsos.sucursal_usuario` es el vocabulario de ABREVIATURAS
  // (rnd_usuarios.sucursal: FTE, LMM, SJC…). `empleados.sucursal` es otro
  // vocabulario, el de nombres largos (EL FUERTE, MATRIZ, SAN JOSE), y no debe
  // filtrarse nunca a la columna.
  it("manda la abreviatura de la sesión, no el nombre largo del empleado", async () => {
    await crearComidasLote({
      empleados: [{ id: 1, nombre: "Juan Pérez", sucursal: "EL FUERTE" }],
      quienAutoriza: "Gerente FTE",
      usuarioRegistro: "gciafte@acerosdelpacifico.com.mx",
      sucursalSesion: "FTE",
    });

    expect(llamadas.map((l) => l.sucursalUsuario)).toEqual(["FTE"]);
  });

  it("usa la sesión aunque el empleado sea de otra sucursal (buscador global)", async () => {
    await crearComidasLote({
      empleados: [{ id: 2, nombre: "Ana López", sucursal: "CULIACAN" }],
      quienAutoriza: "Gerente Matriz",
      usuarioRegistro: "gtecomercial@acerosdelpacifico.com.mx",
      sucursalSesion: "LMM",
    });

    expect(llamadas.map((l) => l.sucursalUsuario)).toEqual(["LMM"]);
  });

  it("no manda nada si la sesión no trae sucursal (el edge lo resuelve)", async () => {
    await crearComidasLote({
      empleados: [{ id: 3, nombre: "Luis Ruiz", sucursal: "TAMARAL" }],
      quienAutoriza: "Admin",
      usuarioRegistro: "admin@acerosdelpacifico.com.mx",
      sucursalSesion: null,
    });

    expect(llamadas.map((l) => l.sucursalUsuario)).toEqual([undefined]);
  });
});

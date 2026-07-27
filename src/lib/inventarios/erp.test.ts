import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { existenciasEnErp, erpConfigurado } from "./erp";

const BASE = "https://erp.example";
const LLAVE = "llave-de-prueba";

function respuesta(cuerpo: unknown, ok = true, status = 200) {
  return Promise.resolve({
    ok,
    status,
    json: () => Promise.resolve(cuerpo),
  } as Response);
}

describe("existenciasEnErp", () => {
  beforeEach(() => {
    process.env.CENSOS_API_URL = BASE;
    process.env.CENSOS_API_KEY = LLAVE;
  });
  afterEach(() => vi.unstubAllGlobals());

  it("no llama al ERP si no hay códigos que consultar", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const r = await existenciasEnErp([], 1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(r).toEqual({ productos: [], permiteNegativo: false });
  });

  it("manda la llave y el cuerpo al endpoint correcto", async () => {
    const fetchMock = vi.fn((...args: [string, RequestInit]) => {
      void args;
      return respuesta({ ok: true, productos: [], permiteNegativo: false });
    });
    vi.stubGlobal("fetch", fetchMock);
    await existenciasEnErp(["TRU1"], 3);

    const [url, opciones] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`${BASE}/api/inventario/existencias`);
    expect(opciones.method).toBe("POST");
    expect((opciones.headers as Record<string, string>)["x-api-key"]).toBe(LLAVE);
    expect(JSON.parse(String(opciones.body))).toEqual({ codProds: ["TRU1"], codEstab: 3 });
  });

  it("normaliza el producto que devuelve el ERP", async () => {
    vi.stubGlobal("fetch", () =>
      respuesta({
        ok: true,
        permiteNegativo: true,
        productos: [{
          codProd: " tru12592 ", descripcion: "CINTA", unidad: "PZ",
          existencia: "15", costo: "30.79", esServicio: false,
          permiteNegativo: true, existe: true,
        }],
      }),
    );
    const r = await existenciasEnErp(["TRU12592"], 1);
    expect(r.permiteNegativo).toBe(true);
    expect(r.productos[0]).toEqual({
      codProd: "TRU12592", descripcion: "CINTA", unidad: "PZ",
      existencia: 15, costo: 30.79, esServicio: false,
      permiteNegativo: true, existe: true,
    });
  });

  // Lo seguro ante una respuesta rara es "no lo conozco", nunca "existe y hay
  // de sobra": un `existe` truthy mal leído descargaría material fantasma.
  it("solo un true explícito cuenta como que el ERP conoce el producto", async () => {
    vi.stubGlobal("fetch", () =>
      respuesta({ ok: true, productos: [{ codProd: "X", existe: "si", existencia: 5 }] }),
    );
    const r = await existenciasEnErp(["X"], 1);
    expect(r.productos[0]!.existe).toBe(false);
  });

  it("valores no numéricos quedan en null, no en NaN ni cero", async () => {
    vi.stubGlobal("fetch", () =>
      respuesta({ ok: true, productos: [{ codProd: "X", existe: true, existencia: "hola", costo: null }] }),
    );
    const r = await existenciasEnErp(["X"], 1);
    expect(r.productos[0]!.existencia).toBeNull();
    expect(r.productos[0]!.costo).toBeNull();
  });

  it("descarta filas sin código en vez de meterlas con codProd vacío", async () => {
    vi.stubGlobal("fetch", () =>
      respuesta({ ok: true, productos: [{ existe: true }, null, "basura", { codProd: "OK", existe: true }] }),
    );
    const r = await existenciasEnErp(["OK"], 1);
    expect(r.productos).toHaveLength(1);
    expect(r.productos[0]!.codProd).toBe("OK");
  });

  // Que reviente es lo correcto: devolver [] se leería como "no hay nada que
  // descargar" cuando en realidad el ERP se cayó.
  it("lanza si el ERP responde con error HTTP", async () => {
    vi.stubGlobal("fetch", () => respuesta({}, false, 502));
    await expect(existenciasEnErp(["X"], 1)).rejects.toThrow("502");
  });

  it("lanza si el ERP contesta 200 pero con ok:false", async () => {
    vi.stubGlobal("fetch", () => respuesta({ ok: false, error: "codEstab invalido" }));
    await expect(existenciasEnErp(["X"], 1)).rejects.toThrow();
  });

  it("lanza si falta la configuración en vez de llamar a undefined", async () => {
    delete process.env.CENSOS_API_URL;
    await expect(existenciasEnErp(["X"], 1)).rejects.toThrow("ERP no configurado");
  });
});

describe("erpConfigurado", () => {
  it("pide las dos variables, no solo una", () => {
    process.env.CENSOS_API_URL = BASE;
    delete process.env.CENSOS_API_KEY;
    expect(erpConfigurado()).toBe(false);
    process.env.CENSOS_API_KEY = LLAVE;
    expect(erpConfigurado()).toBe(true);
  });
});

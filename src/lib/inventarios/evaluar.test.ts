import { describe, it, expect } from "vitest";
import { evaluarPartidas, totalesDe } from "./evaluar";
import type { PartidaPendiente, ExistenciaErp } from "./tipos";

function partida(over: Partial<PartidaPendiente> = {}): PartidaPendiente {
  return {
    lineaId: "l1",
    solicitudId: "s1",
    folioSolicitud: "SUI-000001",
    codProd: "TRU12592",
    descripcion: "CINTA MASKING TAPE",
    unidad: "PZ",
    cantidad: 1,
    costoUnitario: 30,
    empleadoNombre: "Juan",
    area: null,
    fechaEntrega: null,
    motivo: "Mantenimiento",
    ...over,
  };
}

function erp(over: Partial<ExistenciaErp> = {}): ExistenciaErp {
  return {
    codProd: "TRU12592",
    descripcion: "CINTA MASKING TAPE, 1-1/2\"",
    unidad: "PZ",
    existencia: 15,
    costo: 30.7995,
    esServicio: false,
    permiteNegativo: false,
    existe: true,
    ...over,
  };
}

describe("evaluarPartidas", () => {
  it("marca ok cuando el inventario alcanza", () => {
    const r = evaluarPartidas([partida({ cantidad: 3 })], [erp({ existencia: 15 })]);
    expect(r[0]!.estado).toBe("ok");
    expect(r[0]!.cantidadAplicable).toBe(3);
    expect(r[0]!.seleccionablePorDefecto).toBe(true);
  });

  // El caso que importa: BMS aplica partida por partida y la existencia se va
  // agotando. Evaluar cada línea por separado contra la existencia original
  // diría que las dos caben, y la segunda se recortaría en silencio.
  it("descuenta lo que consumen las partidas anteriores del MISMO producto", () => {
    const r = evaluarPartidas(
      [
        partida({ lineaId: "a", cantidad: 3 }),
        partida({ lineaId: "b", cantidad: 2 }),
      ],
      [erp({ existencia: 4 })],
    );
    expect(r[0]!.estado).toBe("ok");
    expect(r[0]!.cantidadAplicable).toBe(3);
    // Solo queda 1 de los 4: la segunda partida no cabe completa.
    expect(r[1]!.estado).toBe("insuficiente");
    expect(r[1]!.cantidadAplicable).toBe(1);
    expect(r[1]!.seleccionablePorDefecto).toBe(false);
  });

  it("no descuenta entre productos distintos", () => {
    const r = evaluarPartidas(
      [
        partida({ lineaId: "a", codProd: "AAA", cantidad: 3 }),
        partida({ lineaId: "b", codProd: "BBB", cantidad: 3 }),
      ],
      [
        erp({ codProd: "AAA", existencia: 3 }),
        erp({ codProd: "BBB", existencia: 3 }),
      ],
    );
    expect(r.map((p) => p.estado)).toEqual(["ok", "ok"]);
  });

  it("agota: la tercera partida ya no alcanza nada", () => {
    const r = evaluarPartidas(
      [
        partida({ lineaId: "a", cantidad: 2 }),
        partida({ lineaId: "b", cantidad: 1 }),
        partida({ lineaId: "c", cantidad: 5 }),
      ],
      [erp({ existencia: 3 })],
    );
    expect(r[2]!.estado).toBe("sin_existencia");
    expect(r[2]!.cantidadAplicable).toBe(0);
  });

  it("existencia 0 o negativa da sin_existencia, nunca cantidad negativa", () => {
    const r = evaluarPartidas([partida({ cantidad: 2 })], [erp({ existencia: -5 })]);
    expect(r[0]!.estado).toBe("sin_existencia");
    expect(r[0]!.cantidadAplicable).toBe(0);
  });

  it("el ERP no conoce el código: sin_catalogo, no se descarga", () => {
    const r = evaluarPartidas([partida({ codProd: "XXX" })], [erp({ codProd: "XXX", existe: false, existencia: null })]);
    expect(r[0]!.estado).toBe("sin_catalogo");
    expect(r[0]!.cantidadAplicable).toBe(0);
    expect(r[0]!.seleccionablePorDefecto).toBe(false);
  });

  it("un código que ni siquiera vino en la respuesta del ERP tampoco se pierde", () => {
    const r = evaluarPartidas([partida({ codProd: "FANTASMA" })], []);
    expect(r).toHaveLength(1);
    expect(r[0]!.estado).toBe("sin_catalogo");
  });

  it("producto de servicio: descargarlo no haría nada en el ERP", () => {
    const r = evaluarPartidas([partida()], [erp({ esServicio: true, existencia: 99 })]);
    expect(r[0]!.estado).toBe("servicio");
    expect(r[0]!.seleccionablePorDefecto).toBe(false);
  });

  // Se avisa igual aunque la sucursal permita negativo: el comportamiento de la
  // pantalla no debe depender de un parámetro de BMS que alguien puede cambiar.
  it("avisa insuficiente aunque la sucursal permita existencia negativa", () => {
    const r = evaluarPartidas(
      [partida({ cantidad: 5 })],
      [erp({ existencia: 2, permiteNegativo: true })],
    );
    expect(r[0]!.estado).toBe("insuficiente");
    expect(r[0]!.permiteNegativo).toBe(true);
    expect(r[0]!.seleccionablePorDefecto).toBe(false);
  });

  it("existencia null (sin dato) se trata como cero, no como infinito", () => {
    const r = evaluarPartidas([partida({ cantidad: 1 })], [erp({ existencia: null })]);
    expect(r[0]!.estado).toBe("sin_existencia");
  });

  it("empata el ERP sin importar mayúsculas ni espacios", () => {
    const r = evaluarPartidas(
      [partida({ codProd: "  tru12592 " })],
      [erp({ codProd: "TRU12592", existencia: 10 })],
    );
    expect(r[0]!.estado).toBe("ok");
    expect(r[0]!.existencia).toBe(10);
  });

  it("trae la descripción del ERP sin perder la copia congelada de la partida", () => {
    const r = evaluarPartidas(
      [partida({ descripcion: "NOMBRE VIEJO" })],
      [erp({ descripcion: "NOMBRE ACTUAL" })],
    );
    expect(r[0]!.descripcion).toBe("NOMBRE VIEJO");
    expect(r[0]!.descripcionErp).toBe("NOMBRE ACTUAL");
  });
});

describe("totalesDe", () => {
  it("suma partidas, unidades y costo de lo aplicable", () => {
    const evaluadas = evaluarPartidas(
      [
        partida({ lineaId: "a", cantidad: 2, costoUnitario: 10 }),
        partida({ lineaId: "b", codProd: "BBB", cantidad: 3, costoUnitario: 5 }),
      ],
      [erp({ existencia: 10 }), erp({ codProd: "BBB", existencia: 10, costo: 5 })],
    );
    expect(totalesDe(evaluadas)).toEqual({ partidas: 2, unidades: 5, costo: 35 });
  });

  it("cuenta la cantidad APLICABLE, no la entregada", () => {
    const evaluadas = evaluarPartidas(
      [partida({ cantidad: 10, costoUnitario: 10 })],
      [erp({ existencia: 4 })],
    );
    expect(totalesDe(evaluadas)).toEqual({ partidas: 1, unidades: 4, costo: 40 });
  });

  it("ignora lo que no aporta nada al movimiento", () => {
    const evaluadas = evaluarPartidas(
      [partida({ cantidad: 2 })],
      [erp({ existencia: 0 })],
    );
    expect(totalesDe(evaluadas)).toEqual({ partidas: 0, unidades: 0, costo: 0 });
  });

  it("costo null no rompe la suma", () => {
    const evaluadas = evaluarPartidas(
      [partida({ cantidad: 2, costoUnitario: null })],
      [erp({ existencia: 10, costo: null })],
    );
    expect(totalesDe(evaluadas).costo).toBe(0);
    expect(totalesDe(evaluadas).unidades).toBe(2);
  });

  it("usa el costo del ERP cuando la partida no lo trae congelado", () => {
    const evaluadas = evaluarPartidas(
      [partida({ cantidad: 2, costoUnitario: null })],
      [erp({ existencia: 10, costo: 7 })],
    );
    expect(totalesDe(evaluadas).costo).toBe(14);
  });

  // BMS guarda el precio unitario redondeado a 2 decimales y multiplica DESPUÉS
  // (verificado en el folio A687: costo 0.8461 x 100 quedó como $85.00, no
  // $84.61). El preview tiene que mostrar lo mismo que va a quedar registrado,
  // o el usuario compara contra BMS y no le cuadra.
  it("redondea el costo unitario a 2 decimales antes de multiplicar, como el ERP", () => {
    const evaluadas = evaluarPartidas(
      [partida({ cantidad: 100, costoUnitario: 0.8461 })],
      [erp({ existencia: 1841, costo: 0.8461 })],
    );
    expect(totalesDe(evaluadas).costo).toBe(85);
  });

  it("el redondeo del unitario también aplica hacia abajo", () => {
    const evaluadas = evaluarPartidas(
      [partida({ cantidad: 100, costoUnitario: 0.8449 })],
      [erp({ existencia: 500, costo: 0.8449 })],
    );
    expect(totalesDe(evaluadas).costo).toBe(84);
  });
});

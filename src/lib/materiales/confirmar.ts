import type { Area } from "@devoluciones/domain";
import type { Material } from "@/lib/materiales/tipos";

// Del carrito del empleado solo se cree el CÓDIGO y la CANTIDAD. La descripción,
// el costo y la existencia se vuelven a preguntar al ERP aquí.
//
// Antes se guardaba tal cual lo que mandaba el teléfono, así que quien supiera
// abrir las herramientas del navegador podía bajarle el costo a su solicitud y
// el gerente autorizaba viendo un total falso. Como el punto del módulo es que
// el gerente decida sabiendo cuánto cuesta, esa era justo la parte que no podía
// venir del cliente.

export interface LineaPedida {
  codProd: string;
  cantidad: number;
}

/** Una línea lista para `material_crear`, con los datos del ERP. */
export interface LineaConfirmada {
  cod_prod: string;
  descripcion: string;
  unidad: string | null;
  cantidad: number;
  costo_unitario: number | null;
  existencia_al_pedir: number | null;
  /** Área que la entrega. Nunca null: sin área la solicitud ni se crea. */
  area: Area;
}

export type Confirmacion =
  | { ok: true; lineas: LineaConfirmada[] }
  | { ok: false; error: string };

/** Busca en el catálogo del ERP. Se inyecta para poder probar sin red. */
export type BuscarEnCatalogo = (q: string) => Promise<Material[]>;

function mismoCodigo(a: string, b: string): boolean {
  return a.trim().toUpperCase() === b.trim().toUpperCase();
}

export async function confirmarConElErp(
  pedidas: LineaPedida[],
  buscar: BuscarEnCatalogo,
): Promise<Confirmacion> {
  if (pedidas.length === 0) {
    return { ok: false, error: "Agrega al menos un material" };
  }

  const limpias = pedidas.map((l) => ({
    codProd: String(l.codProd ?? "").trim(),
    cantidad: Number(l.cantidad),
  }));

  if (limpias.some((l) => !l.codProd)) {
    return { ok: false, error: "Hay materiales sin código" };
  }
  if (limpias.some((l) => !Number.isFinite(l.cantidad) || l.cantidad <= 0)) {
    return { ok: false, error: "Hay materiales con cantidad inválida" };
  }

  // Una consulta por código distinto, en paralelo: el carrito normal trae unos
  // pocos renglones y así no se paga la latencia una tras otra.
  const distintos = [...new Set(limpias.map((l) => l.codProd.toUpperCase()))];
  const resultados = await Promise.all(distintos.map((c) => buscar(c)));

  const catalogo = new Map<string, Material>();
  distintos.forEach((codigo, i) => {
    // El ERP busca por coincidencia parcial, así que puede traer parientes del
    // código; nos quedamos únicamente con el que es exactamente igual.
    const exacto = resultados[i]!.find((m) => mismoCodigo(m.codProd, codigo));
    if (exacto) catalogo.set(codigo, exacto);
  });

  const perdido = distintos.find((c) => !catalogo.has(c));
  if (perdido) {
    return {
      ok: false,
      error: `El material ${perdido} ya no está en el catálogo de tu sucursal, quítalo y búscalo de nuevo`,
    };
  }

  // Sin área no hay quién lo entregue. El área sale de la zona de inventario
  // del ERP; si el producto no está dado de alta en el censo, la solicitud no
  // se crea, porque cerrarla exigiría que un encargado valide partidas que no
  // son de nadie. El alta la hace inventarios en BMS y esto se destraba solo.
  const sinArea = distintos.filter((c) => !catalogo.get(c)!.area);
  if (sinArea.length > 0) {
    return {
      ok: false,
      error:
        `${sinArea.join(", ")} no tiene área asignada en el inventario, ` +
        `así que nadie puede entregarlo. Pide a inventarios que lo dé de alta.`,
    };
  }

  return {
    ok: true,
    lineas: limpias.map((l) => {
      const m = catalogo.get(l.codProd.toUpperCase())!;
      return {
        cod_prod: m.codProd,
        descripcion: m.descripcion,
        unidad: m.unidad,
        cantidad: l.cantidad,
        costo_unitario: m.costo,
        existencia_al_pedir: m.existencia,
        area: m.area!, // garantizado por la verificación de arriba
      };
    }),
  };
}

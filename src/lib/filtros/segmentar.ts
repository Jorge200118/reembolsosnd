// Segmentadores de datos: acotar una lista por dimensiones (sucursal, estado,
// área…), por texto libre y por rango de fechas.
//
// La lógica vive aquí y no en el componente porque es la parte que se puede
// equivocar sin que se note: un filtro que esconde de más se ve igual que una
// lista corta. El componente solo dibuja.

/** Una dimensión por la que se puede acotar. */
export interface Segmento<T> {
  id: string;
  etiqueta: string;
  /**
   * En qué opción u opciones cae el item. Null = en ninguna.
   *
   * Devuelve varias cuando la dimensión es multivaluada: una solicitud toca
   * FERRETERIA y NAVE2 a la vez, y filtrar por NAVE2 tiene que encontrarla.
   */
  de: (item: T) => string | readonly string[] | null;
  /** Orden fijo de las opciones; lo que no esté aquí va después, alfabético. */
  orden?: readonly string[];
  /** Cómo se escribe la opción en pantalla. Por defecto, el valor tal cual. */
  texto?: (valor: string) => string;
}

export interface ConfigSegmentos<T> {
  segmentos: readonly Segmento<T>[];
  /** Texto sobre el que busca la caja de búsqueda. Sin esto, no se dibuja. */
  buscarEn?: (item: T) => string;
  /** Fecha ISO del item para el rango. Sin esto, no se dibujan las fechas. */
  fechaDe?: (item: T) => string | null;
}

export interface EstadoSegmentos {
  /** segmentoId -> valores marcados. Vacío o ausente = ese segmento no filtra. */
  seleccion: Record<string, readonly string[]>;
  texto: string;
  /** yyyy-mm-dd, como los devuelve <input type="date">. "" = sin límite. */
  desde: string;
  hasta: string;
}

export const SIN_FILTROS: EstadoSegmentos = { seleccion: {}, texto: "", desde: "", hasta: "" };

// Las marcas que deja NFD al separar la letra de su acento. Se usa la propiedad
// Unicode \p{Mn} (Mark, nonspacing) y NO el rango U+0300-U+036F escrito a mano:
// ese rango, en un literal, son caracteres INVISIBLES en el código fuente que
// cualquier copiar/pegar rompe sin que nadie lo note hasta que "portón" deja de
// encontrarse tecleando "porton". Esto es ASCII y no se puede corromper.
// Requiere target >= ES2018; el proyecto compila a ES2020.
const DIACRITICOS = /\p{Mn}/gu;

/** Sin acentos y en minúsculas: "portón" tiene que encontrarse tecleando "porton". */
export function normalizar(s: string): string {
  return s.normalize("NFD").replace(DIACRITICOS, "").toLowerCase().trim();
}

/**
 * El día CALENDARIO local de una fecha ISO, en formato yyyy-mm-dd.
 *
 * Se compara en hora local y no en UTC a propósito. Una entrega de las 7 de la
 * noche en Sinaloa se guarda como el día siguiente en UTC; con `slice(0,10)`
 * sobre el ISO, quien filtrara "hoy" no la vería, y quien filtrara "mañana"
 * vería una entrega que todavía no ocurre.
 */
export function diaLocal(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

function valores<T>(seg: Segmento<T>, item: T): string[] {
  const v = seg.de(item);
  if (v === null || v === undefined) return [];
  return typeof v === "string" ? [v] : [...v];
}

/** ¿Hay algo activo? Decide si se dibuja el botón de limpiar. */
export function hayFiltros(estado: EstadoSegmentos): boolean {
  if (estado.texto.trim() !== "" || estado.desde !== "" || estado.hasta !== "") return true;
  return Object.values(estado.seleccion).some((v) => v.length > 0);
}

/**
 * La lista acotada.
 *
 * Reglas, que son las de un segmentador de Excel:
 *  - Un segmento sin nada marcado no filtra (no es "no mostrar nada").
 *  - Varias opciones del MISMO segmento son un O (sucursal LMM o FTE).
 *  - Segmentos distintos son un Y (sucursal LMM **y** estado ok).
 */
export function filtrar<T>(
  items: readonly T[],
  config: ConfigSegmentos<T>,
  estado: EstadoSegmentos,
): T[] {
  // Se busca palabra por palabra y no la frase completa. Es la diferencia entre
  // que "aerosol azul" encuentre "PINTURA EN AEROSOL, AZUL NEON" o no encuentre
  // nada: nadie teclea las palabras en el orden exacto en que están escritas en
  // el catálogo del ERP.
  const palabras = normalizar(estado.texto).split(/\s+/).filter(Boolean);
  const conRango = Boolean(estado.desde || estado.hasta);

  return items.filter((item) => {
    for (const seg of config.segmentos) {
      const marcados = estado.seleccion[seg.id];
      if (!marcados || marcados.length === 0) continue;
      const suyos = valores(seg, item);
      if (!suyos.some((v) => marcados.includes(v))) return false;
    }

    if (palabras.length > 0 && config.buscarEn) {
      const donde = normalizar(config.buscarEn(item));
      // Todas las palabras, en cualquier orden y en cualquier parte del texto.
      if (!palabras.every((p) => donde.includes(p))) return false;
    }

    if (conRango && config.fechaDe) {
      const dia = diaLocal(config.fechaDe(item));
      // Un item sin fecha no puede afirmarse que esté dentro del rango pedido.
      if (dia === null) return false;
      if (estado.desde && dia < estado.desde) return false;
      if (estado.hasta && dia > estado.hasta) return false;
    }

    return true;
  });
}

export interface Opcion {
  valor: string;
  texto: string;
  /** Cuántos items quedarían si se marcara. 0 = la opción existe pero hoy no aplica. */
  cuantos: number;
}

/**
 * Las opciones de un segmento y cuántos items caen en cada una.
 *
 * Dos decisiones que evitan callejones sin salida:
 *
 * 1. **El conteo respeta los demás filtros pero NO el propio.** Si contara
 *    también el propio, marcar "LMM" dejaría a las demás sucursales en 0 y
 *    parecería que ya no existen.
 * 2. **Las opciones nunca desaparecen.** Una que hoy da 0 se sigue dibujando,
 *    en gris. Si se quitara de la lista, el usuario no tendría cómo llegar a
 *    ella sin limpiar todo.
 */
export function opcionesDe<T>(
  items: readonly T[],
  config: ConfigSegmentos<T>,
  estado: EstadoSegmentos,
  segmentoId: string,
): Opcion[] {
  const seg = config.segmentos.find((s) => s.id === segmentoId);
  if (!seg) return [];

  const sinEste: EstadoSegmentos = {
    ...estado,
    seleccion: { ...estado.seleccion, [segmentoId]: [] },
  };

  const cuenta = new Map<string, number>();
  for (const item of filtrar(items, config, sinEste)) {
    for (const v of valores(seg, item)) cuenta.set(v, (cuenta.get(v) ?? 0) + 1);
  }
  for (const item of items) {
    for (const v of valores(seg, item)) if (!cuenta.has(v)) cuenta.set(v, 0);
  }

  const orden = seg.orden ?? [];
  const puesto = (v: string) => {
    const i = orden.indexOf(v);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };

  return [...cuenta.entries()]
    .map(([valor, cuantos]) => ({
      valor,
      cuantos,
      texto: seg.texto ? seg.texto(valor) : valor,
    }))
    .sort((a, b) => {
      const pa = puesto(a.valor);
      const pb = puesto(b.valor);
      if (pa !== pb) return pa - pb;
      return a.texto.localeCompare(b.texto, "es");
    });
}

/** Marca o desmarca una opción, devolviendo un estado nuevo. */
export function alternar(
  estado: EstadoSegmentos,
  segmentoId: string,
  valor: string,
): EstadoSegmentos {
  const actuales = estado.seleccion[segmentoId] ?? [];
  const nuevos = actuales.includes(valor)
    ? actuales.filter((v) => v !== valor)
    : [...actuales, valor];
  return { ...estado, seleccion: { ...estado.seleccion, [segmentoId]: nuevos } };
}

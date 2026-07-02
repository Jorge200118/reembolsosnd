export interface Concepto {
  concepto: string;
  cuenta: string;
  descripcion: string;
}

// Fuente: objeto `cuentasContables` en V4 Reemvolsos Sin papel.html (~L1496-1530).
export const CONCEPTOS = [
  { concepto: "ANUNCIOS EN PESEROS", cuenta: "5109-052-011", descripcion: "PUBLICIDAD Y PROPAGANDA" },
  { concepto: "ARRENDAMIENTOS", cuenta: "5109-052-034", descripcion: "ARRENDAMIENTO" },
  { concepto: "CARGA Y DESCARGA", cuenta: "5109-052-047", descripcion: "SUELDOS" },
  { concepto: "CASA LIC FBV Y JBV", cuenta: "5109-052-003", descripcion: "DIVERSOS" },
  { concepto: "COMIDAS", cuenta: "5109-052-017", descripcion: "CONSUMO LOCAL" },
  { concepto: "COMISIONES", cuenta: "5109-052-022", descripcion: "COMISIONES DE TERCEROS" },
  { concepto: "COMPENSACIONES", cuenta: "5109-052-055", descripcion: "GRATIFICACIONES" },
  { concepto: "DIVERSOS", cuenta: "5109-052-003", descripcion: "DIVERSOS" },
  { concepto: "DUPLICADOS DE LLAVES", cuenta: "5109-052-003", descripcion: "DIVERSOS" },
  { concepto: "ELABORACION ARMEX", cuenta: "5109-052-055", descripcion: "GRATIFICACIONES" },
  { concepto: "EQ. DE COMPUTO", cuenta: "5109-052-014", descripcion: "MANTO MOB Y EQPO OFNA" },
  { concepto: "ESTACIONAMIENTO", cuenta: "5109-052-037", descripcion: "PEAJES" },
  { concepto: "GAS", cuenta: "5109-052-020", descripcion: "GAS" },
  { concepto: "GASTOS DIRECTIVOS", cuenta: "5109-052-003", descripcion: "DIVERSOS" },
  { concepto: "GUARDIA NACIONAL", cuenta: "5109-052-036", descripcion: "SERVICIOS DE GESTORIA" },
  { concepto: "HORAS EXTRAS", cuenta: "5109-052-055", descripcion: "GRATIFICACIONES" },
  { concepto: "LA MARIPOSA", cuenta: "5109-052-003", descripcion: "DIVERSOS" },
  { concepto: "LAVANDERIA", cuenta: "5109-052-006", descripcion: "GASTOS DE VIAJE" },
  { concepto: "LIMPIEZA", cuenta: "5109-052-033", descripcion: "ARTS. DE LIMPIEZA Y CAFET" },
  { concepto: "MANTTO EQ. DE TRANSP.", cuenta: "5109-052-013", descripcion: "MANT. EQPO. DE TRASPORTE" },
  { concepto: "MODALIDAD 40", cuenta: "5109-052-055", descripcion: "GRATIFICACIONES" },
  { concepto: "MTO LOCAL ARRENDADO", cuenta: "5109-052-056", descripcion: "MANTTO Y CONS PROP. ARRENDADA" },
  { concepto: "MTO MAQUINARIA Y EQUIPO", cuenta: "5109-052-012", descripcion: "MANTO Y CONS MAQ. Y EQPO." },
  { concepto: "MUNICIPIO", cuenta: "5109-052-023", descripcion: "IMPUESTOS Y DERECHOS LOCAL" },
  { concepto: "PAPELERIA", cuenta: "5109-052-007", descripcion: "PAPELERIA Y ARTS. DE ESCRITORIO" },
  { concepto: "PREVISION SOCIAL", cuenta: "5109-052-023", descripcion: "IMPUESTOS Y DERECHOS LOCAL" },
  { concepto: "PUBLICIDAD", cuenta: "5109-052-011", descripcion: "PUBLICIDAD Y PROPAGANDA" },
  { concepto: "SUELDOS", cuenta: "5109-052-047", descripcion: "SUELDOS" },
  { concepto: "TELEFONIA", cuenta: "5109-052-008", descripcion: "TELEFONIA" },
  { concepto: "TRABAJOS DE HERRERIA", cuenta: "5109-052-055", descripcion: "GRATIFICACIONES" },
  { concepto: "TRANSITO LOCAL", cuenta: "5109-052-023", descripcion: "IMPUESTOS Y DERECHOS LOCAL" },
  { concepto: "VIATICOS", cuenta: "5109-052-006", descripcion: "GASTOS DE VIAJE" },
  { concepto: "VIGILANCIA NOCTURNA", cuenta: "5109-052-055", descripcion: "GRATIFICACIONES" },
] as const satisfies readonly Concepto[];

export function getConcepto(concepto: string): Concepto | undefined {
  return CONCEPTOS.find((c) => c.concepto === concepto);
}

import * as XLSX from "xlsx";
import type { Fila } from "@/lib/reportes/agruparPorLote";

// Exporta las filas filtradas a un .xlsx con 14 columnas (idéntico al HTML viejo).
// El monto va como número; la fecha de registro usa created_at o fecha_registro.
export function exportarExcel(filas: Fila[]): void {
  const datos = filas.map((r) => ({
    Beneficiario: String(r.nombre_beneficiario ?? ""),
    Fecha: r.fecha ? new Date(String(r.fecha)).toLocaleDateString("es-MX") : "",
    Monto: Number(r.monto ?? 0),
    "Quien Autoriza": String(r.quien_autoriza ?? ""),
    "Quien Entrega": String(r.quien_entrega ?? ""),
    Concepto: String(r.concepto ?? ""),
    Estado: String(r.estado ?? "").toUpperCase(),
    "Fecha Registro": r.created_at ?? r.fecha_registro
      ? new Date(String(r.created_at ?? r.fecha_registro)).toLocaleDateString("es-MX")
      : "",
    "Usuario Registro": String(r.usuario_registro ?? ""),
    Sucursal: String(r.sucursal_usuario ?? ""),
    "Numero Lote": String(r.numero_lote ?? ""),
    "Numero Solicitud": String(r.numero_solicitud ?? ""),
    Archivos: `${Array.isArray(r.archivos) ? r.archivos.length : 0} archivo(s)`,
    "Evidencia Entrega": r.evidencia_entrega ? "Sí" : "No",
  }));
  const hoja = XLSX.utils.json_to_sheet(datos);
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, "Reembolsos");
  const hoy = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(libro, `Reporte_Reembolsos_${hoy}.xlsx`);
}

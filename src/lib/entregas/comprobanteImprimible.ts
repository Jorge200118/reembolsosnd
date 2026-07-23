import type { Fila } from "@/lib/reportes/agruparPorLote";

// Mapeo concepto -> cuenta contable. Portado tal cual del sistema viejo (V3
// Reembolsos SQL). Alimenta el "Resumen por cuenta contable" del comprobante.
const cuentasContables: Record<string, { cuenta: string; descripcion: string }> = {
  "ANUNCIOS EN PESEROS":     { cuenta: "5109-052-011", descripcion: "PUBLICIDAD Y PROPAGANDA" },
  "ARRENDAMIENTOS":          { cuenta: "5109-052-034", descripcion: "ARRENDAMIENTO" },
  "CARGA Y DESCARGA":        { cuenta: "5109-052-047", descripcion: "SUELDOS" },
  "CASA LIC FBV Y JBV":      { cuenta: "5109-052-003", descripcion: "DIVERSOS" },
  "COMIDAS":                 { cuenta: "5109-052-017", descripcion: "CONSUMO LOCAL" },
  "COMISIONES":              { cuenta: "5109-052-022", descripcion: "COMISIONES DE TERCEROS" },
  "COMPENSACIONES":          { cuenta: "5109-052-055", descripcion: "GRATIFICACIONES" },
  "DIVERSOS":                { cuenta: "5109-052-003", descripcion: "DIVERSOS" },
  "DUPLICADOS DE LLAVES":    { cuenta: "5109-052-003", descripcion: "DIVERSOS" },
  "ELABORACION ARMEX":       { cuenta: "5109-052-055", descripcion: "GRATIFICACIONES" },
  "EQ. DE COMPUTO":          { cuenta: "5109-052-014", descripcion: "MANTO MOB Y EQPO OFNA" },
  "ESTACIONAMIENTO":         { cuenta: "5109-052-037", descripcion: "PEAJES" },
  "GAS":                     { cuenta: "5109-052-020", descripcion: "GAS" },
  "GASTOS DIRECTIVOS":       { cuenta: "5109-052-003", descripcion: "DIVERSOS" },
  "GUARDIA NACIONAL":        { cuenta: "5109-052-036", descripcion: "SERVICIOS DE GESTORIA" },
  "HORAS EXTRAS":            { cuenta: "5109-052-055", descripcion: "GRATIFICACIONES" },
  "LA MARIPOSA":             { cuenta: "5109-052-003", descripcion: "DIVERSOS" },
  "LAVANDERIA":              { cuenta: "5109-052-006", descripcion: "GASTOS DE VIAJE" },
  "LIMPIEZA":                { cuenta: "5109-052-033", descripcion: "ARTS. DE LIMPIEZA Y CAFET" },
  "MANTTO EQ. DE TRANSP.":   { cuenta: "5109-052-013", descripcion: "MANT. EQPO. DE TRASPORTE" },
  "MODALIDAD 40":            { cuenta: "5109-052-055", descripcion: "GRATIFICACIONES" },
  "MTO LOCAL ARRENDADO":     { cuenta: "5109-052-056", descripcion: "MANTTO Y CONS PROP. ARRENDADA" },
  "MTO MAQUINARIA Y EQUIPO": { cuenta: "5109-052-012", descripcion: "MANTO Y CONS MAQ. Y EQPO." },
  "MUNICIPIO":               { cuenta: "5109-052-023", descripcion: "IMPUESTOS Y DERECHOS LOCAL" },
  "PAPELERIA":               { cuenta: "5109-052-007", descripcion: "PAPELERIA Y ARTS. DE ESCRITORIO" },
  "PREVISION SOCIAL":        { cuenta: "5109-052-023", descripcion: "IMPUESTOS Y DERECHOS LOCAL" },
  "PUBLICIDAD":              { cuenta: "5109-052-011", descripcion: "PUBLICIDAD Y PROPAGANDA" },
  "SUELDOS":                 { cuenta: "5109-052-047", descripcion: "SUELDOS" },
  "TELEFONIA":               { cuenta: "5109-052-008", descripcion: "TELEFONIA" },
  "TRABAJOS DE HERRERIA":    { cuenta: "5109-052-055", descripcion: "GRATIFICACIONES" },
  "TRANSITO LOCAL":          { cuenta: "5109-052-023", descripcion: "IMPUESTOS Y DERECHOS LOCAL" },
  "VIATICOS":                { cuenta: "5109-052-006", descripcion: "GASTOS DE VIAJE" },
  "VIGILANCIA NOCTURNA":     { cuenta: "5109-052-055", descripcion: "GRATIFICACIONES" },
};

function obtenerCuentaContable(concepto: string): { cuenta: string; descripcion: string } {
  return cuentasContables[concepto] ?? { cuenta: "SIN ASIGNAR", descripcion: "CONCEPTO NO MAPEADO" };
}

// Construye el HTML del comprobante del lote. Réplica fiel del reporte del
// sistema viejo (V3): encabezado formal, tabla detallada, observaciones,
// resumen por cuenta contable en hoja aparte y bloque de firmas. Separado del
// window.open para poder probarlo sin navegador.
export function construirComprobanteHTML(args: {
  numeroSolicitud: string;
  sucursal: string;
  solicitante: string;
  reembolsos: Fila[];
}): string {
  const { numeroSolicitud, sucursal, solicitante, reembolsos } = args;
  const total = reembolsos.reduce((s, r) => s + Number(r.monto ?? 0), 0);
  const fmt = (n: number) => "$" + n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fechaHoy = new Date().toLocaleDateString("es-MX");

  const fechaFila = (v: unknown): string => {
    const s = v == null ? "" : String(v);
    if (!s) return "—";
    const d = new Date(s + "T12:00:00");
    return isNaN(d.getTime()) ? escapar(s) : d.toLocaleDateString("es-MX");
  };

  // Filas de la tabla detallada.
  const filas = reembolsos.map((r) => `
    <tr>
      <td>${escapar(String(r.numero_lote ?? "N/A"))}</td>
      <td>${escapar(String(r.nombre_beneficiario ?? ""))}</td>
      <td>${escapar(String(r.concepto ?? ""))}</td>
      <td>${fechaFila(r.fecha)}</td>
      <td style="text-align:right">${fmt(Number(r.monto ?? 0))}</td>
    </tr>`).join("");

  // Agrupar montos por cuenta contable para el resumen.
  const resumenPorCuenta: Record<string, {
    cuenta: string; descripcion: string; conceptos: Set<string>; comprobantes: number; monto: number;
  }> = {};
  for (const r of reembolsos) {
    const concepto = String(r.concepto ?? "");
    const info = obtenerCuentaContable(concepto);
    const clave = info.cuenta;
    if (!resumenPorCuenta[clave]) {
      resumenPorCuenta[clave] = { cuenta: info.cuenta, descripcion: info.descripcion, conceptos: new Set(), comprobantes: 0, monto: 0 };
    }
    resumenPorCuenta[clave].conceptos.add(concepto);
    resumenPorCuenta[clave].comprobantes += 1;
    resumenPorCuenta[clave].monto += Number(r.monto ?? 0);
  }

  const filasResumen = Object.values(resumenPorCuenta)
    .sort((a, b) => a.cuenta.localeCompare(b.cuenta))
    .map((g) => `
      <tr>
        <td style="font-family:monospace">${escapar(g.cuenta)}</td>
        <td>${escapar(g.descripcion)}</td>
        <td>${escapar(Array.from(g.conceptos).sort().join(", "))}</td>
        <td style="text-align:center">${g.comprobantes}</td>
        <td style="text-align:right">${fmt(g.monto)}</td>
      </tr>`).join("");

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
  <title>Solicitud de Entrega - ${escapar(numeroSolicitud)}</title>
  <style>
    body{font-family:Arial,sans-serif;margin:40px;font-size:14px;color:#0f172a}
    .header{text-align:center;margin-bottom:30px;border-bottom:2px solid #333;padding-bottom:20px}
    .header h2{margin:8px 0 4px;font-size:18px}
    .header h3{margin:0;font-size:15px;color:#334155}
    .logo{font-size:28px;font-weight:bold;color:#1a365d}
    .info-box{background:#f7fafc;padding:15px;border-radius:8px;margin:20px 0;border:1px solid #e2e8f0}
    .info-box p{margin:4px 0}
    .info-box h4{margin:0 0 8px}
    table{width:100%;border-collapse:collapse;margin:20px 0}
    th,td{border:1px solid #333;padding:10px 12px;text-align:left;font-size:13px}
    th{background:#f0f0f0;font-weight:bold}
    .total-row{background:#e6f3ff;font-weight:bold;font-size:15px}
    .signatures{margin-top:60px;display:flex;justify-content:space-between}
    .signature-box{text-align:center;width:250px}
    .signature-line{border-bottom:2px solid #333;margin-bottom:10px;height:80px}
    .footer{margin-top:40px;font-size:12px;color:#666;text-align:center}
    .resumen-cuentas{page-break-before:always;break-before:page;margin-top:30px}
    .resumen-cuentas h3{border-bottom:2px solid #333;padding-bottom:8px;margin-top:0}
    .resumen-cuentas table tr,.resumen-cuentas table thead{page-break-inside:avoid;break-inside:avoid}
    @media print{body{margin:20px}.no-print{display:none}.resumen-cuentas{page-break-before:always}}
  </style></head><body>
    <div class="header">
      <div class="logo">ACEROS CABOS, S.A. DE C.V.</div>
      <h2>SOLICITUD DE ENTREGA DE REEMBOLSOS</h2>
      <h3>No. ${escapar(numeroSolicitud)}</h3>
    </div>

    <div class="info-box">
      <p><strong>Fecha:</strong> ${fechaHoy}</p>
      <p><strong>Solicitado por:</strong> ${escapar(solicitante)}</p>
      <p><strong>Sucursal:</strong> ${escapar(sucursal)}</p>
      <p><strong>Total de comprobantes:</strong> ${reembolsos.length}</p>
      <p><strong>Monto total:</strong> ${fmt(total)}</p>
    </div>

    <table>
      <thead>
        <tr>
          <th style="width:15%">LOTE</th>
          <th style="width:20%">BENEFICIARIO</th>
          <th style="width:30%">CONCEPTO</th>
          <th style="width:15%">FECHA</th>
          <th style="width:20%">MONTO</th>
        </tr>
      </thead>
      <tbody>${filas}
        <tr class="total-row">
          <td colspan="4" style="text-align:center"><strong>TOTAL A ENTREGAR</strong></td>
          <td style="text-align:right"><strong>${fmt(total)}</strong></td>
        </tr>
      </tbody>
    </table>

    <div class="info-box">
      <h4>OBSERVACIONES:</h4>
      <p>• Los reembolsos listados han sido previamente autorizados por Fernando Balderrama.</p>
      <p>• Se solicita la entrega del efectivo correspondiente para su distribución.</p>
      <p>• Este documento debe ser firmado por ambas partes como comprobante de entrega.</p>
    </div>

    <div class="resumen-cuentas">
      <h3>RESUMEN POR CUENTA CONTABLE (No Deducibles)</h3>
      <table>
        <thead>
          <tr>
            <th style="width:15%">CUENTA</th>
            <th style="width:25%">DESCRIPCIÓN DE CUENTA</th>
            <th style="width:30%">CONCEPTOS INCLUIDOS</th>
            <th style="width:10%">COMPS.</th>
            <th style="width:20%">MONTO</th>
          </tr>
        </thead>
        <tbody>${filasResumen}
          <tr class="total-row">
            <td colspan="4" style="text-align:center"><strong>TOTAL</strong></td>
            <td style="text-align:right"><strong>${fmt(total)}</strong></td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="signatures">
      <div class="signature-box">
        <div class="signature-line"></div>
        <p><strong>SOLICITA Y RECIBE</strong></p>
        <p>Fecha: _________________</p>
      </div>
      <div class="signature-box">
        <div class="signature-line"></div>
        <p><strong>ENTREGA</strong></p>
        <p>Fecha: _________________</p>
      </div>
    </div>

    <div class="footer">
      <p>Sistema de Reembolsos No Deducibles - ACEROS CABOS</p>
      <p>Documento generado el ${new Date().toLocaleString("es-MX")}</p>
    </div>
  </body></html>`;

  return html;
}

// Abre una ventana nueva con el comprobante y dispara la impresión (el usuario
// puede "Guardar como PDF").
export function imprimirComprobanteLote(args: {
  numeroSolicitud: string;
  sucursal: string;
  solicitante: string;
  reembolsos: Fila[];
}): void {
  const html = construirComprobanteHTML(args);
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 400);
}

function escapar(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

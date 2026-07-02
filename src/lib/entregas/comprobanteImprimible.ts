import type { Fila } from "@/lib/reportes/agruparPorLote";

// Abre una ventana nueva con un comprobante HTML del lote solicitado y dispara
// la impresión (el usuario puede "Guardar como PDF"). Réplica del viejo, sin
// dependencias — solo HTML + window.print.
export function imprimirComprobanteLote(args: {
  numeroSolicitud: string;
  sucursal: string;
  solicitante: string;
  reembolsos: Fila[];
}): void {
  const { numeroSolicitud, sucursal, solicitante, reembolsos } = args;
  const total = reembolsos.reduce((s, r) => s + Number(r.monto ?? 0), 0);
  const fmt = (n: number) => "$" + n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const filas = reembolsos.map((r) => `
    <tr>
      <td>${escapar(String(r.nombre_beneficiario ?? ""))}</td>
      <td>${escapar(String(r.concepto ?? ""))}</td>
      <td style="text-align:right">${fmt(Number(r.monto ?? 0))}</td>
    </tr>`).join("");

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
  <title>Comprobante ${escapar(numeroSolicitud)}</title>
  <style>
    body{font-family:Arial,sans-serif;margin:40px;color:#0f172a}
    h1{font-size:20px;margin:0 0 4px}
    .muted{color:#64748b;font-size:13px}
    table{width:100%;border-collapse:collapse;margin-top:20px}
    th,td{padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:13px;text-align:left}
    th{background:#f1f5f9}
    .total{font-weight:bold;background:#eff6ff}
    .marca{font-weight:800;color:#1a56db;font-size:24px}
  </style></head><body>
    <div class="marca">ACEROS CABOS</div>
    <h1>Solicitud de entrega ${escapar(numeroSolicitud)}</h1>
    <p class="muted">Sucursal: ${escapar(sucursal)} · Solicitante: ${escapar(solicitante)} · ${new Date().toLocaleDateString("es-MX")}</p>
    <table>
      <thead><tr><th>Beneficiario</th><th>Concepto</th><th style="text-align:right">Monto</th></tr></thead>
      <tbody>${filas}
        <tr class="total"><td colspan="2">TOTAL</td><td style="text-align:right">${fmt(total)}</td></tr>
      </tbody>
    </table>
  </body></html>`;

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

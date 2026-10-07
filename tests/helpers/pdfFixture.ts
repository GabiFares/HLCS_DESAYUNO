/**
 * Generador de PDFs sintéticos para las pruebas.
 *
 * No se commitea ningún PDF real: los informes de Desbravador contienen
 * nombres, documentos y empresas. Este helper construye en memoria un PDF de
 * texto digital con la misma grilla que el informe real (columnas
 * posicionadas, filas partidas y varias páginas) para ejercitar el extractor.
 */

import { deflateSync } from "node:zlib";

export interface PdfRun {
  /** Columna: 0 habitación, 1 tipo, 2 operación, 3 ID, 4 descripción, 5 fecha in, 6 fecha out, 7 PAX. */
  column: number;
  text?: string;
  y: number;
  size?: number;
}

/** Una página del PDF sintético: fragmentos posicionados a dibujar. */
export interface PdfPage {
  runs: PdfRun[];
}

export interface PdfFixtureOptions {
  title?: string | null;
  /** Dibuja el encabezado de columnas. */
  header?: boolean;
  compress?: boolean;
}

/** X de cada columna del informe (puntos, página CartaHorizontal). */
export const COLUMN_X = [40, 78, 140, 190, 230, 420, 500, 580];

export const HEADER_ROW: PdfRun[] = [
  { column: 0, text: "Habitacion", y: 520 },
  { column: 1, text: "Tipo", y: 520 },
  { column: 2, text: "Operacion", y: 520 },
  { column: 3, text: "ID", y: 520 },
  { column: 4, text: "Descripcion", y: 520 },
  { column: 5, text: "Fecha In", y: 520 },
  { column: 6, text: "Fecha Out", y: 520 },
  { column: 7, text: "PAX", y: 520 },
];

/** Convierte filas de tabla en fragmentos posicionados. */
export function tableRow(y: number, columns: (string | null)[]): PdfRun[] {
  return columns.map((text, column) => (text === null ? { column, y } : { column, text, y }));
}

export function positionedFromRuns(runs: PdfRun[]): { text: string; x: number; y: number }[] {
  return runs.map((run) => ({ text: run.text ?? "", x: COLUMN_X[run.column] ?? 0, y: run.y }));
}

function escapePdfText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

export function buildPdf(pages: PdfPage[], options: PdfFixtureOptions = {}): Uint8Array {
  const { title = "INFORME DETALLE DIARIO DE OCUPACION", header = true, compress = true } = options;
  const pageCount = pages.length;
  const contentBase = 4;
  const pageBase = contentBase + pageCount;
  const total = pageBase + pageCount - 1;
  const bodies: (string | { dict: string; data: Uint8Array } | null)[] = new Array(total).fill(null);

  bodies[0] = "<< /Type /Catalog /Pages 2 0 R >>";
  bodies[1] = `<< /Type /Pages /Kids [${Array.from({ length: pageCount }, (_, i) => `${pageBase + i} 0 R`).join(" ")}] /Count ${pageCount} >>`;
  bodies[2] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";

  for (let i = 0; i < pageCount; i += 1) {
    const runs: PdfRun[] = [];
    if (i === 0 && title) runs.push({ column: 0, text: title, y: 555, size: 12 });
    if (header) runs.push(...HEADER_ROW);
    runs.push(...(pages[i]?.runs ?? []));

    const parts = ["BT"];
    for (const run of runs) {
      const size = run.size ?? 8;
      const x = COLUMN_X[run.column] ?? 0;
      parts.push(`/F1 ${size} Tf 1 0 0 1 ${x} ${run.y} Tm (${escapePdfText(run.text ?? "")}) Tj`);
    }
    parts.push("ET");

    const raw = new TextEncoder().encode(parts.join("\n"));
    const data = compress ? new Uint8Array(deflateSync(raw)) : raw;
    bodies[contentBase + i - 1] = { dict: compress ? `<< /Length ${data.length} /Filter /FlateDecode >>` : `<< /Length ${data.length} >>`, data };
    bodies[pageBase + i - 1] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentBase + i} 0 R >>`;
  }

  const chunks: Uint8Array[] = [new TextEncoder().encode("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")];
  const offsets: number[] = [];
  let length = chunks[0]?.length ?? 0;
  const push = (chunk: Uint8Array) => { chunks.push(chunk); length += chunk.length; };

  for (let i = 0; i < total; i += 1) {
    offsets[i + 1] = length;
    const body = bodies[i] as string | { dict: string; data: Uint8Array };
    if (typeof body === "string") {
      push(encode(`${i + 1} 0 obj\n${body}\nendobj\n`));
    } else {
      push(encode(`${i + 1} 0 obj\n${body.dict}\nstream\n`));
      push(body.data);
      push(encode("\nendstream\nendobj\n"));
    }
  }

  const xrefStart = length;
  let xref = `xref\n0 ${total + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= total; i += 1) xref += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  xref += `trailer\n<< /Size ${total + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  push(encode(xref));

  return concat(chunks);
}

function encode(value: string): Uint8Array {
  const out = new Uint8Array(value.length);
  for (let i = 0; i < value.length; i += 1) out[i] = value.charCodeAt(i) & 0xff;
  return out;
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}
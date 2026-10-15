/**
 * Extracción de texto del PDF del informe de Desbravador.
 *
 * Se hace en el Worker y no en el navegador por tres motivos:
 *
 * - El navegador no expone una API de texto para PDF; habría que enviar una
 *   biblioteca de render al cliente y engordar el bundle de la SPA.
 * - La vista previa y la aplicación deben coincidir exactamente. Si el Worker
 *   vuelve a parsear el archivo al confirmar, nunca se aplica lo que pidió el
 *   cliente sino lo que el servidor leyó del PDF.
 * - `unpdf` es pdf.js compilado para runtimes serverless y funciona en
 *   Cloudflare Workers sin polyfills.
 *
 * El PDF es digital: se extrae la capa de texto, nunca se hace OCR.
 *
 * Vive en `shared/` y no en `worker/` porque es lógica pura y así las pruebas
 * pueden ejercitarla con el mismo camino que el Worker.
 */

import { definePDFJSModule, getDocumentProxy } from "unpdf";
import type { PositionedItem } from "./types.ts";

/**
 * `unpdf` resuelve pdf.js con un `import()` dinámico de un archivo suelto, que
 * Cloudflare Workers no tiene. Pasándole el módulo explícitamente, el bundler
 * lo incluye en el bundle del Worker y desaparece el dynamic import.
 */
await definePDFJSModule(() => import("unpdf/pdfjs"));

/** Tope defensivo: los informes reales tienen unas pocas páginas. */
const MAX_PAGES = 60;
const MAX_ITEMS_PER_PAGE = 20_000;

export const NOT_A_REPORT = "No pudimos reconocer este archivo como un informe de ocupación de Desbravador.";

/** Error de dominio: el Worker lo traduce al formato HTTP. */
export class ReportError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ReportError";
    this.status = status;
    this.code = code;
  }
}

interface TextContentItem {
  str: string;
  transform: number[];
  width?: number;
}

function textItemsOf(value: unknown): TextContentItem[] {
  if (!value || typeof value !== "object") return [];
  const items = (value as { items?: unknown }).items;
  return Array.isArray(items) ? (items as TextContentItem[]) : [];
}

/** Devuelve, por página, los fragmentos de texto con su posición. */
export async function extractReportPages(bytes: Uint8Array): Promise<PositionedItem[][]> {
  let document: Awaited<ReturnType<typeof getDocumentProxy>>;
  try {
    document = await getDocumentProxy(bytes);
  } catch {
    throw new ReportError(422, "invalid_pdf", NOT_A_REPORT);
  }

  const pageCount = document.numPages;
  if (pageCount < 1) throw new ReportError(422, "empty_pdf", NOT_A_REPORT);
  if (pageCount > MAX_PAGES) {
    throw new ReportError(422, "too_many_pages", `El informe tiene ${pageCount} páginas y el máximo admitido es ${MAX_PAGES}.`);
  }

  const pages: PositionedItem[][] = [];
  for (let number = 1; number <= pageCount; number += 1) {
    const page = await document.getPage(number);
    const items = textItemsOf(await page.getTextContent());
    if (items.length > MAX_ITEMS_PER_PAGE) {
      throw new ReportError(422, "document_too_large", "El archivo tiene demasiado texto para procesarse.");
    }
    pages.push(items.flatMap((item) => {
      const x = item.transform[4];
      const y = item.transform[5];
      if (typeof x !== "number" || typeof y !== "number") return [];
      return [{ text: item.str ?? "", x, y, width: item.width }];
    }));
  }
  return pages;
}

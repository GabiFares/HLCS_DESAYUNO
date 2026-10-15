/**
 * Parser del "Informe Detalle Diario de Occupación" de Desbravador.
 *
 * El parser NO conoce PDF: recibe los fragmentos de texto ya extraídos con su
 * posición en la página. Esa separación permite probarlo sin un PDF real y
 * mantiene la extracción de texto en un único módulo de la capa de Worker.
 *
 * Estrategia:
 *
 * 1. Se agrupan los fragmentos por línea vertical (coordenada Y).
 * 2. Se localiza el encabezado de columnas y se derivan los límites de cada
 *    columna como el punto medio entre encabezados vecinos. Al usar puntos
 *    medios el resultado no depende de si el reporte alinea el texto a la
 *    izquierda, a la derecha o al centro de la celda.
 * 3. Cada línea se reparte entre las columnas y se clasifica.
 * 4. Se fusionan las líneas que sólo aportan la parte faltante de un registro
 *    partido (habitación en una línea, o ID/fechas/PAX en otra). Una línea de
 *    continuación de la descripción no aporta ni habitación ni fechas, por lo
 *    que nunca se confunde con una habitación nueva.
 *
 * Todo lo que no se puede interpretar con certeza termina en `review`; nunca
 * se inventa una estadía.
 */

import { foldText, normalizeRoom, parseReportDate } from "./normalize.ts";
import type { ParsedReview, ParsedSkipped, ParsedStay, ParseResult, PositionedItem } from "./types.ts";

const COL_ROOM = 0;
const COL_TYPE = 1;
const COL_OPERATION = 2;
const COL_ID = 3;
const COL_CHECK_IN = 5;
const COL_CHECK_OUT = 6;
const COL_PAX = 7;
const COLUMN_COUNT = 8;

const MAX_ROOM_LENGTH = 20;
const MAX_EXTERNAL_ID_LENGTH = 40;
const MAX_GUESTS = 99;
const MAX_PAGES = 60;
/** Cuántas filas hacia atrás se busca una fila HOSPEDAJE a la que anexar datos. */
const MERGE_LOOKBACK = 3;
/** Caracteres de relleno tolerados entre un rótulo y el siguiente. */
const MAX_HEADER_GAP = 8;

type Cell = string | null;

interface PageLine {
  y: number;
  cells: Cell[];
  raw: string;
  ordered: PositionedItem[];
  consumed: boolean;
}

/**
 * Lee una celda. El proyecto usa `noUncheckedIndexedAccess`, así que indexar
 * una fila devuelve `Cell | undefined`; normalizar a `null` mantiene el resto
 * del parser sin comprobaciones repetidas.
 */
function cellAt(cells: Cell[], index: number): Cell {
  return cells[index] ?? null;
}

/**
 * Rótulos de columna del informe, en orden, con sus variantes conhecidas.
 *
 * Cada entrada busca la etiqueta a partir de donde terminó la anterior. Se
 * exige la secuencia completa: ocho rótulos en orden no aparecen por casualidad
 * en otro PDF, así que un archivo cualquiera no se confunde con el informe.
 */
const COLUMN_LABELS: RegExp[] = [
  /HABITACION|HABITACI(?![A-Z0-9])/,
  /TIPO(?![A-Z0-9])|T(?![A-Z0-9])/,
  /OPERACION|OPERAC(?![A-Z0-9])/,
  /ID(?![A-Z0-9])|ID RESERVA|NRO(?![A-Z0-9])|N(?![A-Z0-9])/,
  /DESCRIPCION|DESCRIPC(?![A-Z0-9])|NOMBRE|HUESPED/,
  /FECHA\s+(?:DE\s+)?(?:IN|INGRESO|ENTRADA)(?![A-Z])|INGRESO(?![A-Z])|IN(?![A-Z])/,
  /FECHA\s+(?:DE\s+)?(?:OUT|SALIDA|EGRESO|CHECK\s?OUT)(?![A-Z])|SALIDA(?![A-Z])|OUT(?![A-Z])/,
  /PAX(?![A-Z0-9])|PASAJER|HUESPEDES/,
];

/** Totales, encabezados de página y pies: no son registros y no se cuentan. */
const NOISE_PATTERNS: RegExp[] = [
  /\bROOM ?NIGHTS?\b/, /\bCHECK[\s-]?INS?\b/, /\bCHECK[\s-]?OUTS?\b/,
  /\bTOTAL\b/, /^TOTALES\b/, /\bOCUPACION\b/, /\bPROMEDIO\b/,
  /\bPAGINA\b/, /^PAGE\s*\d/, /^-\s*\d+\s*-$/, /\bHOJA\b/,
  /\bDESBRAVADOR\b/, /\bINFORME\b/, /\bDETALLE DIARIO\b/, /\bEMITIDO\b/, /\bGENERADO\b/,
  /\bDESDE\b.*\bHASTA\b/, /\bFECHA DE (EMISION|IMPRESION)\b/,
];

function cellText(items: PositionedItem[]): string {
  return items.map((item) => item.text).join(" ").replace(/\s+/g, " ").trim();
}

/** Agrupa fragmentos en líneas por Y, tolerando el redondeo de las coordenadas. */
function groupLines(items: PositionedItem[]): PageLine[] {
  const usable = items.filter((item) => item.text.trim().length > 0);
  const sorted = [...usable].sort((a, b) => (b.y - a.y) || (a.x - b.x));
  const lines: PageLine[] = [];
  for (const item of sorted) {
    const line = lines.find((candidate) => Math.abs(candidate.y - item.y) <= 1.5);
    if (line) line.ordered.push(item);
    else {
      lines.push({
        y: item.y,
        cells: new Array<Cell>(COLUMN_COUNT).fill(null),        raw: "",
        ordered: [item],
        consumed: false,
      });
    }
  }
  for (const line of lines) {
    line.ordered.sort((a, b) => a.x - b.x);
    line.raw = foldText(cellText(line.ordered));
  }
  return lines.sort((a, b) => b.y - a.y);
}

/**
 * Quita acentos sin cambiar la longitud, para poder seguir la posición.
 *
 * `foldText` no sirve acá porque colapsa espacios: al buscar por índice sobre el
 * texto plegado las posiciones dejarían de coincidir con la X real del carácter.
 */
function foldChars(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toUpperCase();
}

/**
 * Vuelca la línea a caracteres con su X interpolada dentro de cada item.
 *
 * pdf.js no devuelve un item por celda: fusiona rótulos vecinos pegados
 * ("Habitacion" + "Tipo" llegan como un único string "HabitacionTipo"), fusiona
 * palabras de una celda e intercala espacios sueltos. Por eso no se puede
 * esperar un item por rótulo: hay que buscar la etiqueta por posición de
 * carácter sobre el texto de toda la línea.
 */
function lineChars(line: PageLine): { text: string; xs: number[] } {
  let text = "";
  const xs: number[] = [];
  for (const item of line.ordered) {
    const glyphs = item.text.replace(/\s+/g, "").length || 1;
    const perGlyph = (item.width ?? 0) / glyphs;
    let visible = 0;
    for (const char of item.text) {
      text += char;
      xs.push(item.x + visible * perGlyph);
      if (!/\s/.test(char)) visible += 1;
    }
    // Separador entre items para que dos rótulos de items distintos no queden
    // pegados al reconstruir el texto.
    text += " ";
    xs.push(item.x + (item.width ?? 0));
  }
  return { text: foldChars(text), xs };
}

/**
 * Devuelve el centro X de cada encabezado de columna, o `null` si la línea no
 * es el encabezado del informe.
 */
function detectHeader(line: PageLine): number[] | null {
  const { text, xs } = lineChars(line);
  const centers: number[] = [];
  let cursor = 0;
  for (const label of COLUMN_LABELS) {
    const match = label.exec(text.slice(cursor));
    if (!match || match.index > MAX_HEADER_GAP) return null;
    centers.push(xs[cursor + match.index] ?? 0);
    cursor += match.index + match[0].length;
  }
  return centers;
}

/** Límites de columna como puntos medios entre encabezados vecinos. */
function boundariesFrom(centers: number[]): number[] {
  const boundaries: number[] = [];
  for (let i = 0; i + 1 < centers.length; i += 1) {
    boundaries.push(((centers[i] ?? 0) + (centers[i + 1] ?? 0)) / 2);
  }
  return boundaries;
}

function assignCells(line: PageLine, boundaries: number[]): void {
  for (const item of line.ordered) {
    let column = boundaries.findIndex((boundary) => item.x < boundary);
    if (column === -1) column = COLUMN_COUNT - 1;
    const existing = cellAt(line.cells, column);
    line.cells[column] = existing === null ? item.text.trim() : `${existing} ${item.text}`.trim();
  }
  for (let i = 0; i < COLUMN_COUNT; i += 1) {
    const value = cellAt(line.cells, i);
    if (value !== null) line.cells[i] = value.replace(/\s+/g, " ").trim() || null;
  }
}

function isNoise(line: PageLine): boolean {
  return NOISE_PATTERNS.some((pattern) => pattern.test(line.raw));
}

/**
 * Una habitación es un identificador corto: "303", "0303", "12A", "12 A",
 * "PH-1". Se valida ANTES de normalizar para que una frase de un pie de
 * página ("PAGINA 1 DE 2") nunca pueda pasar por habitación.
 */
function isRoomToken(value: Cell): boolean {
  if (value === null) return false;
  const folded = foldText(value);
  if (!folded || folded.length > MAX_ROOM_LENGTH) return false;
  const words = folded.split(" ");
  if (words.length > 2) return false;
  if (!words.every((word) => /^[A-Z0-9]+(-[A-Z0-9]+)?$/.test(word))) return false;
  return normalizeRoom(value).length > 0;
}

function isTypeToken(value: Cell): boolean {
  if (value === null) return false;
  const folded = foldText(value);
  return folded.length >= 3 && folded.length <= 30 && /^[A-Z ]+$/.test(folded);
}

function isHospedaje(value: Cell): boolean {
  return value !== null && foldText(value).startsWith("HOSPEDAJE");
}

function isTransfer(value: Cell): boolean {
  return value !== null && /TRANSFER/.test(foldText(value));
}

const DATE_GLOBAL = /\d{2}\/\d{2}\/\d{4}/g;

function datesIn(value: Cell): string[] {
  if (value === null) return [];
  return value.match(DATE_GLOBAL) ?? [];
}

/** Primera y segunda fecha en orden de columna; tolera Fecha Out ausente. */
function harvestDates(cells: Cell[]): string[] {
  return [
    ...datesIn(cellAt(cells, COL_CHECK_IN)),
    ...datesIn(cellAt(cells, COL_CHECK_OUT)),
  ].slice(0, 2);
}

function firstInteger(value: Cell): number | null {
  if (value === null) return null;
  const match = /\d{1,3}/.exec(value);
  if (!match) return null;
  const parsed = Number.parseInt(match[0], 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function readExternalId(cells: Cell[]): string | null {
  const value = cellAt(cells, COL_ID)?.trim();
  if (!value || value.length > MAX_EXTERNAL_ID_LENGTH || !/^\d{1,12}$/.test(value)) return null;
  return value;
}

function readOperation(cells: Cell[]): string | null {
  const value = cellAt(cells, COL_OPERATION)?.trim();
  if (!value || value.length > 40) return null;
  return value;
}

/**
 * Busca la fila HOSPEDAJE a la que anexarle los datos de la línea `index`.
 * Devuelve -1 cuando la línea no corresponde a una fusión.
 */
function findMergeTarget(lines: PageLine[], index: number): number {
  const lowest = Math.max(0, index - MERGE_LOOKBACK);
  for (let cursor = index - 1; cursor >= lowest; cursor -= 1) {
    const candidate = lines[cursor];
    if (!candidate || candidate.consumed || !isTypeToken(cellAt(candidate.cells, COL_TYPE))) continue;
    // Si el destino ya tiene habitación, la línea no le pertenece.
    return cellAt(candidate.cells, COL_ROOM) === null ? cursor : -1;
  }
  return -1;
}

/**
 * Anexa a una fila HOSPEDAJE las líneas que sólo aportan la parte que le falta.
 *
 * Cubre los dos recortes del informe: la habitación en su propia línea y la
 * fila numérica (habitación, ID, fechas y PAX) desplazada debajo de la
 * descripción. Sólo se fusiona una línea sin tipo de operación —una fila con
 * tipo propio es un registro completo— y sólo contra un destino que todavía no
 * tiene habitación, de modo que una continuación de la descripción nunca se
 * confunde con una habitación nueva.
 */
function mergeSplitRows(lines: PageLine[]): void {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] as PageLine;
    if (line.consumed || isTypeToken(cellAt(line.cells, COL_TYPE))) continue;

    const providesRoom = isRoomToken(cellAt(line.cells, COL_ROOM));
    const providesDates = harvestDates(line.cells).length > 0;
    if (!providesRoom && !providesDates) continue;

    const targetIndex = findMergeTarget(lines, index);
    const target = targetIndex === -1 ? undefined : lines[targetIndex];
    if (!target) continue;

    for (let column = 0; column < COLUMN_COUNT; column += 1) {
      const value = cellAt(line.cells, column);
      if (cellAt(target.cells, column) === null && value !== null) target.cells[column] = value;
    }
    target.raw = `${target.raw} ${line.raw}`;
    for (let cursor = targetIndex + 1; cursor <= index; cursor += 1) {
      (lines[cursor] as PageLine).consumed = true;
    }
  }
}

function looksLikeRecord(line: PageLine): boolean {
  return isRoomToken(cellAt(line.cells, COL_ROOM)) || isTypeToken(cellAt(line.cells, COL_TYPE));
}

interface RowOutcome {
  stay?: ParsedStay;
  skipped?: ParsedSkipped;
  review?: ParsedReview;
}

function classify(cells: Cell[]): RowOutcome {
  const operation = readOperation(cells);
  const externalId = readExternalId(cells);
  const roomCell = cellAt(cells, COL_ROOM);
  const room = roomCell !== null && isRoomToken(roomCell) ? normalizeRoom(roomCell) : null;
  const typeCell = cellAt(cells, COL_TYPE);

  // Sin tipo no se descarta en silencio: el registro necesita revisión manual.
  if (!isTypeToken(typeCell)) {
    if (room === null) return { skipped: { reason: "malformed", roomNumber: null, operation } };
    return {
      review: {
        reason: "ambigua", roomNumber: room, checkInDate: null, checkOutDate: null,
        guestCount: null, externalId,
      },
    };
  }

  if (!isHospedaje(typeCell)) {
    return { skipped: { reason: "not_hospedaje", roomNumber: room, operation } };
  }

  if (room === null) {
    return {
      review: {
        reason: "sin_habitacion", roomNumber: null, checkInDate: null, checkOutDate: null,
        guestCount: null, externalId,
      },
    };
  }

  const dates = harvestDates(cells);
  const checkIn = dates[0] ? parseReportDate(dates[0]) : null;
  const checkOut = dates[1] ? parseReportDate(dates[1]) : null;
  const guestCount = firstInteger(cellAt(cells, COL_PAX));
  const detail = { roomNumber: room, checkInDate: checkIn, checkOutDate: checkOut, guestCount, externalId };

  if (isTransfer(cellAt(cells, COL_OPERATION))) return { review: { ...detail, reason: "transferencia" } };
  if (checkIn === null || checkOut === null) return { review: { ...detail, reason: "fechas_incompletas" } };
  if (checkOut <= checkIn) return { review: { ...detail, reason: "fechas_invalidas" } };
  if (guestCount === null || guestCount < 1 || guestCount > MAX_GUESTS) {
    return { review: { ...detail, reason: "pax_invalido" } };
  }

  return { stay: { roomNumber: room, checkInDate: checkIn, checkOutDate: checkOut, guestCount, externalId, operation } };
}

/** Colapsa repeticiones idénticas del mismo informe y aísla las contradictorias. */
function resolveInReportDuplicates(stays: ParsedStay[]): { stays: ParsedStay[]; review: ParsedReview[] } {
  const groups = new Map<string, ParsedStay[]>();
  for (const stay of stays) {
    const key = `${stay.roomNumber}|${stay.checkInDate}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(stay);
    else groups.set(key, [stay]);
  }
  const kept: ParsedStay[] = [];
  const review: ParsedReview[] = [];
  for (const bucket of groups.values()) {
    const first = bucket[0] as ParsedStay;
    const identical = bucket.every((stay) =>
      stay.checkOutDate === first.checkOutDate
      && stay.guestCount === first.guestCount
      && stay.externalId === first.externalId);
    if (identical) {
      kept.push(first);
      continue;
    }
    for (const stay of bucket) {
      review.push({
        reason: "duplicada_en_informe",
        roomNumber: stay.roomNumber,
        checkInDate: stay.checkInDate,
        checkOutDate: stay.checkOutDate,
        guestCount: stay.guestCount,
        externalId: stay.externalId,
      });
    }
  }
  return { stays: kept, review };
}

export function parseReport(pages: PositionedItem[][]): ParseResult {
  const result: ParseResult = { stays: [], skipped: [], review: [], pageCount: pages.length, isReport: false };
  if (pages.length === 0) return result;

  for (const items of pages.slice(0, MAX_PAGES)) {
    const lines = groupLines(items);
    const headerLine = lines.find((line) => detectHeader(line) !== null);
    if (!headerLine) continue;
    result.isReport = true;
    const boundaries = boundariesFrom(detectHeader(headerLine) as number[]);

    const body: PageLine[] = [];
    for (const line of lines) {
      if (line === headerLine) continue;
      assignCells(line, boundaries);
      // El encabezado se repite al cambiar de página dentro del mismo informe.
      if (detectHeader(line) !== null) continue;
      // Totales, encabezados de página y pies no son registros. La condición
      // exige que la línea no traiga tipo de operación, así que un dato real
      // nunca se descarta por contener la palabra "total" en la descripción.
      if (isNoise(line) && !isTypeToken(cellAt(line.cells, COL_TYPE))) continue;
      body.push(line);
    }

    mergeSplitRows(body);

    for (const line of body) {
      if (line.consumed || !looksLikeRecord(line)) continue;
      const outcome = classify(line.cells);
      if (outcome.stay) result.stays.push(outcome.stay);
      else if (outcome.skipped) result.skipped.push(outcome.skipped);
      else if (outcome.review) result.review.push(outcome.review);
    }
  }

  const resolved = resolveInReportDuplicates(result.stays);
  result.stays = resolved.stays;
  result.review.push(...resolved.review);
  return result;
}

/**
 * Importación de reservas desde el informe de ocupación de Desbravador.
 *
 * El archivo se procesa entero en el Worker, en los dos endpoints:
 *
 * - `preview` devuelve el plan sin tocar la base.
 * - `apply` vuelve a parsear el mismo PDF y a resolver el plan contra el estado
 *   actual de D1 antes de escribir. Nunca se confía en lo que calculó el
 *   navegador, de modo que la vista previa y lo guardado siempre coinciden y
 *   un doble envío no puede duplicar nada.
 *
 * Los cambios de `stays` y el registro en `stay_imports` viajan en un único
 * `db.batch()`, que D1 ejecuta como transacción.
 */

import { normalizeRoom } from "../../shared/desbravador/normalize";
import { extractReportPages, NOT_A_REPORT, ReportError } from "../../shared/desbravador/extract";
import { parseReport } from "../../shared/desbravador/parser";
import { buildPlan, type ExistingStayView } from "../../shared/desbravador/plan";
import type { ImportPlan, ImportPreview, ImportResult, ParseResult } from "../../shared/desbravador/types";
import { HttpError, json } from "../http";

/** 8 MB alcanza de sobra para el informe y acota el trabajo del Worker. */
const MAX_BYTES = 8 * 1024 * 1024;
/** Por debajo de este límite de D1 se agrupan los check-in de una consulta. */
const MAX_BOUND_PARAMETERS = 80;

interface StayWithHistoryRow {
  id: number;
  room_number: string;
  check_in_date: string;
  check_out_date: string;
  guest_count: number;
  completed_on: string | null;
  service_date: string | null;
  served_count: number | null;
}

interface UploadedReport {
  fileName: string;
  fileSize: number;
  parsed: ParseResult;
}

async function readReport(request: Request): Promise<UploadedReport> {
  if (!request.headers.get("content-type")?.includes("multipart/form-data")) {
    throw new HttpError(415, "El archivo debe enviarse como formulario.", "invalid_content_type");
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new HttpError(400, "No pudimos leer el archivo seleccionado.", "invalid_form");
  }

  const entry = form.get("file");
  if (!entry || typeof entry === "string") {
    throw new HttpError(400, "Seleccioná un archivo PDF para importar.", "missing_file");
  }

  const fileName = (entry.name || "informe.pdf").slice(0, 120);
  const isPdfName = fileName.toLowerCase().endsWith(".pdf");
  if (entry.type !== "application/pdf" && !isPdfName) {
    throw new HttpError(415, "El archivo tiene que ser un PDF exportado desde Desbravador.", "invalid_file_type");
  }
  if (entry.size === 0) throw new HttpError(400, "El archivo está vacío.", "empty_file");
  if (entry.size > MAX_BYTES) {
    throw new HttpError(413, "El archivo es demasiado grande para importarlo.", "file_too_large");
  }

  const bytes = new Uint8Array(await entry.arrayBuffer());
  if (bytes.length < 5 || String.fromCharCode(...bytes.slice(0, 5)) !== "%PDF-") {
    throw new HttpError(422, NOT_A_REPORT, "invalid_pdf");
  }

  const parsed = parseReport(await readPages(bytes));
  if (!parsed.isReport) throw new HttpError(422, NOT_A_REPORT, "not_occupancy_report");

  return { fileName, fileSize: entry.size, parsed };
}

/** Traduce los errores de extracción al formato HTTP del Worker. */
async function readPages(bytes: Uint8Array) {
  try {
    return await extractReportPages(bytes);
  } catch (error) {
    if (error instanceof ReportError) throw new HttpError(error.status, error.message, error.code);
    console.error("desbravador extract", error);
    throw new HttpError(422, NOT_A_REPORT, "invalid_pdf");
  }
}

/**
 * Estadías que pueden coincidir con el informe, con su historial de desayunos.
 *
 * Se filtran por check-in en SQL y por habitación normalizada en memoria: así
 * "303" del informe encuentra "0303" guardado a mano sin depender de una
 * normalización que no existe todavía en la base.
 */
async function loadCandidates(db: D1Database, parsed: ParseResult): Promise<ExistingStayView[]> {
  const checkIns = [...new Set(parsed.stays.map((stay) => stay.checkInDate))];
  if (checkIns.length === 0) return [];

  const rows: StayWithHistoryRow[] = [];
  for (let offset = 0; offset < checkIns.length; offset += MAX_BOUND_PARAMETERS) {
    const chunk = checkIns.slice(offset, offset + MAX_BOUND_PARAMETERS);
    const placeholders = chunk.map(() => "?").join(", ");
    const result = await db.prepare(
      `SELECT s.id, s.room_number, s.check_in_date, s.check_out_date, s.guest_count, s.completed_on,
        b.service_date, b.served_count FROM stays s
        LEFT JOIN breakfast_daily_status b ON b.stay_id = s.id AND b.served_count > 0
        WHERE s.check_in_date IN (${placeholders})`,
    ).bind(...chunk).all<StayWithHistoryRow>();
    rows.push(...result.results);
  }

  const wanted = new Set(parsed.stays.map((stay) => `${normalizeRoom(stay.roomNumber)}|${stay.checkInDate}`));
  const views = new Map<number, ExistingStayView>();
  for (const row of rows) {
    const key = `${normalizeRoom(row.room_number)}|${row.check_in_date}`;
    if (!wanted.has(key)) continue;
    const view = views.get(row.id) ?? {
      id: row.id,
      roomNumber: row.room_number,
      checkInDate: row.check_in_date,
      checkOutDate: row.check_out_date,
      guestCount: row.guest_count,
      completedOn: row.completed_on,
      served: [],
    };
    if (row.service_date !== null && (row.served_count ?? 0) > 0) {
      view.served.push({ date: row.service_date, count: row.served_count as number });
    }
    views.set(row.id, view);
  }
  return [...views.values()];
}

function countsOf(plan: ImportPlan) {
  return {
    create: plan.create.length,
    update: plan.update.length,
    unchanged: plan.unchanged.length,
    review: plan.review.length,
    ignored: plan.ignored,
  };
}

export async function previewImport(db: D1Database, request: Request): Promise<Response> {
  const { fileName, fileSize, parsed } = await readReport(request);
  const plan = buildPlan(parsed, await loadCandidates(db, parsed));

  const preview: ImportPreview = {
    fileName,
    fileSize,
    pageCount: parsed.pageCount,
    counts: countsOf(plan),
    create: plan.create,
    update: plan.update,
    review: plan.review,
  };
  return json(preview);
}

export async function applyImport(db: D1Database, request: Request): Promise<Response> {
  const { fileName, fileSize, parsed } = await readReport(request);
  const plan = buildPlan(parsed, await loadCandidates(db, parsed));
  const counts = countsOf(plan);

  const statements: D1PreparedStatement[] = [
    db.prepare(
      `INSERT INTO stay_imports (file_name, file_size, page_count, created_count, updated_count,
        unchanged_count, review_count, ignored_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(fileName, fileSize, parsed.pageCount, counts.create, counts.update, counts.unchanged, counts.review, counts.ignored),
  ];

  for (const item of plan.create) {
    statements.push(db.prepare(
      `INSERT INTO stays (room_number, check_in_date, check_out_date, guest_count, source, external_id)
       VALUES (?, ?, ?, ?, 'desbravador', ?)`,
    ).bind(item.roomNumber, item.checkInDate, item.checkOutDate, item.guestCount, item.externalId));
  }

  for (const item of plan.update) {
    if (item.stayId === null) continue;
    statements.push(db.prepare(
      // `source` no se reescribe: una estadía creada a mano sigue siendo manual
      // aunque se le actualicen pasajeros o check-out.
      `UPDATE stays SET check_out_date = ?, guest_count = ?,
       external_id = COALESCE(?, external_id), updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    ).bind(item.checkOutDate, item.guestCount, item.externalId, item.stayId));
  }

  let results: D1Result[];
  try {
    results = await db.batch(statements);
  } catch (error) {
    console.error("desbravador apply", error);
    throw new HttpError(500, "No pudimos completar la importación. No se guardó ningún cambio.", "import_failed");
  }

  const result: ImportResult = { ...counts, importId: Number(results[0]?.meta?.last_row_id ?? 0) };
  return json(result);
}
import type { Stay } from "../shared/types";
import { HttpError, json, parseId, readJson } from "./http";
import { calendarDate, integerInRange, optionalText, requiredText, todayInUruguay } from "./validation";

interface StayRow {
  id: number;
  room_number: string;
  check_in_date: string;
  check_out_date: string;
  guest_count: number;
  breakfast_notes: string | null;
  completed_on: string | null;
  created_at: string;
  updated_at: string;
}

function mapStay(row: StayRow): Stay {
  return { id: row.id, roomNumber: row.room_number, checkInDate: row.check_in_date,
    checkOutDate: row.check_out_date, guestCount: row.guest_count, breakfastNotes: row.breakfast_notes,
    completedOn: row.completed_on, createdAt: row.created_at, updatedAt: row.updated_at };
}

async function getStay(db: D1Database, id: number): Promise<StayRow> {
  const row = await db.prepare("SELECT * FROM stays WHERE id = ?").bind(id).first<StayRow>();
  if (!row) throw new HttpError(404, "No se encontró la estadía.", "stay_not_found");
  return row;
}

function validateRange(checkInDate: string, checkOutDate: string): void {
  if (checkOutDate < checkInDate) {
    throw new HttpError(400, "El check-out no puede ser anterior al check-in.", "invalid_date_range");
  }
}

export async function listStays(db: D1Database): Promise<Response> {
  const result = await db.prepare(
    `SELECT * FROM stays ORDER BY CASE WHEN completed_on IS NULL THEN 0 ELSE 1 END,
     check_in_date DESC, room_number COLLATE NOCASE ASC LIMIT 500`,
  ).all<StayRow>();
  return json({ stays: result.results.map(mapStay) });
}

export async function createStay(db: D1Database, request: Request): Promise<Response> {
  const body = await readJson(request);
  const roomNumber = requiredText(body.roomNumber, "La habitación", 20);
  const checkInDate = calendarDate(body.checkInDate, "La fecha de check-in");
  const checkOutDate = calendarDate(body.checkOutDate, "La fecha de check-out");
  const guestCount = integerInRange(body.guestCount, "La cantidad de pasajeros", 1, 99);
  const breakfastNotes = optionalText(body.breakfastNotes, "La aclaración de desayuno", 300);
  validateRange(checkInDate, checkOutDate);
  const result = await db.prepare(
    "INSERT INTO stays (room_number, check_in_date, check_out_date, guest_count, breakfast_notes) VALUES (?, ?, ?, ?, ?)",
  ).bind(roomNumber, checkInDate, checkOutDate, guestCount, breakfastNotes).run();
  return json({ stay: mapStay(await getStay(db, Number(result.meta.last_row_id))) }, { status: 201 });
}

export async function updateStay(db: D1Database, request: Request, rawId: string): Promise<Response> {
  const id = parseId(rawId, "identificador de estadía");
  const current = await getStay(db, id);
  const body = await readJson(request);
  const roomNumber = body.roomNumber === undefined ? current.room_number : requiredText(body.roomNumber, "La habitación", 20);
  const checkInDate = body.checkInDate === undefined ? current.check_in_date : calendarDate(body.checkInDate, "La fecha de check-in");
  const checkOutDate = body.checkOutDate === undefined ? current.check_out_date : calendarDate(body.checkOutDate, "La fecha de check-out");
  const guestCount = body.guestCount === undefined ? current.guest_count : integerInRange(body.guestCount, "La cantidad de pasajeros", 1, 99);
  const breakfastNotes = body.breakfastNotes === undefined
    ? current.breakfast_notes
    : optionalText(body.breakfastNotes, "La aclaración de desayuno", 300);
  validateRange(checkInDate, checkOutDate);

  let completedOn = current.completed_on;
  if (body.completed !== undefined) {
    if (typeof body.completed !== "boolean") {
      throw new HttpError(400, "El estado de finalización no es válido.", "validation_error");
    }
    if (body.completed) {
      const today = todayInUruguay();
      if (today < checkInDate) throw new HttpError(409, "Una estadía futura no puede finalizarse.", "stay_not_started");
      completedOn = today;
    } else completedOn = null;
  }

  const conflicting = await db.prepare(
    `SELECT 1 FROM breakfast_daily_status WHERE stay_id = ? AND served_count > 0
     AND (service_date < ? OR service_date > ?) LIMIT 1`,
  ).bind(id, checkInDate, checkOutDate).first();
  if (conflicting) {
    throw new HttpError(409, "No se pueden excluir fechas que ya tienen desayunos registrados.", "breakfast_history_conflict");
  }

  await db.batch([
    db.prepare(
      `DELETE FROM breakfast_daily_status WHERE stay_id = ? AND served_count = 0
       AND (service_date < ? OR service_date > ?)`,
    ).bind(id, checkInDate, checkOutDate),
    db.prepare(
      `UPDATE stays SET room_number = ?, check_in_date = ?, check_out_date = ?, guest_count = ?,
       breakfast_notes = ?, completed_on = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    ).bind(roomNumber, checkInDate, checkOutDate, guestCount, breakfastNotes, completedOn, id),
  ]);
  return json({ stay: mapStay(await getStay(db, id)) });
}

export async function deleteStay(db: D1Database, rawId: string): Promise<Response> {
  const id = parseId(rawId, "identificador de estadía");
  await getStay(db, id);
  await db.prepare("DELETE FROM stays WHERE id = ?").bind(id).run();
  return new Response(null, { status: 204 });
}

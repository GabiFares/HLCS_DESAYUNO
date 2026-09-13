import type { BreakfastDay, BreakfastStay } from "../shared/types";
import { HttpError, json, parseId, readJson } from "./http";
import { calendarDate, integerInRange, todayInUruguay } from "./validation";

interface BreakfastRow { stay_id: number; room_number: string; check_in_date: string; check_out_date: string; guest_count: number; breakfast_notes: string | null; served_count: number }

export async function getBreakfastDay(db: D1Database, rawDate: string): Promise<Response> {
  const date = calendarDate(rawDate, "La fecha");
  const [staysResult, totalRow] = await Promise.all([
    db.prepare(
      `SELECT s.id AS stay_id, s.room_number, s.check_in_date, s.check_out_date,
       s.guest_count, s.breakfast_notes, COALESCE(b.served_count, 0) AS served_count FROM stays s
       LEFT JOIN breakfast_daily_status b ON b.stay_id = s.id AND b.service_date = ?
       WHERE ? BETWEEN s.check_in_date AND s.check_out_date
       AND (s.completed_on IS NULL OR s.completed_on > ?)
       ORDER BY CAST(s.room_number AS INTEGER), s.room_number COLLATE NOCASE`,
    ).bind(date, date, date).all<BreakfastRow>(),
    db.prepare("SELECT COALESCE(SUM(served_count), 0) AS total FROM breakfast_daily_status WHERE service_date = ?")
      .bind(date).first<{ total: number }>(),
  ]);
  const stays: BreakfastStay[] = staysResult.results.map((row) => ({ stayId: row.stay_id,
    roomNumber: row.room_number, checkInDate: row.check_in_date, checkOutDate: row.check_out_date,
    guestCount: row.guest_count, breakfastNotes: row.breakfast_notes, servedCount: row.served_count }));
  const pendingRooms = stays.filter((stay) => stay.servedCount < stay.guestCount).length;
  const response: BreakfastDay = { date, stays, totalServed: totalRow?.total ?? 0,
    pendingRooms, canClose: pendingRooms === 0 };
  return json(response);
}

export async function updateBreakfastCount(db: D1Database, request: Request, rawDate: string, rawStayId: string): Promise<Response> {
  const date = calendarDate(rawDate, "La fecha");
  if (date > todayInUruguay()) throw new HttpError(409, "No se pueden registrar desayunos en una fecha futura.", "future_breakfast");
  const stayId = parseId(rawStayId, "identificador de estadía");
  const body = await readJson(request);
  const servedCount = integerInRange(body.servedCount, "La cantidad de desayunos", 0, 99);
  const eligible = await db.prepare(
    `SELECT guest_count FROM stays WHERE id = ? AND ? BETWEEN check_in_date AND check_out_date
     AND (completed_on IS NULL OR completed_on > ?)`,
  ).bind(stayId, date, date).first<{ guest_count: number }>();
  if (!eligible) throw new HttpError(409, "La estadía ya no está activa para ese desayuno.", "stay_not_eligible");
  if (servedCount > eligible.guest_count) {
    throw new HttpError(409, `No se pueden registrar más de ${eligible.guest_count} desayunos.`, "count_above_guests");
  }
  try {
    await db.prepare(
      `INSERT INTO breakfast_daily_status (stay_id, service_date, served_count) VALUES (?, ?, ?)
       ON CONFLICT(stay_id, service_date) DO UPDATE SET served_count = excluded.served_count,
       updated_at = CURRENT_TIMESTAMP`,
    ).bind(stayId, date, servedCount).run();
  } catch (error) {
    if (error instanceof Error && error.message.includes("invalid breakfast count or date")) {
      throw new HttpError(409, "La cantidad de pasajeros cambió. La pantalla se actualizará con el nuevo valor.", "stale_guest_count");
    }
    throw error;
  }
  return json({ stayId, date, servedCount });
}

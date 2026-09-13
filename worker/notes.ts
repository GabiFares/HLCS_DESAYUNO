import { HttpError, json, readJson } from "./http";
import { calendarDate } from "./validation";

export async function getNote(db: D1Database, rawDate: string): Promise<Response> {
  const date = calendarDate(rawDate, "La fecha");
  const row = await db.prepare("SELECT content, updated_at FROM daily_notes WHERE note_date = ?")
    .bind(date).first<{ content: string; updated_at: string }>();
  return json({ date, content: row?.content ?? "", updatedAt: row?.updated_at ?? null });
}

export async function updateNote(db: D1Database, request: Request, rawDate: string): Promise<Response> {
  const date = calendarDate(rawDate, "La fecha");
  const body = await readJson(request);
  if (typeof body.content !== "string" || body.content.length > 5000) {
    throw new HttpError(400, "La nota debe ser texto y no superar 5000 caracteres.", "validation_error");
  }
  await db.prepare(
    `INSERT INTO daily_notes (note_date, content) VALUES (?, ?)
     ON CONFLICT(note_date) DO UPDATE SET content = excluded.content, updated_at = CURRENT_TIMESTAMP`,
  ).bind(date, body.content).run();
  return json({ date, content: body.content });
}

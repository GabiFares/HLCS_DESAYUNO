import { HttpError } from "./http";

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function calendarDate(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new HttpError(400, `${label} es obligatoria.`, "validation_error");
  }
  const match = DATE_PATTERN.exec(value);
  if (!match) {
    throw new HttpError(400, `${label} debe tener formato AAAA-MM-DD.`, "validation_error");
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new HttpError(400, `${label} no es una fecha válida.`, "validation_error");
  }
  return value;
}

export function requiredText(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new HttpError(400, `${label} es obligatorio.`, "validation_error");
  }
  const clean = value.trim();
  if (clean.length > maxLength) {
    throw new HttpError(400, `${label} no puede superar ${maxLength} caracteres.`, "validation_error");
  }
  return clean;
}

export function optionalText(value: unknown, label: string, maxLength: number): string | null {
  if (value === null || value === "" || value === undefined) return null;
  return requiredText(value, label, maxLength);
}

export function integerInRange(value: unknown, label: string, minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < minimum || value > maximum) {
    throw new HttpError(400, `${label} debe ser un entero entre ${minimum} y ${maximum}.`, "validation_error");
  }
  return value;
}

export function nullableQuantity(value: unknown, label: string): number | null {
  if (value === null || value === "" || value === undefined) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1_000_000_000) {
    throw new HttpError(400, `${label} debe ser un número positivo.`, "validation_error");
  }
  return value;
}

export function todayInUruguay(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Montevideo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * Normalización compartida entre el parser y el planificador de importaciones.
 *
 * La comparación de habitaciones nunca usa el texto crudo del PDF ni el valor
 * guardado en D1: ambas partes se pliegan con las mismas reglas para que
 * "303", " 303 ", "0303" y "303 " sean la misma habitación.
 */

/** Quita acentos, pasa a mayúsculas y colapsa espacios. Base de toda comparación. */
export function foldText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u00a0\u2007\u202f]/g, " ")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Forma canónica de una habitación.
 * Las habitaciones numéricas pierden ceros a la izquierda para que el informe
 * y las estadías manuales converjan; las alfanuméricas ("12A") sólo se
 * capitalizan.
 */
export function normalizeRoom(raw: string): string {
  const folded = foldText(raw);
  if (/^\d+$/.test(folded)) return String(Number.parseInt(folded, 10));
  return folded.replace(/\s+/g, "");
}

/** Identidad estable de una estadía dentro de un informe y dentro de D1. */
export function stayIdentity(roomNumber: string, checkInDate: string): string {
  return `${normalizeRoom(roomNumber)}|${checkInDate}`;
}

const REPORT_DATE = /^(\d{2})\/(\d{2})\/(\d{4})$/;

/**
 * Convierte DD/MM/AAAA a AAAA-MM-DD.
 * Devuelve `null` si el texto no es una fecha o si no corresponde a un día real.
 */
export function parseReportDate(value: string): string | null {
  const match = REPORT_DATE.exec(value.trim());
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return `${match[3]}-${match[2]}-${match[1]}`;
}

export function formatReportDate(value: string): string {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

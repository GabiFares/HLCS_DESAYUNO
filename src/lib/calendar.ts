export const MONTH_NAMES: readonly string[] = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Setiembre", "Octubre", "Noviembre", "Diciembre",
];

export const WEEKDAY_INITIALS: readonly string[] = ["L", "M", "X", "J", "V", "S", "D"];

export type CalendarDate = { year: number; month: number; day: number };

const pad = (value: number) => String(value).padStart(2, "0");

export function splitISODate(value: string): CalendarDate {
  const [year, month, day] = value.split("-").map(Number);
  return { year: year ?? 0, month: month ?? 1, day: day ?? 1 };
}

export function toISODate(year: number, month: number, day: number): string {
  return `${pad(year)}-${pad(month)}-${pad(day)}`;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function firstWeekdayMondayBased(year: number, month: number): number {
  const jsDay = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  return (jsDay + 6) % 7;
}

export function addMonths(year: number, month: number, delta: number): { year: number; month: number } {
  const total = year * 12 + (month - 1) + delta;
  return { year: Math.floor(total / 12), month: (((total % 12) + 12) % 12) + 1 };
}

export function monthYearLabel(year: number, month: number): string {
  return `${MONTH_NAMES[month - 1] ?? ""} ${year}`;
}
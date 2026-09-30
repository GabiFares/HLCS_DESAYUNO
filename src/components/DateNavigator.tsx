import { capitalize, formatDate, shiftCalendarDate, todayInUruguay } from "../lib/dates";

export function DateNavigator({ date, onChange, allowFuture = false }: {
  date: string;
  onChange: (date: string) => void;
  allowFuture?: boolean;
}) {
  const today = todayInUruguay();
  const fullDate = capitalize(formatDate(date, "long"));
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-2 py-1.5">
      <button type="button" onClick={() => onChange(shiftCalendarDate(date, -1))} aria-label="Día anterior" title="Día anterior" className="date-arrow">‹</button>
      <div className="relative min-w-0 flex-1">
        <span aria-hidden className="pointer-events-none block truncate px-1 text-center text-[15px] font-semibold leading-9 text-pine-950 sm:text-base">{fullDate}</span>
        <input type="date" value={date} max={allowFuture ? undefined : today} onChange={(event) => onChange(event.target.value)} aria-label="Fecha del historial" className="absolute inset-0 block w-full cursor-pointer appearance-none opacity-0" />
      </div>
      <button type="button" disabled={!allowFuture && date >= today} onClick={() => onChange(shiftCalendarDate(date, 1))} aria-label="Día siguiente" title="Día siguiente" className="date-arrow">›</button>
      {date !== today && <button type="button" onClick={() => onChange(today)} aria-label="Ir a hoy" title="Ir a hoy" className="btn-ghost min-h-10 shrink-0 px-3 text-sm">Hoy</button>}
    </div>
  );
}
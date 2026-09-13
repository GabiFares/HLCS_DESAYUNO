import { capitalize, formatDate, shiftCalendarDate, todayInUruguay } from "../lib/dates";

export function DateNavigator({ date, onChange }: { date: string; onChange: (date: string) => void }) {
  const today = todayInUruguay();
  const fullDate = capitalize(formatDate(date, "long"));
  const compactDate = fullDate.replace(/ de \d{4}$/, "");
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <button type="button" onClick={() => onChange(shiftCalendarDate(date, -1))} aria-label="Día anterior" className="date-arrow">‹</button>
        <div className="min-w-0 flex-1 text-center">
          <span className="block truncate text-[15px] font-semibold text-pine-950 sm:text-base">{fullDate}</span>
          <span className="block text-xs text-slate-500 sm:hidden">{compactDate}</span>
          <input type="date" value={date} max={today} onChange={(event) => onChange(event.target.value)} aria-label="Fecha del historial" className="mx-auto mt-0.5 block max-w-40 border-0 bg-transparent p-0 text-center text-xs text-slate-500 focus:ring-0" />
        </div>
        <button type="button" disabled={date >= today} onClick={() => onChange(shiftCalendarDate(date, 1))} aria-label="Día siguiente" className="date-arrow">›</button>
      </div>
      {date !== today && <button type="button" onClick={() => onChange(today)} className="btn-ghost min-h-9 text-pine-700 hover:text-pine-900">Volver a hoy</button>}
    </div>
  );
}
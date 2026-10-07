import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import {
  addMonths,
  daysInMonth,
  firstWeekdayMondayBased,
  MONTH_NAMES,
  monthYearLabel,
  splitISODate,
  toISODate,
  WEEKDAY_INITIALS,
} from "../lib/calendar";
import { capitalize, formatDate } from "../lib/dates";

type DateCalendarProps = {
  value: string;
  today: string;
  allowFuture?: boolean;
  onSelect: (date: string) => void;
  onClose: () => void;
};

type Cell = { iso: string; day: number; inMonth: boolean };
type View = { year: number; month: number };

function buildWeeks(year: number, month: number): Cell[][] {
  const offset = firstWeekdayMondayBased(year, month);
  const total = Math.ceil((offset + daysInMonth(year, month)) / 7) * 7;
  const cells: Cell[] = [];
  for (let index = 0; index < total; index += 1) {
    const date = new Date(Date.UTC(year, month - 1, index - offset + 1));
    cells.push({
      iso: toISODate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()),
      day: date.getUTCDate(),
      inMonth: date.getUTCMonth() === month - 1,
    });
  }
  const weeks: Cell[][] = [];
  for (let index = 0; index < cells.length; index += 7) {
    weeks.push(cells.slice(index, index + 7));
  }
  return weeks;
}

function initView(value: string): View {
  const { year, month } = splitISODate(value);
  return { year, month };
}

function dayClasses(cell: Cell, selected: boolean, today: string, disabled: boolean): string {
  const base = "grid h-11 w-11 place-items-center rounded-lg text-sm tabular-nums transition-colors "
    + "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pine-600 focus-visible:ring-offset-1";
  if (disabled) return `${base} cursor-not-allowed text-slate-300`;
  if (selected) return `${base} bg-pine-800 font-semibold text-white hover:bg-pine-900`;
  if (cell.iso === today) return `${base} font-semibold text-pine-800 ring-1 ring-inset ring-pine-500 hover:bg-pine-50`;
  if (!cell.inMonth) return `${base} text-slate-300 hover:bg-slate-100`;
  return `${base} text-slate-700 hover:bg-slate-100`;
}

export function DateCalendar({ value, today, allowFuture = false, onSelect, onClose }: DateCalendarProps) {
  const [view, setView] = useState<View>(() => initView(value));
  const [mode, setMode] = useState<"days" | "months">("days");
  const [focused, setFocused] = useState(value);
  const dayRefs = useRef(new Map<string, HTMLButtonElement>());

  const rows = useMemo(() => buildWeeks(view.year, view.month), [view.year, view.month]);

  useEffect(() => {
    if (mode !== "days") return;
    dayRefs.current.get(focused)?.focus();
  }, [focused, mode, rows]);

  const todayParts = splitISODate(today);
  const monthAtLimit = !allowFuture
    && (view.year > todayParts.year || (view.year === todayParts.year && view.month >= todayParts.month));
  const yearAtLimit = !allowFuture && view.year >= todayParts.year;

  const isDisabled = (iso: string) => !allowFuture && iso > today;

  function moveMonth(delta: number) {
    const next = addMonths(view.year, view.month, delta);
    setView(next);
    const current = splitISODate(focused);
    const day = Math.min(current.day, daysInMonth(next.year, next.month));
    setFocused(toISODate(next.year, next.month, day));
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (mode !== "days") return;
    const current = splitISODate(focused);
    const next = new Date(Date.UTC(current.year, current.month - 1, current.day));
    let handled = true;
    switch (event.key) {
      case "ArrowLeft": next.setUTCDate(next.getUTCDate() - 1); break;
      case "ArrowRight": next.setUTCDate(next.getUTCDate() + 1); break;
      case "ArrowUp": next.setUTCDate(next.getUTCDate() - 7); break;
      case "ArrowDown": next.setUTCDate(next.getUTCDate() + 7); break;
      case "Home": next.setUTCDate(1); break;
      case "End": next.setUTCDate(daysInMonth(current.year, current.month)); break;
      case "PageUp": next.setUTCMonth(next.getUTCMonth() - 1); break;
      case "PageDown": next.setUTCMonth(next.getUTCMonth() + 1); break;
      default: handled = false;
    }
    if (!handled) return;
    event.preventDefault();
    setFocused(toISODate(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate()));
    setView({ year: next.getUTCFullYear(), month: next.getUTCMonth() + 1 });
  }

  function chooseMonth(month: number) {
    setView((current) => ({ ...current, month }));
    setFocused(toISODate(view.year, month, 1));
    setMode("days");
  }

  if (mode === "months") {
    return (
      <div className="w-[19rem] max-w-[calc(100vw-2rem)] select-none">
        <div className="flex items-center justify-between gap-1 px-1 pb-2">
          <button type="button" aria-label="Volver al calendario" onClick={() => setMode("days")} className="mini-button">‹</button>
          <span className="text-sm font-semibold text-pine-950">Elegir mes</span>
          <span className="w-9" aria-hidden="true" />
        </div>
        <div className="flex items-center justify-between gap-1 px-1 pb-2">
          <button type="button" aria-label="Año anterior" onClick={() => setView((current) => ({ ...current, year: current.year - 1 }))} className="mini-button">‹</button>
          <span className="text-sm font-semibold tabular-nums text-pine-950">{view.year}</span>
          <button type="button" aria-label="Año siguiente" disabled={yearAtLimit} onClick={() => setView((current) => ({ ...current, year: current.year + 1 }))} className="mini-button">›</button>
        </div>
        <div role="group" aria-label="Meses del año" className="grid grid-cols-3 gap-1 px-1">
          {MONTH_NAMES.map((name, index) => {
            const monthNumber = index + 1;
            const disabled = !allowFuture
              && (view.year > todayParts.year || (view.year === todayParts.year && monthNumber > todayParts.month));
            const active = monthNumber === view.month;
            return (
              <button
                key={name}
                type="button"
                disabled={disabled}
                aria-pressed={active}
                onClick={() => chooseMonth(monthNumber)}
                className={`min-h-11 rounded-lg px-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:text-slate-300 ${
                  active ? "bg-pine-800 font-semibold text-white hover:bg-pine-900" : "text-slate-700 hover:bg-slate-100"
                }`}
              >
                {name}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="w-[19rem] max-w-[calc(100vw-2rem)] select-none">
      <div className="flex items-center justify-between gap-1 px-1 pb-2">
        <button type="button" aria-label="Mes anterior" onClick={() => moveMonth(-1)} className="mini-button">‹</button>
        <button
          type="button"
          aria-haspopup="true"
          onClick={() => setMode("months")}
          className="rounded-lg px-3 py-1.5 text-sm font-semibold text-pine-950 transition-colors hover:bg-slate-100"
        >
          {monthYearLabel(view.year, view.month)}
        </button>
        <button type="button" aria-label="Mes siguiente" disabled={monthAtLimit} onClick={() => moveMonth(1)} className="mini-button">›</button>
      </div>

      <div role="grid" aria-label="Calendario" onKeyDown={handleKeyDown} className="px-1">
        <div role="row" className="grid grid-cols-7 pb-1">
          {WEEKDAY_INITIALS.map((label) => (
            <div key={label} role="columnheader" className="grid h-8 place-items-center text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
          ))}
        </div>
        {rows.map((week) => (
          <div role="row" key={week[0]?.iso ?? "row"} className="grid grid-cols-7 gap-0.5">
            {week.map((cell) => {
              const disabled = isDisabled(cell.iso);
              const selected = cell.iso === value;
              return (
                <div role="gridcell" aria-selected={selected} key={cell.iso} className="flex justify-center">
                  <button
                    type="button"
                    ref={(element) => {
                      if (element) dayRefs.current.set(cell.iso, element);
                      else dayRefs.current.delete(cell.iso);
                    }}
                    tabIndex={cell.iso === focused ? 0 : -1}
                    disabled={disabled}
                    aria-label={capitalize(formatDate(cell.iso, "long"))}
                    aria-current={cell.iso === today ? "date" : undefined}
                    onClick={() => onSelect(cell.iso)}
                    className={dayClasses(cell, selected, today, disabled)}
                  >
                    {cell.day}
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between border-t border-slate-100 px-2 pt-2">
        <button type="button" onClick={() => onSelect(today)} className="rounded-lg px-2 py-1 text-sm font-semibold text-pine-700 transition-colors hover:bg-pine-50">Hoy</button>
        <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800">Cerrar</button>
      </div>
    </div>
  );
}
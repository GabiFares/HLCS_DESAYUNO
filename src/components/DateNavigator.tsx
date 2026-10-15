import { useEffect, useRef, useState } from "react";
import { DateCalendar } from "./DateCalendar";
import { capitalize, formatDate, shiftCalendarDate, todayInUruguay } from "../lib/dates";

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const onChange = () => setMatches(media.matches);
    onChange();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4 shrink-0 text-pine-600">
      <rect x="3" y="4.5" width="14" height="12" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3 8.25h14M7 3v3M13 3v3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function mobileDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return capitalize(new Intl.DateTimeFormat("es-UY", {
    weekday: "short",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day))));
}

export function DateNavigator({ date, onChange, allowFuture = false, compact = false }: {
  date: string;
  onChange: (date: string) => void;
  allowFuture?: boolean;
  compact?: boolean;
}) {
  const today = todayInUruguay();
  const isDesktop = useMediaQuery("(min-width: 640px)");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [open]);

  const full = capitalize(formatDate(date, "long"));
  const mobile = mobileDate(date);

  function select(next: string) {
    onChange(next);
    setOpen(false);
  }

  return (
    <div ref={rootRef} className={`relative ${compact ? "" : "mb-4"}`}>
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => onChange(shiftCalendarDate(date, -1))} aria-label="Día anterior" title="Día anterior" className="date-arrow">‹</button>
        <button
          type="button"
          data-date={date}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={`Elegir fecha: ${full}`}
          onClick={() => setOpen((current) => !current)}
          className={`flex min-h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-lg px-2 text-sm font-semibold text-pine-950 transition-colors hover:bg-slate-100 focus-visible:bg-slate-100 ${compact ? "sm:text-base" : ""}`}
        >
          <CalendarIcon />
          {compact ? <>
            <span className="whitespace-nowrap sm:hidden">{mobile}</span>
            <span className="hidden whitespace-nowrap sm:inline">{full}</span>
          </> : <span className="truncate">{full}</span>}
        </button>
        <button type="button" disabled={!allowFuture && date >= today} onClick={() => onChange(shiftCalendarDate(date, 1))} aria-label="Día siguiente" title="Día siguiente" className="date-arrow">›</button>
      </div>

      {open && isDesktop && (
        <div className="absolute left-1/2 top-full z-40 mt-2 -translate-x-1/2 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl shadow-pine-950/10">
          <DateCalendar value={date} today={today} allowFuture={allowFuture} onSelect={select} onClose={() => setOpen(false)} />
        </div>
      )}

      {open && !isDesktop && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Elegir fecha"
          onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}
          className="fixed inset-x-0 top-0 z-50 flex h-dvh items-end justify-center bg-pine-950/40 backdrop-blur-[2px]"
        >
          <div className="max-h-[calc(100dvh-1rem)] w-full max-w-sm overflow-y-auto overscroll-contain rounded-t-3xl border border-slate-200 bg-white px-2 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 shadow-2xl shadow-pine-950/20 sm:px-4">
            <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-slate-200" aria-hidden="true" />
            <DateCalendar value={date} today={today} allowFuture={allowFuture} onSelect={select} onClose={() => setOpen(false)} />
          </div>
        </div>
      )}
    </div>
  );
}

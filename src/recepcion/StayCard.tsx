import type { Stay } from "../../shared/types";

export type StayStatus = "staying" | "leaving" | "upcoming" | "finalized";

const STATUS: Record<StayStatus, { label: string; className: string }> = {
  staying: { label: "Alojada", className: "bg-emerald-100 text-emerald-800" },
  leaving: { label: "Sale hoy", className: "bg-amber-100 text-amber-800" },
  upcoming: { label: "Próxima", className: "bg-sky-100 text-sky-800" },
  finalized: { label: "Finalizada", className: "bg-slate-100 text-slate-600" },
};

function GuestsIcon({ className = "size-4" }: { className?: string }) {
  return <svg aria-hidden className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM17 11a3 3 0 0 0 0-6M18 15.5c1.3.55 2 1.55 2 3V20" /></svg>;
}

function CalendarIcon({ className = "size-4" }: { className?: string }) {
  return <svg aria-hidden className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M7 3v3M17 3v3M4 9h16M5.5 5h13A1.5 1.5 0 0 1 20 6.5v12a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-12A1.5 1.5 0 0 1 5.5 5Z" /></svg>;
}

function relativeDate(value: string, selectedDate: string): string | null {
  const selected = new Date(`${selectedDate}T12:00:00`);
  const target = new Date(`${value}T12:00:00`);
  const difference = Math.round((target.getTime() - selected.getTime()) / 86_400_000);
  if (difference === 0) return "Hoy";
  if (difference === 1) return "Mañana";
  if (difference === -1) return "Ayer";
  return null;
}

function shortDate(value: string): string {
  const [, month, day] = value.split("-");
  return `${day}/${month}`;
}

function StatusBadge({ status }: { status: StayStatus }) {
  const content = STATUS[status];
  return <span className={`inline-flex min-h-7 items-center rounded-full px-2.5 text-xs font-semibold ${content.className}`}>{content.label}</span>;
}

const actionClass = "inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 text-[13px] font-semibold text-pine-900 shadow-sm transition-colors hover:border-pine-300 hover:bg-pine-50 active:scale-[0.98]";

export function StayCard({ stay, status, selectedDate, onEdit, onComplete }: {
  stay: Stay;
  status: StayStatus;
  selectedDate: string;
  onEdit: () => void;
  onComplete?: () => void;
}) {
  const checkOutRelative = relativeDate(stay.checkOutDate, selectedDate);
  const notes = stay.breakfastNotes?.trim();

  return (
    <article className="group overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-[0_2px_10px_rgba(19,45,32,0.04)] transition-[border-color,box-shadow] hover:border-pine-300 hover:shadow-[0_5px_18px_rgba(19,45,32,0.07)] lg:rounded-none lg:border-x-0 lg:border-b-0 lg:border-t lg:shadow-none lg:first:border-t-0 lg:hover:shadow-none">
      <div className="grid grid-cols-2 gap-x-3 p-3 lg:grid-cols-[minmax(155px,1.15fr)_105px_105px_105px_minmax(150px,1.5fr)_210px] lg:items-center lg:gap-4 lg:px-5 lg:py-3.5">
        <div className="col-span-2 flex min-w-0 flex-wrap items-center justify-between gap-2 lg:col-span-1 lg:justify-start lg:gap-3">
          <h3 className="max-w-full shrink-0 break-all text-[1.55rem] font-bold leading-none tracking-tight tabular-nums text-slate-950 lg:min-w-0 lg:break-normal lg:text-xl">{stay.roomNumber}</h3>
          <StatusBadge status={status} />
        </div>
        <div className="mt-2 flex min-w-0 items-center gap-1.5 text-[13px] text-slate-600 lg:mt-0 lg:text-sm">
          <GuestsIcon className="size-4 shrink-0 text-pine-700" />
          <span><strong className="font-semibold tabular-nums text-slate-800">{stay.guestCount}</strong> {stay.guestCount === 1 ? "pasajero" : "pasajeros"}</span>
        </div>
        <div className="mt-2 flex min-w-0 items-center gap-1.5 text-[13px] text-slate-600 lg:mt-0 lg:block lg:text-sm">
          <CalendarIcon className="size-4 shrink-0 text-pine-700 lg:hidden" />
          <span className="min-w-0"><span className="lg:hidden">Ingreso: </span><strong className="font-semibold tabular-nums text-slate-800 lg:font-medium">{shortDate(stay.checkInDate)}</strong></span>
        </div>
        <div className="col-span-2 mt-1.5 flex items-start gap-1.5 text-[13px] text-slate-600 lg:col-span-1 lg:mt-0 lg:block lg:text-sm">
          <CalendarIcon className="mt-0.5 size-4 shrink-0 text-pine-700 lg:hidden" />
          <span className="lg:block">
            <span className="lg:hidden">Salida: </span>
            <strong className="font-semibold tabular-nums text-slate-800 lg:font-medium">{shortDate(stay.checkOutDate)}</strong>
            {checkOutRelative && <span className="ml-1.5 text-xs text-slate-500 lg:ml-0 lg:mt-0.5 lg:block">{checkOutRelative}</span>}
          </span>
        </div>
        {notes ? <div className="col-span-2 mt-2 min-w-0 rounded-lg bg-slate-50 px-2.5 py-1.5 text-[13px] leading-snug text-slate-600 lg:col-span-1 lg:mt-0 lg:rounded-none lg:bg-transparent lg:p-0">
          <span className="whitespace-pre-wrap break-words">{notes}</span>
        </div> : <div className="hidden min-w-0 text-[13px] text-slate-400 lg:block">Sin observaciones</div>}
        <div className="col-span-2 mt-2 grid grid-cols-2 gap-2 lg:col-span-1 lg:mt-0 lg:flex lg:justify-end">
          <button type="button" onClick={onEdit} aria-label={`Editar habitación ${stay.roomNumber}`} className={actionClass}>
            <svg aria-hidden className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
            Editar
          </button>
          {onComplete ? (
            <button type="button" onClick={onComplete} aria-label={`Finalizar habitación ${stay.roomNumber}`} className={actionClass}>
              <svg aria-hidden className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 4 4L19 6" /></svg>
              Check-out
            </button>
          ) : <span aria-hidden />}
        </div>
      </div>
    </article>
  );
}

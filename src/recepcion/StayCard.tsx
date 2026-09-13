import type { Stay } from "../../shared/types";
import { ExpandableNote } from "../components/ExpandableNote";
import { formatDate } from "../lib/dates";

export function StayCard({ stay, today, onEdit, onComplete }: {
  stay: Stay;
  today: string;
  onEdit: () => void;
  onComplete?: () => void;
}) {
  const checkoutToday = stay.checkOutDate === today;
  return (
    <article className="rounded-xl border border-slate-200 bg-white px-4 py-3 transition-colors hover:border-pine-300">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="meta-label">Habitación</p>
          <div className="mt-0.5 flex items-center gap-2.5">
            <h3 className="truncate text-[1.5rem] font-bold leading-tight tracking-tight tabular-nums text-pine-950">{stay.roomNumber}</h3>
            {checkoutToday && <span className="shrink-0 rounded-md bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">Sale hoy</span>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button type="button" onClick={onEdit} className="btn-secondary min-h-9 px-3">Editar</button>
          {onComplete && <button type="button" onClick={onComplete} className="btn-ghost min-h-9 text-sm text-slate-500 hover:bg-pine-50 hover:text-pine-800">Finalizar</button>}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-100 pt-2">
        <span className="flex items-center gap-1.5">
          <svg aria-hidden className="size-3.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 7V3m8 4V3M3 9h18M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" /></svg>
          <span className="text-sm text-slate-600">Check-out <strong className="font-semibold text-slate-800">{formatDate(stay.checkOutDate)}</strong></span>
        </span>
        <span className="flex items-center gap-1.5">
          <svg aria-hidden className="size-3.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M13 11a4 4 0 1 0-4-4 4 4 0 0 0 4 4ZM21 21v-2a4 4 0 0 0-3-3.87" /></svg>
          <span className="text-sm text-slate-600"><strong className="font-semibold text-slate-800">{stay.guestCount}</strong> {stay.guestCount === 1 ? "pasajero" : "pasajeros"}</span>
        </span>
      </div>

      {stay.breakfastNotes && (
        <div className="mt-2 border-t border-slate-100 pt-2">
          <ExpandableNote note={stay.breakfastNotes} />
        </div>
      )}
    </article>
  );
}
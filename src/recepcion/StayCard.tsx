import type { Stay } from "../../shared/types";
import { ExpandableNote } from "../components/ExpandableNote";
import { formatDate } from "../lib/dates";

const iconButton = "grid size-9 shrink-0 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 transition-colors hover:border-pine-300 hover:bg-pine-50 hover:text-pine-800 active:scale-[0.96]";

export function StayCard({ stay, onEdit, onComplete }: {
  stay: Stay;
  onEdit: () => void;
  onComplete?: () => void;
}) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white transition-colors hover:border-pine-300">
      <div className="flex items-center gap-3 px-3.5 py-1.5">
        <h3 className="shrink-0 text-xl font-bold leading-6 tracking-tight tabular-nums text-pine-950">{stay.roomNumber}</h3>
        <p className="min-w-0 flex-1 truncate text-[13px] text-slate-500">
          <svg aria-hidden className="mr-1 inline size-3.5 -translate-y-px text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 7V3m8 4V3M3 9h18M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" /></svg>
          Check-out <strong className="font-semibold text-slate-700 tabular-nums">{formatDate(stay.checkOutDate)}</strong>
          {" · "}
          <strong className="font-semibold text-slate-700 tabular-nums">{stay.guestCount}</strong> {stay.guestCount === 1 ? "pasajero" : "pasajeros"}
        </p>
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" onClick={onEdit} aria-label={`Editar habitación ${stay.roomNumber}`} title="Editar" className={iconButton}>
            <svg aria-hidden className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
          </button>
          {onComplete && (
            <button type="button" onClick={onComplete} aria-label={`Finalizar habitación ${stay.roomNumber}`} title="Finalizar" className={iconButton}>
              <svg aria-hidden className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4m7 14 5-5-5-5m5 5H9" /></svg>
            </button>
          )}
        </div>
      </div>
      {stay.breakfastNotes && (
        <div className="border-t border-slate-100 px-3.5 py-1.5">
          <ExpandableNote note={stay.breakfastNotes} />
        </div>
      )}
    </article>
  );
}
import { useMemo, useState } from "react";
import type { BreakfastDay, BreakfastStay } from "../../shared/types";
import { EmptyState } from "../components/Feedback";
import { formatDate, todayInUruguay } from "../lib/dates";

type Filter = "all" | "pending" | "complete";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Todas" },
  { id: "pending", label: "Pendientes" },
  { id: "complete", label: "Completas" },
];

function roomKey(stay: BreakfastStay): [number, string] {
  const parsed = Number.parseInt(stay.roomNumber, 10);
  return [Number.isFinite(parsed) ? parsed : 0, stay.roomNumber.toLowerCase()];
}

const byRoom = (a: BreakfastStay, b: BreakfastStay) => {
  const [ai, as] = roomKey(a);
  const [bi, bs] = roomKey(b);
  return ai - bi || as.localeCompare(bs);
};

function RoomRow({ stay, isFuture, saving, onCount }: {
  stay: BreakfastStay;
  isFuture: boolean;
  saving: boolean;
  onCount: (stayId: number, nextCount: number) => void;
}) {
  const complete = stay.servedCount === stay.guestCount;
  return (
    <article className="flex items-center gap-4 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-[15px] font-bold tracking-tight text-pine-950">Habitación {stay.roomNumber}</h3>
          {complete
            ? <span className="rounded bg-pine-50 px-1.5 py-0.5 text-[11px] font-semibold text-pine-700">Completo</span>
            : <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700">Pendiente</span>}
          {saving && <span className="text-[11px] text-slate-400">Guardando…</span>}
        </div>
        <p className="mt-0.5 text-xs text-slate-500">Check-out {formatDate(stay.checkOutDate)}</p>
        {stay.breakfastNotes && (
          <p className="mt-1 flex items-start gap-1.5 text-[13px] text-slate-600">
            <svg aria-hidden className="mt-0.5 size-3.5 shrink-0 text-pine-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>
            <span className="line-clamp-2">{stay.breakfastNotes}</span>
          </p>
        )}
      </div>

      <div className="shrink-0 text-right">
        <p className="text-lg font-bold leading-none tabular-nums text-pine-950">
          <span className={complete ? "text-pine-700" : "text-pine-950"}>{stay.servedCount}</span>
          <span className="mx-0.5 font-normal text-slate-300">/</span>
          <span className="text-slate-400">{stay.guestCount}</span>
        </p>
        <p className="mt-1 text-[10px] uppercase tracking-wide text-slate-400">pasajeros</p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <button type="button" disabled={isFuture || stay.servedCount === 0} onClick={() => onCount(stay.stayId, stay.servedCount - 1)} aria-label={`Restar desayuno a habitación ${stay.roomNumber}`} className="counter-button">−</button>
        <button type="button" disabled={isFuture || stay.servedCount === stay.guestCount} onClick={() => onCount(stay.stayId, stay.servedCount + 1)} aria-label={`Sumar desayuno a habitación ${stay.roomNumber}`} className="counter-button counter-button-add">＋</button>
      </div>
    </article>
  );
}

function GroupHeading({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center gap-3 px-4 pb-1 pt-3">
      <h2 className="group-label">{label}</h2>
      <span className="h-px flex-1 bg-slate-100" aria-hidden />
      <span className="text-xs font-medium tabular-nums text-slate-400">{count}</span>
    </div>
  );
}

export function RoomsPanel({ day, savingIds, onCount }: {
  day: BreakfastDay;
  savingIds: ReadonlySet<number>;
  onCount: (stayId: number, nextCount: number) => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const isFuture = day.date > todayInUruguay();

  const pending = useMemo(() => {
    const q = query.trim().toLowerCase();
    return day.stays
      .filter((stay) => stay.servedCount < stay.guestCount)
      .filter((stay) => !q || stay.roomNumber.toLowerCase().includes(q))
      .sort(byRoom);
  }, [day.stays, query]);

  const complete = useMemo(() => {
    const q = query.trim().toLowerCase();
    return day.stays
      .filter((stay) => stay.servedCount === stay.guestCount)
      .filter((stay) => !q || stay.roomNumber.toLowerCase().includes(q))
      .sort(byRoom);
  }, [day.stays, query]);

  const hasQuery = query.trim().length > 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="relative block min-w-0 flex-1">
          <span className="sr-only">Buscar habitación</span>
          <svg aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m21 21-4.3-4.3M17 11a6 6 0 1 1-12 0 6 6 0 0 1 12 0Z" /></svg>
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar habitación…" className="field pl-9" />
        </label>

        <div role="group" aria-label="Filtrar habitaciones" className="flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white p-0.5">
          {FILTERS.map((option) => {
            const count = option.id === "pending" ? pending.length : option.id === "complete" ? complete.length : day.stays.length;
            const active = filter === option.id;
            return (
              <button key={option.id} type="button" onClick={() => setFilter(option.id)} aria-pressed={active}
                className={`segment-btn ${active ? "segment-btn-active" : ""}`}>
                {option.label}
                <span className="text-xs tabular-nums text-slate-400">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {day.date === todayInUruguay() && hasQuery && (
        <p className="text-xs text-slate-400">
          {pending.length + complete.length} {pending.length + complete.length === 1 ? "habitación coincide" : "habitaciones coinciden"} con tu búsqueda.
        </p>
      )}

      {day.stays.length === 0 ? (
        <EmptyState title="No hay habitaciones para esta fecha" detail="La recepción todavía no cargó estadías activas." />
      ) : pending.length === 0 && filter === "pending" ? (
        <EmptyState title="No hay habitaciones pendientes" detail="Todas las habitaciones están resueltas." />
      ) : complete.length === 0 && filter === "complete" ? (
        <EmptyState title="No hay habitaciones completas" detail="Todavía no se cargó ningún desayuno." />
      ) : pending.length === 0 && complete.length === 0 ? (
        <EmptyState title="No se encontraron habitaciones" detail={`No hay habitaciones que coincidan con "${query.trim()}".`} />
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white">
          {filter === "complete" ? (
            <>
              <GroupHeading label="Completas" count={complete.length} />
              <div className="divide-y divide-slate-100">
                {complete.map((stay) => (
                  <RoomRow key={stay.stayId} stay={stay} isFuture={isFuture} saving={savingIds.has(stay.stayId)} onCount={onCount} />
                ))}
              </div>
            </>
          ) : filter === "pending" ? (
            <>
              <GroupHeading label="Pendientes" count={pending.length} />
              <div className="divide-y divide-slate-100">
                {pending.map((stay) => (
                  <RoomRow key={stay.stayId} stay={stay} isFuture={isFuture} saving={savingIds.has(stay.stayId)} onCount={onCount} />
                ))}
              </div>
            </>
          ) : (
            <>
              {pending.length > 0 && (
                <section aria-label="Habitaciones pendientes">
                  <GroupHeading label="Pendientes" count={pending.length} />
                  <div className="divide-y divide-slate-100">
                    {pending.map((stay) => (
                      <RoomRow key={stay.stayId} stay={stay} isFuture={isFuture} saving={savingIds.has(stay.stayId)} onCount={onCount} />
                    ))}
                  </div>
                </section>
              )}
              {complete.length > 0 && (
                <details className="group border-t border-slate-100">
                  <summary className="flex list-none cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-50">
                    <h2 className="group-label">Completas</h2>
                    <span className="text-xs font-medium tabular-nums text-slate-400">{complete.length}</span>
                    <span className="ml-auto text-sm text-slate-400 transition-transform group-open:rotate-90" aria-hidden>›</span>
                  </summary>
                  <div className="divide-y divide-slate-100">
                    {complete.map((stay) => (
                      <RoomRow key={stay.stayId} stay={stay} isFuture={isFuture} saving={savingIds.has(stay.stayId)} onCount={onCount} />
                    ))}
                  </div>
                </details>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
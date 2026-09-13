import { useMemo, useState } from "react";
import type { BreakfastDay, BreakfastStay } from "../../shared/types";
import { EmptyState } from "../components/Feedback";
import { ExpandableNote } from "../components/ExpandableNote";
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
    <article className="flex items-center gap-3 px-4 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-[15px] font-semibold tracking-tight text-pine-900">
            Habitación <span className="tabular-nums">{stay.roomNumber}</span>
          </h3>
          {complete
            ? <span className="shrink-0 rounded-md bg-pine-50 px-1.5 py-0.5 text-[11px] font-semibold text-pine-700">Completo</span>
            : <span className="shrink-0 rounded-md bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700">Pendiente</span>}
          {saving && <span className="shrink-0 text-[11px] text-slate-400">Guardando…</span>}
        </div>
        <p className="mt-0.5 text-xs text-slate-500">Check-out {formatDate(stay.checkOutDate)}</p>
        {stay.breakfastNotes && <ExpandableNote note={stay.breakfastNotes} />}
      </div>

      <div className="shrink-0 text-right">
        <p className="flex items-baseline justify-end leading-none tabular-nums">
          <span className={`text-[1.35rem] font-bold ${complete ? "text-pine-700" : "text-pine-900"}`}>{stay.servedCount}</span>
          <span className="mx-1 text-sm font-normal text-slate-300">/</span>
          <span className="text-[15px] font-semibold text-slate-400">{stay.guestCount}</span>
        </p>
        <p className="mt-1 text-[10px] uppercase tracking-wide text-slate-400">pasajeros</p>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <button type="button" disabled={isFuture || stay.servedCount === 0} onClick={() => onCount(stay.stayId, stay.servedCount - 1)} aria-label={`Restar desayuno a habitación ${stay.roomNumber}`} className="counter-button">−</button>
        <button type="button" disabled={isFuture || stay.servedCount === stay.guestCount} onClick={() => onCount(stay.stayId, stay.servedCount + 1)} aria-label={`Sumar desayuno a habitación ${stay.roomNumber}`} className="counter-button counter-button-add">＋</button>
      </div>
    </article>
  );
}

function GroupHeading({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center gap-3 px-4 pb-0.5 pt-2">
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
      <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-2 sm:flex-row sm:items-center sm:gap-1.5 sm:ps-3.5 focus-within:border-pine-600 focus-within:ring-2 focus-within:ring-pine-600/15">
        <label className="relative block min-w-0 flex-1">
          <span className="sr-only">Buscar habitación</span>
          <svg aria-hidden className="pointer-events-none absolute left-0.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m21 21-4.3-4.3M17 11a6 6 0 1 1-12 0 6 6 0 0 1 12 0Z" /></svg>
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar habitación…"
            className="w-full appearance-none border-0 bg-transparent py-1 pe-1 ps-6 text-[15px] text-pine-950 placeholder:text-slate-400 focus:outline-none" />
        </label>

        <div role="group" aria-label="Filtrar habitaciones" className="flex w-full shrink-0 items-center gap-1 rounded-lg bg-slate-100 p-1 sm:w-auto">
          {FILTERS.map((option) => {
            const count = option.id === "pending" ? pending.length : option.id === "complete" ? complete.length : day.stays.length;
            const active = filter === option.id;
            return (
              <button key={option.id} type="button" onClick={() => setFilter(option.id)} aria-pressed={active}
                className={`segment-btn flex-1 justify-center sm:flex-initial ${active ? "segment-btn-active" : ""}`}>
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
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
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
                  <summary className="flex list-none cursor-pointer items-center gap-3 px-4 py-2 transition-colors hover:bg-slate-50">
                    <h2 className="group-label">Completas</h2>
                    <span className="text-xs font-medium tabular-nums text-slate-400">{complete.length}</span>
                    <span className="ml-auto grid size-6 place-items-center rounded-full text-sm leading-none text-slate-400 transition-transform group-open:rotate-90" aria-hidden>›</span>
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
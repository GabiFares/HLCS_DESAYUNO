import { useMemo, useState } from "react";
import type { BreakfastDay, BreakfastStay } from "../../shared/types";
import { EmptyState } from "../components/Feedback";
import { ExpandableNote } from "../components/ExpandableNote";
import { formatDate, shiftCalendarDate, todayInUruguay } from "../lib/dates";

type Filter = "all" | "unregistered" | "inProgress" | "complete";
type RoomStatus = "unregistered" | "inProgress" | "complete";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Todas" },
  { id: "unregistered", label: "Sin registrar" },
  { id: "inProgress", label: "En proceso" },
  { id: "complete", label: "Completas" },
];

function statusOf(stay: BreakfastStay): RoomStatus {
  if (stay.servedCount >= stay.guestCount) return "complete";
  if (stay.servedCount === 0) return "unregistered";
  return "inProgress";
}

const STATUS_META: Record<"unregistered" | "inProgress" | "complete", { label: string; badge: string }> = {
  unregistered: { label: "Sin registrar", badge: "rounded-md bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700" },
  inProgress: { label: "En proceso", badge: "rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600" },
  complete: { label: "Completa", badge: "rounded-md bg-pine-50 px-1.5 py-0.5 text-[11px] font-semibold text-pine-700" },
};

function roomKey(stay: BreakfastStay): [number, string] {
  const parsed = Number.parseInt(stay.roomNumber, 10);
  return [Number.isFinite(parsed) ? parsed : 0, stay.roomNumber.toLowerCase()];
}

const byRoom = (a: BreakfastStay, b: BreakfastStay) => {
  const [ai, as] = roomKey(a);
  const [bi, bs] = roomKey(b);
  return ai - bi || as.localeCompare(bs);
};

function checkoutLabel(stay: BreakfastStay, dayDate: string): string {
  const short = formatDate(stay.checkOutDate, "short").slice(0, 5);
  if (stay.checkOutDate === dayDate) return `Salida: hoy, ${short}`;
  if (stay.checkOutDate === shiftCalendarDate(dayDate, 1)) return `Salida: mañana, ${short}`;
  return `Salida: ${formatDate(stay.checkOutDate, "short")}`;
}

function RoomRow({ stay, dayDate, isFuture, saving, onCount }: {
  stay: BreakfastStay;
  dayDate: string;
  isFuture: boolean;
  saving: boolean;
  onCount: (stayId: number, nextCount: number) => void;
}) {
  const status = statusOf(stay);
  const meta = STATUS_META[status];
  return (
    <article className="flex items-start gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="truncate text-[15px] font-semibold tracking-tight text-pine-900">
            Habitación <span className="tabular-nums">{stay.roomNumber}</span>
          </h3>
          <span className={`shrink-0 ${meta.badge}`}>{meta.label}</span>
          {saving && <span className="shrink-0 text-[11px] text-slate-400">Guardando…</span>}
        </div>
        <p className="mt-1 text-[13px] text-slate-500">{checkoutLabel(stay, dayDate)}</p>
        <p className="mt-0.5 text-[13px] font-medium text-slate-600 tabular-nums">
          {stay.servedCount} de {stay.guestCount} desayunos registrados
        </p>
        {stay.breakfastNotes && <ExpandableNote note={stay.breakfastNotes} />}
      </div>

      <div className="flex shrink-0 items-start gap-1.5 pt-1">
        <button type="button" disabled={isFuture || stay.servedCount === 0} onClick={() => onCount(stay.stayId, stay.servedCount - 1)}
          aria-label={`Restar desayuno a habitación ${stay.roomNumber}`} title={`Restar desayuno a habitación ${stay.roomNumber}`}
          className="counter-button">−</button>
        <button type="button" disabled={isFuture || stay.servedCount === stay.guestCount} onClick={() => onCount(stay.stayId, stay.servedCount + 1)}
          aria-label={`Sumar desayuno a habitación ${stay.roomNumber}`} title={`Sumar desayuno a habitación ${stay.roomNumber}`}
          className="counter-button counter-button-add">＋</button>
      </div>
    </article>
  );
}

function GroupHeading({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center gap-3 px-4 pb-0.5 pt-2.5">
      <h2 className="group-label">{label}</h2>
      <span className="h-px flex-1 bg-slate-100" aria-hidden />
      <span className="text-xs font-medium tabular-nums text-slate-400">{count}</span>
    </div>
  );
}

const EMPTY_TEXT: Record<"unregistered" | "inProgress" | "complete", { title: string; detail: string }> = {
  unregistered: { title: "No hay habitaciones sin registrar", detail: "Todas las habitaciones ya tienen desayunos cargados." },
  inProgress: { title: "No hay habitaciones en proceso", detail: "Las habitaciones están sin registrar o ya están completas." },
  complete: { title: "No hay habitaciones completas", detail: "Todavía no se completó ningún desayuno." },
};

export function RoomsPanel({ day, savingIds, onCount }: {
  day: BreakfastDay;
  savingIds: ReadonlySet<number>;
  onCount: (stayId: number, nextCount: number) => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const isFuture = day.date > todayInUruguay();

  const lists = useMemo(() => {
    const q = query.trim().toLowerCase();
    const byQuery = (stay: BreakfastStay) => !q || stay.roomNumber.toLowerCase().includes(q);
    return {
      unregistered: day.stays.filter((stay) => statusOf(stay) === "unregistered" && byQuery(stay)).sort(byRoom),
      inProgress: day.stays.filter((stay) => statusOf(stay) === "inProgress" && byQuery(stay)).sort(byRoom),
      complete: day.stays.filter((stay) => statusOf(stay) === "complete" && byQuery(stay)).sort(byRoom),
      hasQuery: q.length > 0,
    };
  }, [day.stays, query]);

  const total = lists.unregistered.length + lists.inProgress.length + lists.complete.length;
  const countFor = (id: Filter): number => id === "unregistered" ? lists.unregistered.length
    : id === "inProgress" ? lists.inProgress.length
      : id === "complete" ? lists.complete.length : total;

  const renderGroup = (status: "unregistered" | "inProgress" | "complete") => {
    const items = lists[status];
    if (items.length === 0) return null;
    return (
      <section aria-label={STATUS_META[status].label}>
        <GroupHeading label={STATUS_META[status].label} count={items.length} />
        <div className="divide-y divide-slate-100">
          {items.map((stay) => (
            <RoomRow key={stay.stayId} stay={stay} dayDate={day.date} isFuture={isFuture}
              saving={savingIds.has(stay.stayId)} onCount={onCount} />
          ))}
        </div>
      </section>
    );
  };

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

        <div role="group" aria-label="Filtrar habitaciones" className="flex w-full flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1 sm:w-auto">
          {FILTERS.map((option) => {
            const active = filter === option.id;
            return (
              <button key={option.id} type="button" onClick={() => setFilter(option.id)} aria-pressed={active}
                className={`segment-btn flex-1 justify-center sm:flex-initial ${active ? "segment-btn-active" : ""}`}>
                {option.label}
                <span className="text-xs tabular-nums text-slate-400">{countFor(option.id)}</span>
              </button>
            );
          })}
        </div>
      </div>

      {day.date === todayInUruguay() && lists.hasQuery && (
        <p className="text-xs text-slate-400">
          {total} {total === 1 ? "habitación coincide" : "habitaciones coinciden"} con tu búsqueda.
        </p>
      )}

      {day.stays.length === 0 ? (
        <EmptyState title="No hay habitaciones con desayuno para esta fecha"
          detail="Cuando Recepción registre una estadía para este día, aparecerá aquí automáticamente." />
      ) : lists.hasQuery && total === 0 ? (
        <EmptyState title="No se encontraron habitaciones" detail={`No hay habitaciones que coincidan con "${query.trim()}".`} />
      ) : filter === "unregistered" && lists.unregistered.length === 0 ? (
        <EmptyState title={EMPTY_TEXT.unregistered.title} detail={EMPTY_TEXT.unregistered.detail} />
      ) : filter === "inProgress" && lists.inProgress.length === 0 ? (
        <EmptyState title={EMPTY_TEXT.inProgress.title} detail={EMPTY_TEXT.inProgress.detail} />
      ) : filter === "complete" && lists.complete.length === 0 ? (
        <EmptyState title={EMPTY_TEXT.complete.title} detail={EMPTY_TEXT.complete.detail} />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          {filter === "unregistered" ? (
            renderGroup("unregistered")
          ) : filter === "inProgress" ? (
            renderGroup("inProgress")
          ) : filter === "complete" ? (
            renderGroup("complete")
          ) : (
            <>
              {renderGroup("unregistered")}
              {renderGroup("inProgress")}
              {lists.complete.length > 0 && (
                <details className="group border-t border-slate-100">
                  <summary className="flex list-none cursor-pointer items-center gap-3 px-4 py-2.5 transition-colors hover:bg-slate-50">
                    <h2 className="group-label">Completas</h2>
                    <span className="text-xs font-medium tabular-nums text-slate-400">{lists.complete.length}</span>
                    <span className="ml-auto grid size-6 place-items-center rounded-full text-sm leading-none text-slate-400 transition-transform group-open:rotate-90" aria-hidden>›</span>
                  </summary>
                  <div className="divide-y divide-slate-100">
                    {lists.complete.map((stay) => (
                      <RoomRow key={stay.stayId} stay={stay} dayDate={day.date} isFuture={isFuture}
                        saving={savingIds.has(stay.stayId)} onCount={onCount} />
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
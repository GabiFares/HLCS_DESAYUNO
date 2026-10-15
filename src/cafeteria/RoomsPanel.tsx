import { useMemo, useState } from "react";
import type { BreakfastDay, BreakfastStay } from "../../shared/types";
import { EmptyState } from "../components/Feedback";
import { todayInUruguay } from "../lib/dates";

export type BreakfastRoomFilter = "all" | "pending" | "partial" | "complete";
type RoomStatus = "pending" | "partial" | "complete";

const FILTERS: { id: BreakfastRoomFilter; label: string }[] = [
  { id: "all", label: "Todas" },
  { id: "pending", label: "Pendientes" },
  { id: "partial", label: "Parciales" },
  { id: "complete", label: "Completas" },
];

function statusOf(stay: BreakfastStay): RoomStatus {
  if (stay.servedCount >= stay.guestCount) return "complete";
  if (stay.servedCount === 0) return "pending";
  return "partial";
}

const STATUS_META: Record<RoomStatus, { label: string; badge: string }> = {
  pending: { label: "Pendiente", badge: "border-orange-100 bg-orange-50 text-orange-700" },
  partial: { label: "Parcial", badge: "border-amber-100 bg-amber-50 text-amber-700" },
  complete: { label: "Completa", badge: "border-emerald-100 bg-emerald-50 text-emerald-700" },
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

function BreakfastCounter({ stay, canEdit, saving, onCount }: {
  stay: BreakfastStay;
  canEdit: boolean;
  saving: boolean;
  onCount: (stayId: number, nextCount: number) => void;
}) {
  return (
    <div className="flex min-w-[132px] items-center overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm sm:min-w-[148px]" aria-label={`Control de desayuno para habitación ${stay.roomNumber}`}>
      <button type="button" disabled={!canEdit || stay.servedCount === 0} onClick={() => onCount(stay.stayId, stay.servedCount - 1)}
        aria-label={`Restar desayuno a habitación ${stay.roomNumber}`} title={`Restar desayuno a habitación ${stay.roomNumber}`}
        className="grid min-h-11 w-11 shrink-0 place-items-center bg-slate-50 text-xl font-medium leading-none text-slate-600 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-300">−</button>
      <output aria-live="polite" className="relative grid min-h-11 min-w-12 flex-1 place-items-center border-x border-slate-200 text-sm font-bold tabular-nums text-slate-950">
        {stay.servedCount}
        {saving && <span className="absolute right-1 top-1 size-2 animate-pulse rounded-full bg-[#087447]" aria-label="Guardando" />}
      </output>
      <button type="button" disabled={!canEdit || stay.servedCount === stay.guestCount} onClick={() => onCount(stay.stayId, stay.servedCount + 1)}
        aria-label={`Sumar desayuno a habitación ${stay.roomNumber}`} title={`Sumar desayuno a habitación ${stay.roomNumber}`}
        className="grid min-h-11 w-11 shrink-0 place-items-center bg-[#087447] text-xl font-medium leading-none text-white transition-colors hover:bg-[#075f3c] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400">+</button>
    </div>
  );
}

function RoomRow({ stay, canEdit, saving, onCount }: {
  stay: BreakfastStay;
  canEdit: boolean;
  saving: boolean;
  onCount: (stayId: number, nextCount: number) => void;
}) {
  const status = statusOf(stay);
  const meta = STATUS_META[status];
  return (
    <article className={`rounded-xl border p-3 shadow-[0_2px_10px_rgba(22,50,37,0.035)] lg:grid lg:grid-cols-[minmax(140px,1.15fr)_125px_105px_130px_170px] lg:items-center lg:gap-4 lg:rounded-none lg:border-0 lg:border-b lg:border-slate-100 lg:bg-white lg:px-5 lg:py-2.5 lg:shadow-none last:lg:border-b-0 ${status === "complete" ? "border-emerald-100 bg-emerald-50/45" : "border-slate-200 bg-white"}`}>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 lg:hidden">
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
            <h3 className="min-w-0 break-words text-[17px] font-bold leading-tight tracking-[-0.02em] text-slate-950">{stay.roomNumber}</h3>
            <span className={`shrink-0 rounded-lg border px-1.5 py-1 text-[11px] font-semibold ${meta.badge}`}>{meta.label}</span>
          </div>
          <p className="mt-1 text-sm font-medium tabular-nums text-slate-700">{stay.guestCount} {stay.guestCount === 1 ? "pasajero" : "pasajeros"}</p>
          <p className="mt-0.5 text-[13px] tabular-nums text-slate-500">Registrados: {stay.servedCount} de {stay.guestCount}</p>
        </div>
        <BreakfastCounter stay={stay} canEdit={canEdit} saving={saving} onCount={onCount} />
      </div>

      <div className="hidden min-w-0 lg:block"><h3 className="break-words text-base font-bold leading-tight text-slate-950">{stay.roomNumber}</h3></div>
      <div className="hidden lg:block"><span className={`inline-flex rounded-lg border px-2 py-1 text-xs font-semibold ${meta.badge}`}>{meta.label}</span></div>
      <div className="hidden text-sm font-medium tabular-nums text-slate-800 lg:block">{stay.guestCount}</div>
      <div className="hidden text-sm font-medium tabular-nums text-slate-800 lg:block">{stay.servedCount} de {stay.guestCount}</div>
      <div className="hidden justify-end lg:flex">
        <BreakfastCounter stay={stay} canEdit={canEdit} saving={saving} onCount={onCount} />
      </div>
    </article>
  );
}

const EMPTY_TEXT: Record<"pending" | "partial" | "complete", { title: string; detail: string }> = {
  pending: { title: "No hay desayunos pendientes", detail: "Todos los desayunos previstos para estas habitaciones ya están registrados." },
  partial: { title: "No hay desayunos parcialmente registrados", detail: "Los desayunos están sin registrar o ya fueron completados." },
  complete: { title: "No hay desayunos completos", detail: "Todavía no se completó el registro de ningún desayuno." },
};

export function RoomsPanel({ day, filter, onFilterChange, savingIds, onCount }: {
  day: BreakfastDay;
  filter: BreakfastRoomFilter;
  onFilterChange: (filter: BreakfastRoomFilter) => void;
  savingIds: ReadonlySet<number>;
  onCount: (stayId: number, nextCount: number) => void;
}) {
  const [query, setQuery] = useState("");
  const canEdit = day.date === todayInUruguay();

  const lists = useMemo(() => {
    const q = query.trim().toLowerCase();
    const byQuery = (stay: BreakfastStay) => !q || stay.roomNumber.toLowerCase().includes(q);
    const all = day.stays.filter(byQuery).sort(byRoom);
    return {
      all,
      pending: all.filter((stay) => stay.servedCount < stay.guestCount),
      partial: all.filter((stay) => statusOf(stay) === "partial"),
      complete: all.filter((stay) => statusOf(stay) === "complete"),
      hasQuery: q.length > 0,
    };
  }, [day.stays, query]);

  const total = lists.all.length;
  const countFor = (id: BreakfastRoomFilter): number => lists[id].length;
  const visible = lists[filter];
  const activeFilter = FILTERS.find((option) => option.id === filter)!;
  const pendingBreakfasts = visible.reduce((totalCount, stay) => totalCount + Math.max(0, stay.guestCount - stay.servedCount), 0);

  return (
    <div className="space-y-3">
      <div className="grid gap-2 lg:grid-cols-[minmax(250px,1fr)_auto] lg:items-center">
        <label className="relative block min-w-0 flex-1">
          <span className="sr-only">Buscar habitación</span>
          <svg aria-hidden className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m21 21-4.3-4.3M17 11a6 6 0 1 1-12 0 6 6 0 0 1 12 0Z" /></svg>
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar habitación…"
            className="min-h-12 w-full appearance-none rounded-xl border border-slate-200 bg-white pe-4 ps-12 text-[15px] text-slate-950 shadow-[0_2px_10px_rgba(22,50,37,0.035)] placeholder:text-slate-400 focus:border-pine-600 focus:ring-2 focus:ring-pine-600/15 focus:outline-none" />
        </label>

        <div className="sm:hidden">
          <label className="relative mx-auto block w-full max-w-xs">
            <span className="sr-only">Filtrar desayunos</span>
            <span aria-hidden className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#e9f0eb] px-3.5 text-center text-sm text-pine-800">
              <span>Filtrar:</span>
              <strong className="font-semibold">{activeFilter.label}</strong>
              <svg className="size-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m7 10 5 5 5-5" /></svg>
            </span>
            <select value={filter} onChange={(event) => onFilterChange(event.target.value as BreakfastRoomFilter)} aria-label="Filtrar desayunos" className="absolute inset-0 h-full w-full cursor-pointer opacity-0">
              {FILTERS.map((option) => <option key={option.id} value={option.id}>{option.label} · {countFor(option.id)}</option>)}
            </select>
          </label>
          <p className="mt-1.5 text-center text-xs font-medium tabular-nums text-slate-500">
            {filter === "pending" ? `${pendingBreakfasts} ${pendingBreakfasts === 1 ? "desayuno pendiente" : "desayunos pendientes"}` : `${visible.length} ${visible.length === 1 ? "habitación" : "habitaciones"}`}
          </p>
        </div>

        <div role="group" aria-label="Filtrar desayunos" className="hidden gap-1.5 sm:flex">
          {FILTERS.map((option) => {
            const active = filter === option.id;
            return (
              <button key={option.id} type="button" onClick={() => onFilterChange(option.id)} aria-pressed={active}
                className={`flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold transition-colors lg:min-w-[108px] ${active ? "bg-[#087447] text-white shadow-[0_4px_12px_rgba(8,116,71,0.16)]" : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}>
                {option.label}
                <span className={`grid min-w-6 place-items-center rounded-full px-1.5 py-0.5 text-xs tabular-nums ${active ? "bg-white text-pine-800" : "bg-slate-100 text-slate-600"}`}>{countFor(option.id)}</span>
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
      ) : filter === "pending" && lists.pending.length === 0 ? (
        <EmptyState title={EMPTY_TEXT.pending.title} detail={EMPTY_TEXT.pending.detail} />
      ) : filter === "partial" && lists.partial.length === 0 ? (
        <EmptyState title={EMPTY_TEXT.partial.title} detail={EMPTY_TEXT.partial.detail} />
      ) : filter === "complete" && lists.complete.length === 0 ? (
        <EmptyState title={EMPTY_TEXT.complete.title} detail={EMPTY_TEXT.complete.detail} />
      ) : (
        <div>
          <div className="hidden grid-cols-[minmax(140px,1.15fr)_125px_105px_130px_170px] gap-4 rounded-t-2xl border border-b-0 border-slate-200 bg-[#f1f5f2] px-5 py-2.5 text-xs font-semibold text-slate-500 lg:grid">
            <span>Habitación</span><span>Estado</span><span>Pasajeros</span><span>Registrados</span><span className="text-center">Desayuno</span>
          </div>
          <div className="space-y-2 lg:space-y-0 lg:overflow-hidden lg:rounded-b-2xl lg:border lg:border-slate-200 lg:bg-white">
            {visible.map((stay) => (
              <RoomRow key={stay.stayId} stay={stay} canEdit={canEdit} saving={savingIds.has(stay.stayId)} onCount={onCount} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

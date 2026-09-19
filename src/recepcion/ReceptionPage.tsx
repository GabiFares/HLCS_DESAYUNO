import { useEffect, useMemo, useState } from "react";
import type { Stay } from "../../shared/types";
import { DateNavigator } from "../components/DateNavigator";
import { EmptyState, ErrorBanner, LoadingBlock } from "../components/Feedback";
import { PageHeader } from "../components/PageHeader";
import { api, errorMessage } from "../lib/api";
import { todayInUruguay } from "../lib/dates";
import { StayCard } from "./StayCard";
import { StayForm } from "./StayForm";

type Filter = "all" | "staying" | "upcoming" | "finalized";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Todas" },
  { id: "staying", label: "Alojados" },
  { id: "upcoming", label: "Próximas" },
  { id: "finalized", label: "Finalizadas" },
];

function roomKey(roomNumber: string): [number, string] {
  const parsed = Number.parseInt(roomNumber, 10);
  return [Number.isFinite(parsed) ? parsed : 0, roomNumber.toLowerCase()];
}

const byRoom = (a: Stay, b: Stay) => {
  const [ai, as] = roomKey(a.roomNumber);
  const [bi, bs] = roomKey(b.roomNumber);
  return ai - bi || as.localeCompare(bs);
};

function isStaying(stay: Stay, date: string): boolean {
  return !stay.completedOn && stay.checkInDate <= date && stay.checkOutDate >= date;
}

function isUpcoming(stay: Stay, date: string): boolean {
  return !stay.completedOn && stay.checkInDate > date;
}

function isFinalized(stay: Stay, date: string): boolean {
  return Boolean(stay.completedOn) || stay.checkOutDate < date;
}

function StayGroup({ title, stays, date, onEdit, onComplete }: {
  title: string;
  stays: Stay[];
  date: string;
  onEdit: (stay: Stay) => void;
  onComplete: (stay: Stay) => void;
}) {
  if (stays.length === 0) return null;
  const completable = (stay: Stay) => !stay.completedOn && stay.checkInDate <= date && stay.checkOutDate >= date;
  return (
    <div>
      <div className="mb-2.5 flex items-center gap-3">
        <h2 className="section-title">{title}</h2>
        <span className="h-px flex-1 bg-slate-200" aria-hidden />
        <span className="meta-value">{stays.length} {stays.length === 1 ? "habitación" : "habitaciones"}</span>
      </div>
      <div className="space-y-2">
        {stays.map((stay) => (
          <StayCard key={stay.id} stay={stay} onEdit={() => onEdit(stay)} onComplete={completable(stay) ? () => onComplete(stay) : undefined} />
        ))}
      </div>
    </div>
  );
}

export function ReceptionPage() {
  const [date, setDate] = useState(() => todayInUruguay());
  const [stays, setStays] = useState<Stay[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [editing, setEditing] = useState<Stay | null | undefined>(undefined);

  useEffect(() => {
    const controller = new AbortController();
    void api.listStays(controller.signal).then((response) => {
      setStays(response.stays);
      setError("");
    }).catch((caught: unknown) => {
      if (!(caught instanceof DOMException && caught.name === "AbortError")) setError(errorMessage(caught));
    }).finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  const groups = useMemo(() => {
    const search = query.trim().toLowerCase();
    const byQuery = (stay: Stay) => !search || stay.roomNumber.toLowerCase().includes(search);
    return {
      total: stays.filter(byQuery),
      staying: stays.filter((stay) => isStaying(stay, date) && byQuery(stay)).sort(byRoom),
      upcoming: stays.filter((stay) => isUpcoming(stay, date) && byQuery(stay)).sort(byRoom),
      finalized: stays.filter((stay) => isFinalized(stay, date) && byQuery(stay)).sort(byRoom),
      hasQuery: search.length > 0,
    };
  }, [stays, date, query]);

  const countFor = (id: Filter): number => {
    switch (id) {
      case "all": return groups.total.length;
      case "staying": return groups.staying.length;
      case "upcoming": return groups.upcoming.length;
      case "finalized": return groups.finalized.length;
    }
  };

  function upsert(stay: Stay) {
    setStays((all) => all.some((item) => item.id === stay.id)
      ? all.map((item) => item.id === stay.id ? stay : item)
      : [stay, ...all]);
    setEditing(undefined);
  }

  async function complete(stay: Stay) {
    if (!window.confirm(`¿Confirmás que la habitación ${stay.roomNumber} ya realizó el check-out?`)) return;
    try {
      const response = await api.updateStay(stay.id, { completed: true });
      upsert(response.stay);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  const emptyState = filter === "all"
    ? (stays.length === 0
      ? <EmptyState title="No hay estadías para esta fecha" detail="Creá una estadía con el botón Nueva." />
      : <EmptyState title="No se encontraron habitaciones" detail={`No hay habitaciones que coincidan con "${query.trim()}".`} />)
    : filter === "staying"
      ? <EmptyState title="No hay habitaciones alojadas" detail="Creá una estadía con el botón Nueva o cambiá de fecha." />
      : filter === "upcoming"
        ? <EmptyState title="No hay próximas llegadas" detail="Las reservas futuras aparecen en esta vista." />
        : <EmptyState title="No hay estadías finalizadas" detail="Las estadías completadas aparecen en esta vista." />;

  const visibleCount = filter === "all" ? groups.total.length
    : filter === "staying" ? groups.staying.length
      : filter === "upcoming" ? groups.upcoming.length
        : groups.finalized.length;

  const showEmpty = stays.length === 0 || (groups.total.length > 0 && visibleCount === 0);

  const list =
    filter === "staying" ? <StayGroup title="Alojados hoy" stays={groups.staying} date={date} onEdit={setEditing} onComplete={(stay) => void complete(stay)} />
      : filter === "upcoming" ? <StayGroup title="Próximas llegadas" stays={groups.upcoming} date={date} onEdit={setEditing} onComplete={(stay) => void complete(stay)} />
        : filter === "finalized" ? <StayGroup title="Finalizadas" stays={groups.finalized} date={date} onEdit={setEditing} onComplete={(stay) => void complete(stay)} />
          : (
              <div className="space-y-8">
                <StayGroup title="Alojados hoy" stays={groups.staying} date={date} onEdit={setEditing} onComplete={(stay) => void complete(stay)} />
                <StayGroup title="Próximas llegadas" stays={groups.upcoming} date={date} onEdit={setEditing} onComplete={(stay) => void complete(stay)} />
                <StayGroup title="Finalizadas" stays={groups.finalized} date={date} onEdit={setEditing} onComplete={(stay) => void complete(stay)} />
              </div>
            );

  return (
    <div className="min-h-dvh bg-[#f7f8f7]">
      <PageHeader eyebrow="Recepción" title="Estadías con desayuno" action={
        <button type="button" onClick={() => setEditing(null)} aria-label="Nueva estadía" title="Nueva estadía"
          className="grid size-11 place-items-center rounded-lg bg-pine-800 text-2xl leading-none text-white transition-colors hover:bg-pine-900">
          <span aria-hidden className="-translate-y-px">＋</span>
        </button>
      } />
      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
        <DateNavigator date={date} onChange={setDate} allowFuture />

        {error && <div className="mb-6"><ErrorBanner message={error} onDismiss={() => setError("")} /></div>}
        {loading ? <LoadingBlock label="Cargando estadías…" /> : (
          <div className="space-y-5">
            <div className="space-y-2.5">
              <label className="relative block">
                <span className="sr-only">Buscar habitación</span>
                <svg aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m21 21-4.3-4.3M17 11a6 6 0 1 1-12 0 6 6 0 0 1 12 0Z" /></svg>
                <input type="search" value={query} onChange={(event) => setQuery(event.target.value)}
                  placeholder="Buscar habitación…"
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white ps-9 pe-3 text-[15px] text-pine-950 placeholder:text-slate-400 focus:border-pine-600 focus:ring-2 focus:ring-pine-600/15 focus:outline-none" />
              </label>

              <div role="group" aria-label="Filtrar estadías" className="flex flex-wrap gap-1">
                {FILTERS.map((option) => {
                  const active = filter === option.id;
                  return (
                    <button key={option.id} type="button" onClick={() => setFilter(option.id)} aria-pressed={active}
                      className={`flex items-center justify-center gap-1 whitespace-nowrap rounded-full px-1.5 py-1.5 text-[13px] font-medium transition-colors ${active ? "bg-pine-800 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900"}`}>
                      {option.label}
                      <span className={`text-xs tabular-nums ${active ? "text-pine-200" : "text-slate-400"}`}>{countFor(option.id)}</span>
                    </button>
                  );
                })}
              </div>

              {groups.hasQuery && (
                <p className="text-xs text-slate-400">
                  {visibleCount} {visibleCount === 1 ? "habitación coincide" : "habitaciones coinciden"} con tu búsqueda.
                </p>
              )}
            </div>

            {showEmpty ? emptyState : list}
          </div>
        )}
      </main>
      {editing !== undefined && <StayForm stay={editing} onClose={() => setEditing(undefined)} onSaved={upsert} onDeleted={(id) => { setStays((all) => all.filter((stay) => stay.id !== id)); setEditing(undefined); }} />}
    </div>
  );
}
import { useEffect, useMemo, useRef, useState } from "react";
import type { Stay } from "../../shared/types";
import { DateNavigator } from "../components/DateNavigator";
import { EmptyState, ErrorBanner, LoadingBlock } from "../components/Feedback";
import { HotelLogo } from "../components/HotelLogo";
import { api, errorMessage } from "../lib/api";
import { todayInUruguay } from "../lib/dates";
import { ImportModal } from "./ImportModal";
import { StayCard, type StayStatus } from "./StayCard";
import { StayForm } from "./StayForm";

type Filter = "staying" | "upcoming" | "leaving" | "finalized" | "all";

const FILTERS: { id: Filter; label: string; icon: "bed" | "calendar" | "clock" | "list" }[] = [
  { id: "staying", label: "Alojados", icon: "bed" },
  { id: "upcoming", label: "Próximas", icon: "calendar" },
  { id: "leaving", label: "Sale hoy", icon: "clock" },
  { id: "finalized", label: "Finalizadas", icon: "clock" },
  { id: "all", label: "Todas", icon: "list" },
];

function FilterIcon({ icon }: { icon: "bed" | "calendar" | "clock" | "list" }) {
  if (icon === "bed") return <svg aria-hidden className="size-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 19V9m18 10v-6a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2v6M3 16h18M7 11V7H4a1 1 0 0 0-1 1v5" /></svg>;
  if (icon === "calendar") return <svg aria-hidden className="size-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M7 3v3M17 3v3M4 9h16M5.5 5h13A1.5 1.5 0 0 1 20 6.5v12a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-12A1.5 1.5 0 0 1 5.5 5Z" /></svg>;
  if (icon === "clock") return <svg aria-hidden className="size-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>;
  return <svg aria-hidden className="size-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" /></svg>;
}

function roomKey(roomNumber: string): [number, string] {
  const parsed = Number.parseInt(roomNumber, 10);
  return [Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER, roomNumber.toLowerCase()];
}

const byRoom = (a: Stay, b: Stay) => {
  const [ai, as] = roomKey(a.roomNumber);
  const [bi, bs] = roomKey(b.roomNumber);
  return ai - bi || as.localeCompare(bs);
};

function statusFor(stay: Stay, date: string): StayStatus {
  if (stay.completedOn || stay.checkOutDate < date) return "finalized";
  if (stay.checkInDate > date) return "upcoming";
  if (stay.checkOutDate === date) return "leaving";
  return "staying";
}

function StayGroup({ title, stays, date, onEdit, onComplete }: {
  title: string;
  stays: Stay[];
  date: string;
  onEdit: (stay: Stay) => void;
  onComplete: (stay: Stay) => void;
}) {
  if (stays.length === 0) return null;
  const guestCount = stays.reduce((total, stay) => total + stay.guestCount, 0);
  const completable = (stay: Stay) => !stay.completedOn && stay.checkInDate <= date && stay.checkOutDate >= date;
  const titleId = `group-${title.replaceAll(" ", "-").toLowerCase()}`;

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_4px_18px_rgba(22,50,37,0.05)]" aria-labelledby={titleId}>
      <div className="flex flex-wrap items-end justify-between gap-1.5 px-3 py-3 sm:px-4 sm:py-4 lg:px-5">
        <h2 id={titleId} className="text-lg font-bold tracking-tight text-slate-950 lg:text-xl">{title}</h2>
        <p className="text-xs font-medium text-slate-500 sm:text-sm">
          {stays.length} {stays.length === 1 ? "habitación" : "habitaciones"} <span className="px-1 text-slate-300">·</span> {guestCount} {guestCount === 1 ? "huésped" : "huéspedes"}
        </p>
      </div>
      <div className="hidden grid-cols-[minmax(155px,1.15fr)_105px_105px_105px_minmax(150px,1.5fr)_210px] gap-4 bg-[#f1f5f2] px-5 py-2.5 text-xs font-semibold text-slate-500 lg:grid">
        <span>Habitación</span><span>Huéspedes</span><span>Check-in</span><span>Check-out</span><span>Observaciones</span><span className="text-center">Acciones</span>
      </div>
      <div className="space-y-1.5 bg-[#f8faf8] p-2 lg:space-y-0 lg:bg-white lg:p-0">
        {stays.map((stay) => <StayCard key={stay.id} stay={stay} status={statusFor(stay, date)} selectedDate={date} onEdit={() => onEdit(stay)} onComplete={completable(stay) ? () => onComplete(stay) : undefined} />)}
      </div>
    </section>
  );
}

function CheckoutConfirmModal({ stay, busy, onClose, onConfirm }: {
  stay: Stay;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const busyRef = useRef(busy);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    busyRef.current = busy;
    onCloseRef.current = onClose;
  }, [busy, onClose]);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busyRef.current) {
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const controls = [...dialogRef.current.querySelectorAll<HTMLElement>("button:not(:disabled)")];
      const first = controls[0];
      const last = controls.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-4 sm:items-center" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="checkout-confirm-title" aria-describedby="checkout-confirm-description" aria-busy={busy} tabIndex={-1} className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl outline-none sm:p-6">
        <div className="flex items-start gap-3">
          <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-full bg-slate-100 text-[#087447]">
            <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 4 4L19 6" /></svg>
          </span>
          <div className="min-w-0">
            <h2 id="checkout-confirm-title" className="text-lg font-bold tracking-tight text-slate-950">Confirmar check-out</h2>
            <p id="checkout-confirm-description" className="mt-1.5 text-sm leading-relaxed text-slate-600">¿Confirmás que la habitación <strong className="font-semibold text-slate-900">{stay.roomNumber}</strong> ya realizó el check-out?</p>
          </div>
        </div>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} disabled={busy} className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60">Cancelar</button>
          <button type="button" onClick={onConfirm} disabled={busy} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#087447] px-4 text-sm font-semibold text-white shadow-[0_4px_12px_rgba(8,116,71,0.18)] transition-colors hover:bg-[#075f3c] disabled:cursor-not-allowed disabled:opacity-60">
            {busy && <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-white/50 border-t-white" />}
            {busy ? "Confirmando…" : "Confirmar check-out"}
          </button>
        </div>
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
  const [filter, setFilter] = useState<Filter>("staying");
  const [editing, setEditing] = useState<Stay | null | undefined>(undefined);
  const [importOpen, setImportOpen] = useState(false);
  const [checkoutCandidate, setCheckoutCandidate] = useState<Stay | null>(null);
  const [completing, setCompleting] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void api.listStays(controller.signal).then((response) => { setStays(response.stays); setError(""); })
      .catch((caught: unknown) => { if (!(caught instanceof DOMException && caught.name === "AbortError")) setError(errorMessage(caught)); })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  const groups = useMemo(() => {
    const search = query.trim().toLocaleLowerCase("es");
    const byQuery = (stay: Stay) => !search || stay.roomNumber.toLocaleLowerCase("es").includes(search) || (stay.breakfastNotes ?? "").toLocaleLowerCase("es").includes(search);
    const matching = stays.filter(byQuery);
    const staying = matching.filter((stay) => ["staying", "leaving"].includes(statusFor(stay, date))).sort(byRoom);
    return {
      total: matching.sort(byRoom),
      staying,
      leaving: staying.filter((stay) => statusFor(stay, date) === "leaving"),
      upcoming: matching.filter((stay) => statusFor(stay, date) === "upcoming").sort(byRoom),
      finalized: matching.filter((stay) => statusFor(stay, date) === "finalized").sort(byRoom),
      hasQuery: search.length > 0,
    };
  }, [stays, date, query]);

  const countFor = (id: Filter): number => groups[id === "all" ? "total" : id].length;
  const activeFilter = FILTERS.find((option) => option.id === filter)!;

  function upsert(stay: Stay) {
    setStays((all) => all.some((item) => item.id === stay.id) ? all.map((item) => item.id === stay.id ? stay : item) : [stay, ...all]);
    setEditing(undefined);
  }

  async function complete(stay: Stay) {
    setCompleting(true);
    try {
      const response = await api.updateStay(stay.id, { completed: true });
      upsert(response.stay);
      setCheckoutCandidate(null);
    } catch (caught) { setError(errorMessage(caught)); }
    finally { setCompleting(false); }
  }

  const selected = filter === "all" ? groups.total : groups[filter];
  const visibleCount = selected.length;
  const showEmpty = !loading && visibleCount === 0;
  const emptyState = groups.hasQuery
    ? <EmptyState title="No se encontraron habitaciones" detail={`No hay habitaciones u observaciones que coincidan con "${query.trim()}".`} />
    : filter === "staying" ? <EmptyState title="No hay habitaciones alojadas" detail="Importá un PDF de Desbravador o cambiá de fecha." />
      : filter === "upcoming" ? <EmptyState title="No hay próximas llegadas" detail="Las reservas futuras aparecen en esta vista." />
        : filter === "leaving" ? <EmptyState title="No hay salidas para hoy" detail="Las habitaciones con check-out en esta fecha aparecen acá." />
          : filter === "finalized" ? <EmptyState title="No hay estadías finalizadas" detail="Las estadías completadas aparecen en esta vista." />
            : <EmptyState title="No hay estadías" detail="Importá un PDF de Desbravador para cargar las reservas." />;

  const list = filter === "all" ? <div className="space-y-5">
    <StayGroup title="Alojados hoy" stays={groups.staying} date={date} onEdit={setEditing} onComplete={setCheckoutCandidate} />
    <StayGroup title="Próximas llegadas" stays={groups.upcoming} date={date} onEdit={setEditing} onComplete={setCheckoutCandidate} />
    <StayGroup title="Finalizadas" stays={groups.finalized} date={date} onEdit={setEditing} onComplete={setCheckoutCandidate} />
  </div> : <StayGroup title={filter === "staying" ? "Alojados hoy" : filter === "upcoming" ? "Próximas llegadas" : filter === "leaving" ? "Salen hoy" : "Finalizadas"} stays={selected} date={date} onEdit={setEditing} onComplete={setCheckoutCandidate} />;

  return (
    <div className="min-h-dvh bg-[#f3f7f4]">
      <header className="relative overflow-hidden border-b border-pine-100 bg-white">
        <div className="pointer-events-none absolute inset-0 reception-header-pattern opacity-70" aria-hidden />
        <div className="relative mx-auto flex max-w-[1240px] items-center justify-between gap-3 px-4 py-3 sm:gap-4 sm:px-6 sm:py-5 lg:px-8">
          <div className="flex min-w-0 items-center gap-3 sm:gap-5">
            <HotelLogo className="h-[52px] w-[51px] sm:h-[78px] sm:w-[77px]" />
            <div className="min-w-0">
              <h1 className="text-[1.7rem] font-bold leading-none tracking-[-0.035em] text-slate-950 sm:text-4xl">Recepción</h1>
              <p className="mt-1.5 hidden text-sm font-medium text-slate-500 sm:block sm:text-base">Gestión de estadías con desayuno</p>
            </div>
          </div>
          <button type="button" onClick={() => setImportOpen(true)} aria-label="Importar reservas" title="Importar reservas" className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#087447] text-sm font-semibold text-white shadow-[0_5px_14px_rgba(8,116,71,0.22)] transition-colors hover:bg-[#075f3c] min-[420px]:w-auto min-[420px]:gap-2 min-[420px]:px-4 sm:size-auto sm:min-h-12 sm:px-5">
            <svg aria-hidden className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 14v4.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V14" /></svg>
            <span className="sr-only min-[420px]:not-sr-only">Importar reservas</span>
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-[1240px] px-4 py-3 sm:px-6 sm:py-7 lg:px-8">
        <div className="rounded-2xl border border-slate-200/80 bg-white px-1.5 py-1.5 shadow-[0_3px_14px_rgba(22,50,37,0.05)] sm:px-2"><DateNavigator date={date} onChange={setDate} allowFuture compact /></div>
        {error && <div className="mt-5"><ErrorBanner message={error} onDismiss={() => setError("")} /></div>}
        {loading ? <div className="mt-5"><LoadingBlock label="Cargando estadías…" /></div> : (
          <div className="mt-3 space-y-4 sm:mt-4 sm:space-y-5">
            <div className="space-y-2.5 sm:space-y-3">
              <label className="relative block">
                <span className="sr-only">Buscar por habitación u observación</span>
                <svg aria-hidden className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></svg>
                <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por habitación u observación…" className="h-11 w-full rounded-xl border border-slate-200 bg-white ps-12 pe-4 text-[15px] text-pine-950 shadow-[0_2px_10px_rgba(22,50,37,0.035)] placeholder:text-slate-400 focus:border-pine-600 focus:ring-2 focus:ring-pine-600/15 focus:outline-none sm:h-12" />
              </label>
              <label className="relative block sm:hidden">
                <span className="sr-only">Filtrar estadías</span>
                <span aria-hidden className="flex h-11 items-center gap-3 rounded-xl border border-slate-200 bg-white px-3.5 shadow-[0_2px_10px_rgba(22,50,37,0.035)]">
                  <svg className="size-5 shrink-0 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 6h16M7 12h10M10 18h4" /></svg>
                  <span className="flex min-w-0 flex-1 items-center gap-2 text-sm leading-tight">
                    <span className="text-slate-500">Filtrar</span>
                    <span className="font-semibold text-slate-900">{activeFilter.label}</span>
                    <span className="grid min-w-6 place-items-center rounded-full bg-[#087447] px-1.5 py-0.5 text-xs tabular-nums text-white">{countFor(activeFilter.id)}</span>
                  </span>
                  <svg className="size-4 shrink-0 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m7 10 5 5 5-5" /></svg>
                </span>
                <select value={filter} onChange={(event) => setFilter(event.target.value as Filter)} aria-label="Filtrar estadías" className="absolute inset-0 h-full w-full cursor-pointer opacity-0">
                  {FILTERS.map((option) => <option key={option.id} value={option.id}>{option.label} · {countFor(option.id)}</option>)}
                </select>
              </label>
              <div role="group" aria-label="Filtrar estadías" className="hidden sm:grid sm:grid-cols-5 sm:gap-2">
                {FILTERS.map((option) => {
                  const active = filter === option.id;
                  const mobileSpan = option.id === "staying" || option.id === "upcoming" ? "col-span-3" : "col-span-2";
                  return <button key={option.id} type="button" onClick={() => setFilter(option.id)} aria-pressed={active} className={`flex min-h-11 min-w-0 items-center justify-center gap-1 rounded-full px-1 text-xs font-semibold transition-colors sm:col-span-1 sm:min-h-12 sm:gap-2 sm:rounded-xl sm:px-2 sm:text-sm ${mobileSpan} ${active ? "bg-[#087447] text-white shadow-[0_4px_12px_rgba(8,116,71,0.18)]" : "bg-[#e9f0eb] text-pine-800 hover:bg-pine-200"}`}>
                    <span className="hidden sm:inline-flex"><FilterIcon icon={option.icon} /></span><span>{option.label}</span><span className={`grid min-w-5 place-items-center rounded-full px-1 py-0.5 text-[11px] tabular-nums sm:min-w-6 sm:px-1.5 sm:py-1 sm:text-xs ${active ? "bg-white text-pine-800" : "bg-white/65 text-pine-700"}`}>{countFor(option.id)}</span>
                  </button>;
                })}
              </div>
              {groups.hasQuery && <p className="text-xs text-slate-500">{visibleCount} {visibleCount === 1 ? "habitación coincide" : "habitaciones coinciden"} con la búsqueda.</p>}
            </div>
            {showEmpty ? emptyState : list}
          </div>
        )}
      </main>
      {editing !== undefined && <StayForm stay={editing} onClose={() => setEditing(undefined)} onSaved={upsert} onDeleted={(id: number) => { setStays((all) => all.filter((stay) => stay.id !== id)); setEditing(undefined); }} />}
      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} onApplied={async () => {
        setLoading(true);
        try { const response = await api.listStays(); setStays(response.stays); setError(""); }
        catch (caught) { setError(errorMessage(caught)); }
        finally { setLoading(false); }
      }} />
      {checkoutCandidate && <CheckoutConfirmModal stay={checkoutCandidate} busy={completing} onClose={() => setCheckoutCandidate(null)} onConfirm={() => void complete(checkoutCandidate)} />}
    </div>
  );
}

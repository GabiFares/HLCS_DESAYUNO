import { useEffect, useMemo, useState } from "react";
import type { Stay } from "../../shared/types";
import { EmptyState, ErrorBanner, LoadingBlock } from "../components/Feedback";
import { PageHeader } from "../components/PageHeader";
import { api, errorMessage } from "../lib/api";
import { capitalize, formatDate, todayInUruguay } from "../lib/dates";
import { StayCard } from "./StayCard";
import { StayForm } from "./StayForm";

export function ReceptionPage() {
  const today = todayInUruguay();
  const [stays, setStays] = useState<Stay[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
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

  const { current, upcoming, archived } = useMemo(() => ({
    current: stays.filter((stay) => !stay.completedOn && stay.checkInDate <= today && stay.checkOutDate >= today),
    upcoming: stays.filter((stay) => !stay.completedOn && stay.checkInDate > today),
    archived: stays.filter((stay) => Boolean(stay.completedOn) || stay.checkOutDate < today),
  }), [stays, today]);

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

  return (
    <div className="min-h-dvh bg-[#f7f8f7]">
      <PageHeader eyebrow="Recepción" title="Estadías con desayuno" action={
        <button type="button" onClick={() => setEditing(null)} className="btn-primary"><span aria-hidden className="text-base leading-none">＋</span> Nueva</button>
      } />
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="mb-7 flex items-baseline justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-pine-800">{capitalize(formatDate(today, "long"))}</p>
            <p className="mt-1 text-sm text-slate-500">Los cambios se reflejan automáticamente en cafetería.</p>
          </div>
          {current.length > 0 && (
            <p className="hidden shrink-0 text-right text-sm text-slate-500 sm:block">
              <strong className="font-bold text-pine-900">{current.length}</strong> habitación{current.length === 1 ? "" : "es"} alojada{current.length === 1 ? "" : "s"}
            </p>
          )}
        </div>

        {error && <div className="mb-6"><ErrorBanner message={error} onDismiss={() => setError("")} /></div>}
        {loading ? <LoadingBlock label="Cargando estadías…" /> : (
          <div className="space-y-10">
            <section aria-labelledby="current-title">
              <div className="mb-4 flex items-center gap-3">
                <h2 id="current-title" className="section-title">Alojados hoy</h2>
                <span className="h-px flex-1 bg-slate-200" aria-hidden />
                <span className="meta-value">{current.length} {current.length === 1 ? "habitación" : "habitaciones"}</span>
              </div>
              <div className="space-y-2.5">
                {current.length === 0 ? <EmptyState title="No hay habitaciones alojadas" detail="Creá una estadía con el botón Nueva." />
                  : current.map((stay) => <StayCard key={stay.id} stay={stay} today={today} onEdit={() => setEditing(stay)} onComplete={() => void complete(stay)} />)}
              </div>
            </section>

            {upcoming.length > 0 && <section aria-labelledby="upcoming-title">
              <div className="mb-4 flex items-center gap-3">
                <h2 id="upcoming-title" className="section-title">Próximas llegadas</h2>
                <span className="h-px flex-1 bg-slate-200" aria-hidden />
                <span className="meta-value">{upcoming.length} {upcoming.length === 1 ? "habitación" : "habitaciones"}</span>
              </div>
              <div className="space-y-2.5">{upcoming.map((stay) => <StayCard key={stay.id} stay={stay} today={today} onEdit={() => setEditing(stay)} />)}</div>
            </section>}

            {archived.length > 0 && <section aria-labelledby="archived-title">
              <details className="group">
                <summary className="flex list-none cursor-pointer items-center gap-3 py-1">
                  <h2 id="archived-title" className="section-title">Finalizadas y anteriores</h2>
                  <span className="text-sm text-slate-400">{archived.length}</span>
                  <span className="ml-auto text-sm text-slate-400 transition-transform group-open:rotate-90" aria-hidden>›</span>
                </summary>
                <div className="mt-4 space-y-2.5 border-l-2 border-slate-100 pl-4">
                  {archived.map((stay) => (
                    <div key={stay.id} className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-pine-950">Habitación {stay.roomNumber}</p>
                        <p className="text-sm text-slate-500">{formatDate(stay.checkInDate)} — {formatDate(stay.checkOutDate)}</p>
                      </div>
                      <button type="button" onClick={() => setEditing(stay)} className="btn-ghost min-h-9 text-slate-500 hover:text-slate-800">Editar</button>
                    </div>
                  ))}
                </div>
              </details>
            </section>}
          </div>
        )}
      </main>
      {editing !== undefined && <StayForm stay={editing} onClose={() => setEditing(undefined)} onSaved={upsert} onDeleted={(id) => { setStays((all) => all.filter((stay) => stay.id !== id)); setEditing(undefined); }} />}
    </div>
  );
}
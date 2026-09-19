import { useCallback, useEffect, useRef, useState } from "react";
import type { BreakfastDay, InventoryDay } from "../../shared/types";
import { ErrorBanner, LoadingBlock } from "../components/Feedback";
import { PageHeader } from "../components/PageHeader";
import { api, errorMessage } from "../lib/api";
import { todayInUruguay } from "../lib/dates";
import { DailyNote } from "./DailyNote";
import { DateNavigator } from "../components/DateNavigator";
import { InventorySection } from "./InventorySection";
import { RoomsPanel } from "./RoomsPanel";

type TabId = "rooms" | "stock" | "note";

const TABS: { id: TabId; label: string }[] = [
  { id: "rooms", label: "Habitaciones" },
  { id: "stock", label: "Stock" },
  { id: "note", label: "Nota del día" },
];

export function CafeteriaPage() {
  const [date, setDate] = useState(todayInUruguay());
  return (
    <div className="min-h-dvh bg-[#f7f8f7]">
      <PageHeader eyebrow="Cafetería" title="Servicio de desayuno" />
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <DateNavigator date={date} onChange={setDate} />
        <DayContent key={date} date={date} />
      </main>
    </div>
  );
}

function DaySummary({ day }: { day: BreakfastDay }) {
  const pending = day.stays.filter((stay) => stay.servedCount < stay.guestCount).length;
  return (
    <div aria-live="polite" className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border-t-2 border-pine-700 bg-slate-200 sm:grid-cols-4">
      <div className="flex flex-col items-center gap-0.5 bg-white px-3 py-2.5">
        <p className="stat-label">Habitaciones</p>
        <p className="stat-value">{day.stays.length}</p>
      </div>
      <div className="flex flex-col items-center gap-0.5 bg-white px-3 py-2.5">
        <p className="stat-label">Pendientes</p>
        <p className={`stat-value ${pending === 0 ? "text-pine-700" : "text-amber-700"}`}>{pending}</p>
      </div>
      <div className="flex flex-col items-center gap-0.5 bg-white px-3 py-2.5">
        <p className="stat-label">Servidos</p>
        <p className="stat-value">{day.totalServed}</p>
      </div>
      <div className="flex flex-col items-center justify-center gap-0.5 bg-white px-3 py-2.5">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className={`size-2 rounded-full ${day.canClose ? "bg-pine-600" : "bg-amber-500"}`} />
          <span className="stat-label">Estado</span>
        </span>
        <p className={`text-[13px] font-semibold leading-tight ${day.canClose ? "text-pine-800" : "text-amber-800"}`}>
          {day.canClose ? "Puede cerrar" : "Faltan pendientes"}
        </p>
      </div>
    </div>
  );
}

function DayContent({ date }: { date: string }) {
  const [breakfast, setBreakfast] = useState<BreakfastDay | null>(null);
  const [inventory, setInventory] = useState<InventoryDay | null>(null);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingIds, setSavingIds] = useState<Set<number>>(new Set());
  const [activeTab, setActiveTab] = useState<TabId>("rooms");
  const breakfastRef = useRef<BreakfastDay | null>(null);
  const saveTimers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const saveChains = useRef(new Map<number, Promise<void>>());
  const desiredCounts = useRef(new Map<number, number>());
  const mounted = useRef(true);

  const applyBreakfast = useCallback((value: BreakfastDay) => {
    breakfastRef.current = value;
    setBreakfast(value);
  }, []);

  const refreshBreakfast = useCallback(async (signal?: AbortSignal, quiet = false) => {
    if (desiredCounts.current.size > 0) return;
    try {
      const value = await api.breakfastDay(date, signal);
      if (mounted.current) applyBreakfast(value);
    } catch (caught) {
      if (!(caught instanceof DOMException && caught.name === "AbortError") && mounted.current && !quiet) {
        setError(errorMessage(caught));
      }
    }
  }, [applyBreakfast, date]);

  const refreshInventory = useCallback(async (signal?: AbortSignal) => {
    try {
      const value = await api.inventoryDay(date, signal);
      if (mounted.current) setInventory(value);
    } catch (caught) {
      if (!(caught instanceof DOMException && caught.name === "AbortError") && mounted.current) {
        setError(errorMessage(caught));
      }
    }
  }, [date]);

  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    const timers = saveTimers.current;
    void Promise.all([
      api.breakfastDay(date, controller.signal),
      api.inventoryDay(date, controller.signal),
      api.note(date, controller.signal),
    ]).then(([breakfastValue, inventoryValue, noteValue]) => {
      if (!mounted.current) return;
      applyBreakfast(breakfastValue);
      setInventory(inventoryValue);
      setNote(noteValue.content);
      setError("");
    }).catch((caught: unknown) => {
      if (!(caught instanceof DOMException && caught.name === "AbortError") && mounted.current) {
        setError(errorMessage(caught));
      }
    }).finally(() => { if (mounted.current) setLoading(false); });

    return () => {
      mounted.current = false;
      controller.abort();
      timers.forEach(clearTimeout);
    };
  }, [applyBreakfast, date]);

  useEffect(() => {
    if (date !== todayInUruguay()) return;
    const interval = window.setInterval(() => void refreshBreakfast(undefined, true), 15_000);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refreshBreakfast(undefined, true);
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [date, refreshBreakfast]);

  function changeCount(stayId: number, nextCount: number) {
    const current = breakfastRef.current;
    const stay = current?.stays.find((item) => item.stayId === stayId);
    if (!current || !stay || nextCount < 0 || nextCount > stay.guestCount) return;
    const nextStays = current.stays.map((item) => item.stayId === stayId
      ? { ...item, servedCount: nextCount }
      : item);
    const pendingRooms = nextStays.filter((item) => item.servedCount < item.guestCount).length;
    applyBreakfast({
      ...current,
      stays: nextStays,
      totalServed: current.totalServed + nextCount - stay.servedCount,
      pendingRooms,
      canClose: pendingRooms === 0,
    });
    desiredCounts.current.set(stayId, nextCount);
    setSavingIds((ids) => new Set(ids).add(stayId));
    const priorTimer = saveTimers.current.get(stayId);
    if (priorTimer) clearTimeout(priorTimer);
    saveTimers.current.set(stayId, setTimeout(() => enqueueSave(stayId, nextCount), 250));
  }

  function enqueueSave(stayId: number, count: number) {
    const previous = saveChains.current.get(stayId) ?? Promise.resolve();
    const task = previous.catch(() => undefined).then(async () => {
      await api.setBreakfastCount(date, stayId, count);
      if (!mounted.current || desiredCounts.current.get(stayId) !== count) return;
      desiredCounts.current.delete(stayId);
      setSavingIds((ids) => { const next = new Set(ids); next.delete(stayId); return next; });
    }).catch((caught: unknown) => {
      if (!mounted.current || desiredCounts.current.get(stayId) !== count) return;
      desiredCounts.current.delete(stayId);
      setSavingIds((ids) => { const next = new Set(ids); next.delete(stayId); return next; });
      setError(errorMessage(caught));
      void refreshBreakfast();
    });
    saveChains.current.set(stayId, task);
  }

  return (
    <div className="mt-5">
      {error && <div className="mb-4"><ErrorBanner message={error} onDismiss={() => setError("")} /></div>}
      {loading ? <LoadingBlock label="Cargando el día…" /> : breakfast && inventory ? (
        <>
          <DaySummary day={breakfast} />

          <nav role="tablist" aria-label="Secciones del día" className="mt-5 flex items-end gap-1 overflow-x-auto border-b border-slate-200">
            {TABS.map((tab) => (
              <button key={tab.id} type="button" id={`tab-${tab.id}`} role="tab" aria-selected={activeTab === tab.id}
                aria-controls={`panel-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className={`tab ${activeTab === tab.id ? "tab-active" : ""}`}>
                {tab.label}
                {tab.id === "rooms" && breakfast.stays.length > 0 && (
                  <span className="text-xs tabular-nums text-slate-400">{breakfast.stays.length}</span>
                )}
              </button>
            ))}
          </nav>

          <section id="panel-rooms" role="tabpanel" aria-labelledby="tab-rooms" hidden={activeTab !== "rooms"} className="mt-4">
            <RoomsPanel day={breakfast} savingIds={savingIds} onCount={changeCount} />
            {date === todayInUruguay() && <p className="mt-3 text-center text-[11px] text-slate-400/80">Actualización automática cada 15 segundos.</p>}
          </section>

          <section id="panel-stock" role="tabpanel" aria-labelledby="tab-stock" hidden={activeTab !== "stock"} className="mt-4">
            <InventorySection key={date} date={date} items={inventory.items} onProductsChanged={() => void refreshInventory()} />
          </section>

          <section id="panel-note" role="tabpanel" aria-labelledby="tab-note" hidden={activeTab !== "note"} className="mt-4">
            <DailyNote key={date} date={date} initialContent={note} />
          </section>
        </>
      ) : !error ? <LoadingBlock label="No se pudo cargar la información." /> : null}
    </div>
  );
}
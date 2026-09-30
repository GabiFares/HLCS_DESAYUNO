import { useCallback, useEffect, useRef, useState } from "react";
import type { BreakfastDay, InventoryDay } from "../../shared/types";
import { ErrorBanner, LoadingBlock } from "../components/Feedback";
import { HotelLogo } from "../components/HotelLogo";
import { DateNavigator } from "../components/DateNavigator";
import { api, errorMessage } from "../lib/api";
import { todayInUruguay } from "../lib/dates";
import { DailyNote } from "./DailyNote";
import { InventorySection } from "./InventorySection";
import { ProductManager } from "./ProductManager";
import { RoomsPanel } from "./RoomsPanel";

type TabId = "rooms" | "stock" | "note";
type StockView = "daily" | "manage";

const TABS: { id: TabId; label: string }[] = [
  { id: "rooms", label: "Desayunos por habitación" },
  { id: "stock", label: "Control de stock" },
  { id: "note", label: "Notas del desayuno" },
];

const STOCK_VIEWS: { id: StockView; label: string }[] = [
  { id: "daily", label: "Registro diario" },
  { id: "manage", label: "Administrar productos" },
];

export function CafeteriaPage() {
  const [date, setDate] = useState(todayInUruguay());
  return (
    <div className="min-h-dvh bg-[#f7f8f7]">
      <header className="border-b-2 border-b-pine-800 bg-white">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3.5 sm:px-6 sm:py-4">
          <HotelLogo />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-pine-700">Hotel Los Cedros</p>
            <h1 className="page-title mt-0.5 truncate">Desayunos · Cafetería</h1>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-7">
        <DateNavigator date={date} onChange={setDate} />
        <DayContent key={date} date={date} />
      </main>
    </div>
  );
}

function DaySummary({ day }: { day: BreakfastDay }) {
  const stays = day.stays;
  const registered = stays.filter((stay) => stay.servedCount === stay.guestCount).length;
  const unregistered = stays.filter((stay) => stay.servedCount === 0).length;
  const pending = stays.length - registered;

  let statusText: string;
  let tone: "neutral" | "warn" | "done";
  if (stays.length === 0) {
    statusText = "No hay habitaciones para este día";
    tone = "neutral";
  } else if (pending === 0) {
    statusText = "Registro del desayuno completo";
    tone = "done";
  } else if (pending === 1) {
    statusText = "Queda 1 habitación por registrar";
    tone = "warn";
  } else {
    statusText = `Quedan ${pending} habitaciones por registrar`;
    tone = "warn";
  }

  const footerStyle = tone === "warn" ? "bg-amber-50 text-amber-800"
    : tone === "done" ? "bg-pine-50 text-pine-800"
      : "bg-slate-50 text-slate-600";

  return (
    <div aria-live="polite" className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="grid grid-cols-3 divide-x divide-slate-100">
        <div className="flex flex-col items-center gap-0.5 px-3 py-3">
          <p className="stat-label">Habitaciones de hoy</p>
          <p className="stat-value">{stays.length}</p>
        </div>
        <div className="flex flex-col items-center gap-0.5 px-3 py-3">
          <p className="stat-label">Sin registrar</p>
          <p className={`stat-value ${unregistered === 0 ? "text-pine-700" : "text-amber-700"}`}>{unregistered}</p>
        </div>
        <div className="flex flex-col items-center gap-0.5 px-3 py-3">
          <p className="stat-label">Atendidas</p>
          <p className="stat-value">{registered}</p>
        </div>
      </div>
      <p className={`px-4 py-2.5 text-center text-[13px] font-semibold ${footerStyle}`}>{statusText}</p>
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
  const [stockView, setStockView] = useState<StockView>("daily");
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

          <nav role="tablist" aria-label="Secciones del día" className="mt-5">
            <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
              {TABS.map((tab) => (
                <button key={tab.id} type="button" id={`tab-${tab.id}`} role="tab"
                  aria-selected={activeTab === tab.id} aria-controls={`panel-${tab.id}`}
                  onClick={() => setActiveTab(tab.id)}
                  className={`seg-pill ${activeTab === tab.id ? "seg-pill-active" : ""}`}>
                  {tab.label}
                  {tab.id === "rooms" && breakfast.stays.length > 0 && (
                    <span className="text-xs tabular-nums text-slate-400">{breakfast.stays.length}</span>
                  )}
                </button>
              ))}
            </div>
          </nav>

          <section id="panel-rooms" role="tabpanel" aria-labelledby="tab-rooms" hidden={activeTab !== "rooms"} className="mt-4">
            <RoomsPanel day={breakfast} savingIds={savingIds} onCount={changeCount} />
            {date === todayInUruguay() && <p className="mt-3 text-center text-[11px] text-slate-400/80">Actualización automática cada 15 segundos.</p>}
          </section>

          <section id="panel-stock" role="tabpanel" aria-labelledby="tab-stock" hidden={activeTab !== "stock"} className="mt-4">
            <div role="group" aria-label="Sección de control de stock" className="flex gap-1 rounded-lg bg-slate-100 p-1">
              {STOCK_VIEWS.map((option) => {
                const active = stockView === option.id;
                return (
                  <button key={option.id} type="button" onClick={() => setStockView(option.id)} aria-pressed={active}
                    className={`seg-pill min-h-10 flex-1 sm:flex-initial ${active ? "seg-pill-active" : ""}`}>
                    {option.label}
                  </button>
                );
              })}
            </div>
            <div className="mt-3">
              {stockView === "daily"
                ? <InventorySection key={date} date={date} items={inventory.items} />
                : <ProductManager onChanged={() => void refreshInventory()} />}
            </div>
          </section>

          <section id="panel-note" role="tabpanel" aria-labelledby="tab-note" hidden={activeTab !== "note"} className="mt-4">
            <DailyNote key={date} date={date} initialContent={note} />
          </section>
        </>
      ) : !error ? <LoadingBlock label="No se pudo cargar la información." /> : null}
    </div>
  );
}
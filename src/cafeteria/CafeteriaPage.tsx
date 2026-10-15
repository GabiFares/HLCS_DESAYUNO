import { useCallback, useEffect, useRef, useState } from "react";
import type { BreakfastDay, InventoryDay } from "../../shared/types";
import { ErrorBanner, LoadingBlock } from "../components/Feedback";
import { DateNavigator } from "../components/DateNavigator";
import { HotelLogo } from "../components/HotelLogo";
import { api, errorMessage } from "../lib/api";
import { todayInUruguay } from "../lib/dates";
import { DailyNote } from "./DailyNote";
import { InventorySection } from "./InventorySection";
import { ProductManager } from "./ProductManager";
import { RoomsPanel, type BreakfastRoomFilter } from "./RoomsPanel";

type TabId = "rooms" | "stock" | "note";
type StockView = "daily" | "manage";

const TABS: { id: TabId; label: string }[] = [
  { id: "rooms", label: "Habitaciones" },
  { id: "stock", label: "Stock" },
  { id: "note", label: "Notas" },
];

const STOCK_VIEWS: { id: StockView; label: string }[] = [
  { id: "daily", label: "Registro diario" },
  { id: "manage", label: "Administrar productos" },
];

export function CafeteriaPage() {
  const [date, setDate] = useState(todayInUruguay());
  const today = todayInUruguay();
  return (
    <div className="min-h-dvh bg-[#f3f7f4]">
      <header className="border-b border-slate-200/80 bg-white">
        <div className="mx-auto flex max-w-[1240px] flex-col gap-3 px-4 py-4 sm:px-6 sm:py-5 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <HotelLogo className="h-[52px] w-[51px] sm:h-[68px] sm:w-[67px]" />
            <h1 className="text-[1.75rem] font-bold leading-tight tracking-[-0.035em] text-slate-950 sm:text-3xl">Cafetería</h1>
          </div>
          <div className="flex min-w-0 items-center gap-2 lg:w-[34rem]">
            <div className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white px-1.5 py-1.5 shadow-[0_3px_14px_rgba(22,50,37,0.05)]">
              <DateNavigator date={date} onChange={setDate} compact />
            </div>
            {date !== today && (
              <button type="button" onClick={() => setDate(today)} className="min-h-11 shrink-0 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-[#087447] shadow-[0_2px_8px_rgba(22,50,37,0.04)] transition-colors hover:bg-slate-50">
                Hoy
              </button>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1240px] px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
        <DayContent key={date} date={date} />
      </main>
    </div>
  );
}

function DaySummary({ day, selectedFilter, onSelectFilter }: {
  day: BreakfastDay;
  selectedFilter: BreakfastRoomFilter;
  onSelectFilter: (filter: BreakfastRoomFilter) => void;
}) {
  const rooms = day.stays.length;
  const expected = day.stays.reduce((total, stay) => total + stay.guestCount, 0);
  const served = day.stays.reduce((total, stay) => total + stay.servedCount, 0);
  const pending = Math.max(0, expected - served);
  const progress = expected === 0 ? 0 : Math.round((served / expected) * 100);

  return (
    <section aria-live="polite" aria-label="Resumen del desayuno" className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_4px_18px_rgba(22,50,37,0.05)]">
      <div className="grid grid-cols-[minmax(0,1fr)_124px] px-3 py-3 sm:hidden">
        <div className="grid self-stretch grid-rows-3 gap-1 pr-3 text-sm">
          <button type="button" onClick={() => onSelectFilter("all")} aria-pressed={selectedFilter === "all"} className={`grid min-h-11 grid-cols-[minmax(0,1fr)_2rem] items-center gap-2 rounded-lg px-1 transition-colors ${selectedFilter === "all" ? "bg-slate-100" : "hover:bg-slate-50"}`}>
            <span className="text-center text-slate-600">Habitaciones de hoy</span>
            <strong className="text-center font-bold tabular-nums text-slate-950">{rooms}</strong>
          </button>
          <button type="button" onClick={() => onSelectFilter("pending")} aria-pressed={selectedFilter === "pending"} className={`grid min-h-11 grid-cols-[minmax(0,1fr)_2rem] items-center gap-2 rounded-lg px-1 transition-colors ${selectedFilter === "pending" ? "bg-amber-50" : "hover:bg-slate-50"}`}>
            <span className="text-center text-slate-600">Desayunos pendientes</span>
            <strong className="text-center font-bold tabular-nums text-amber-700">{pending}</strong>
          </button>
          <button type="button" onClick={() => onSelectFilter("complete")} aria-pressed={selectedFilter === "complete"} className={`grid min-h-11 grid-cols-[minmax(0,1fr)_2rem] items-center gap-2 rounded-lg px-1 transition-colors ${selectedFilter === "complete" ? "bg-emerald-50" : "hover:bg-slate-50"}`}>
            <span className="text-center text-slate-600">Ya desayunaron</span>
            <strong className="text-center font-bold tabular-nums text-[#087447]">{served}</strong>
          </button>
        </div>
        <div className="flex flex-col items-center justify-center border-l border-slate-200 pl-4 text-center">
          <div aria-label={`${progress}% completado`} className="grid size-[70px] place-items-center rounded-full" style={{ background: `conic-gradient(#087447 ${progress}%, #dfe7e2 0)` }}>
            <div className="grid size-[54px] place-items-center rounded-full bg-white text-lg font-bold tabular-nums text-slate-950">{progress}%</div>
          </div>
          <p className="mt-2 whitespace-nowrap text-xs font-bold tabular-nums text-slate-900">{served} de {expected} registrados</p>
          <p className="mt-0.5 text-[10px] leading-tight text-slate-500">Progreso del desayuno</p>
        </div>
      </div>

      <div className="hidden sm:grid lg:grid-cols-[1.55fr_repeat(3,minmax(0,1fr))] lg:divide-x lg:divide-slate-100">
        <div className="flex items-center gap-4 border-b border-slate-100 px-4 py-4 sm:px-5 lg:border-b-0 lg:py-5">
          <div aria-label={`${progress}% completado`} className="grid size-[74px] shrink-0 place-items-center rounded-full sm:size-[82px]" style={{ background: `conic-gradient(#087447 ${progress}%, #e5ebe7 0)` }}>
            <div className="grid size-[58px] place-items-center rounded-full bg-white text-lg font-bold tabular-nums text-slate-950 sm:size-16 sm:text-xl">{progress}%</div>
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold text-slate-950 sm:text-base">Progreso del desayuno</h2>
            <p className="mt-1 text-sm tabular-nums text-slate-500">{served} de {expected} pasajeros registrados</p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden>
              <span className="block h-full rounded-full bg-[#087447] transition-[width] duration-300" style={{ width: `${progress}%` }} />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-3 divide-x divide-slate-100 lg:col-span-3 lg:divide-x">
          <button type="button" onClick={() => onSelectFilter("all")} aria-pressed={selectedFilter === "all"} className={`min-w-0 px-2 py-3 text-center transition-colors sm:px-4 lg:flex lg:items-center lg:justify-center lg:gap-3 lg:text-left ${selectedFilter === "all" ? "bg-slate-50" : "hover:bg-slate-50"}`}>
            <p className="text-xl font-bold tabular-nums text-slate-950 sm:text-2xl">{rooms}</p>
            <p className="mt-0.5 text-[11px] font-medium leading-tight text-slate-500 sm:text-xs lg:mt-0">Habitaciones<br className="hidden lg:block" /> de hoy</p>
          </button>
          <button type="button" onClick={() => onSelectFilter("pending")} aria-pressed={selectedFilter === "pending"} className={`min-w-0 px-2 py-3 text-center transition-colors sm:px-4 lg:flex lg:items-center lg:justify-center lg:gap-3 lg:text-left ${selectedFilter === "pending" ? "bg-amber-50" : "hover:bg-slate-50"}`}>
            <p className="text-xl font-bold tabular-nums text-amber-700 sm:text-2xl">{pending}</p>
            <p className="mt-0.5 text-[11px] font-medium leading-tight text-slate-500 sm:text-xs lg:mt-0">Desayunos<br className="hidden lg:block" /> pendientes</p>
          </button>
          <button type="button" onClick={() => onSelectFilter("complete")} aria-pressed={selectedFilter === "complete"} className={`min-w-0 px-2 py-3 text-center transition-colors sm:px-4 lg:flex lg:items-center lg:justify-center lg:gap-3 lg:text-left ${selectedFilter === "complete" ? "bg-emerald-50" : "hover:bg-slate-50"}`}>
            <p className="text-xl font-bold tabular-nums text-[#087447] sm:text-2xl">{served}</p>
            <p className="mt-0.5 text-[11px] font-medium leading-tight text-slate-500 sm:text-xs lg:mt-0">Ya<br className="hidden lg:block" /> desayunaron</p>
          </button>
        </div>
      </div>
    </section>
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
  const [roomFilter, setRoomFilter] = useState<BreakfastRoomFilter>("pending");
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

  function selectRoomFilter(filter: BreakfastRoomFilter) {
    setRoomFilter(filter);
    setActiveTab("rooms");
  }

  return (
    <div>
      {error && <div className="mb-4"><ErrorBanner message={error} onDismiss={() => setError("")} /></div>}
      {loading ? <LoadingBlock label="Cargando el día…" /> : breakfast && inventory ? (
        <>
          <DaySummary day={breakfast} selectedFilter={roomFilter} onSelectFilter={selectRoomFilter} />

          <nav role="tablist" aria-label="Secciones del día" className="mt-4 sm:mt-5">
            <div className="grid grid-cols-3 border-b border-slate-200 sm:gap-2 sm:border-b-0">
              {TABS.map((tab) => (
                <button key={tab.id} type="button" id={`tab-${tab.id}`} role="tab"
                  aria-selected={activeTab === tab.id} aria-controls={`panel-${tab.id}`}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex min-h-12 min-w-0 items-center justify-center gap-1.5 border-b-2 px-1 text-sm font-semibold transition-colors sm:gap-2 sm:rounded-xl sm:border-b-0 sm:px-2 ${activeTab === tab.id ? "border-[#087447] text-[#087447] sm:bg-[#087447] sm:text-white sm:shadow-[0_4px_12px_rgba(8,116,71,0.18)]" : "border-transparent text-slate-600 hover:text-slate-900 sm:bg-[#e9f0eb] sm:text-pine-800 sm:hover:bg-pine-200"}`}>
                  {tab.label}
                  {tab.id === "rooms" && breakfast.stays.length > 0 && (
                    <span className={`hidden rounded-full px-1.5 py-0.5 text-xs tabular-nums sm:inline-flex ${activeTab === tab.id ? "bg-white text-pine-800" : "bg-white/70 text-pine-700"}`}>{breakfast.stays.length}</span>
                  )}
                </button>
              ))}
            </div>
          </nav>

          <section id="panel-rooms" role="tabpanel" aria-labelledby="tab-rooms" hidden={activeTab !== "rooms"} className="mt-4">
            <RoomsPanel day={breakfast} filter={roomFilter} onFilterChange={setRoomFilter} savingIds={savingIds} onCount={changeCount} />
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

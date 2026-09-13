import { useEffect, useMemo, useRef, useState } from "react";
import type { InventoryItem } from "../../shared/types";
import { ErrorBanner } from "../components/Feedback";
import { api, errorMessage } from "../lib/api";

type Draft = { received: string; remaining: string };

const displayQuantity = (value: number | null) => value === null ? "" : String(value);
const parseQuantity = (value: string): number | null => value.trim() === "" ? null : Number(value.replace(",", "."));

export function InventorySection({ date, items, onProductsChanged }: {
  date: string;
  items: InventoryItem[];
  onProductsChanged: () => void;
}) {
  const [drafts, setDrafts] = useState<Record<number, Draft>>(() => Object.fromEntries(
    items.map((item) => [item.productId, {
      received: displayQuantity(item.receivedQuantity), remaining: displayQuantity(item.remainingQuantity),
    }]),
  ));
  const [saving, setSaving] = useState<Set<number>>(new Set());
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  useEffect(() => () => { timers.current.forEach(clearTimeout); }, []);

  const status = useMemo(() => saving.size > 0 ? "Guardando…" : saved ? "Guardado" : "", [saved, saving]);

  function change(productId: number, field: keyof Draft, value: string) {
    const next = { ...(drafts[productId] ?? { received: "", remaining: "" }), [field]: value };
    setDrafts((current) => ({ ...current, [productId]: next }));
    setSaving((current) => new Set(current).add(productId));
    setSaved(false);
    setError("");
    const existing = timers.current.get(productId);
    if (existing) clearTimeout(existing);
    timers.current.set(productId, setTimeout(() => void save(productId, next), 800));
  }

  async function save(productId: number, draft: Draft) {
    const received = parseQuantity(draft.received);
    const remaining = parseQuantity(draft.remaining);
    if ((received !== null && (!Number.isFinite(received) || received < 0)) ||
      (remaining !== null && (!Number.isFinite(remaining) || remaining < 0))) {
      setSaving((current) => { const next = new Set(current); next.delete(productId); return next; });
      setError("Usá cantidades positivas, por ejemplo 2 o 1,5.");
      return;
    }
    try {
      await api.setInventory(date, productId, received, remaining);
      setSaved(true);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving((current) => { const next = new Set(current); next.delete(productId); return next; });
    }
  }

  function flush(productId: number, draft: Draft) {
    const existing = timers.current.get(productId);
    if (!existing) return;
    clearTimeout(existing);
    timers.current.delete(productId);
    void save(productId, draft);
  }

  return (
    <section aria-labelledby="stock-title" className="rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3.5 sm:px-5">
        <div>
          <h2 id="stock-title" className="text-base font-semibold tracking-tight text-pine-950">Stock diario</h2>
          <p className="mt-0.5 text-xs text-slate-500">Se guarda automáticamente</p>
        </div>
        <span className="h-px flex-1 bg-slate-100" aria-hidden />
        <span role="status" className={`text-xs font-medium ${saving.size ? "text-slate-400" : "text-pine-700"}`}>{status}</span>
      </div>
      {error && <div className="p-3"><ErrorBanner message={error} onDismiss={() => setError("")} /></div>}
      <div className="grid grid-cols-[minmax(8rem,1fr)_5.5rem_5.5rem] items-end gap-2 border-b border-slate-100 bg-slate-50/70 px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-slate-400 sm:grid-cols-[minmax(12rem,1fr)_8rem_8rem] sm:px-5">
        <span>Producto</span><span className="text-center">Ingresó</span><span className="text-center">Stock</span>
      </div>
      <div className="divide-y divide-slate-100">{items.map((item) => {
        const draft = drafts[item.productId] ?? { received: "", remaining: "" };
        return (
          <div key={item.productId} className="grid grid-cols-[minmax(8rem,1fr)_5.5rem_5.5rem] items-center gap-2 px-3 py-2.5 sm:grid-cols-[minmax(12rem,1fr)_8rem_8rem] sm:px-5">
            <label htmlFor={`received-${item.productId}`} className="min-w-0 pr-1 text-sm font-medium leading-tight text-slate-800">{item.name}{item.unit && <span className="mt-0.5 block text-xs font-normal text-slate-400">{item.unit}</span>}</label>
            <input id={`received-${item.productId}`} aria-label={`${item.name}, cantidad ingresada`} inputMode="decimal" value={draft.received} onChange={(event) => change(item.productId, "received", event.target.value)} onBlur={() => flush(item.productId, draft)} className="stock-input" placeholder="—" />
            <input aria-label={`${item.name}, stock restante`} inputMode="decimal" value={draft.remaining} onChange={(event) => change(item.productId, "remaining", event.target.value)} onBlur={() => flush(item.productId, draft)} className="stock-input" placeholder="—" />
          </div>
        );
      })}</div>
      <details className="border-t border-slate-100">
        <summary className="cursor-pointer px-4 py-3.5 text-sm font-semibold text-pine-700 transition-colors hover:bg-slate-50 sm:px-5">Administrar productos</summary>
        <div className="border-t border-slate-100 p-4 sm:p-5"><ProductManager onChanged={onProductsChanged} /></div>
      </details>
    </section>
  );
}

import { ProductManager } from "./ProductManager";

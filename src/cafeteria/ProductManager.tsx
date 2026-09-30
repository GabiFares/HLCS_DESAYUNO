import { Fragment, useEffect, useRef, useState } from "react";
import type { Product } from "../../shared/types";
import { ErrorBanner, LoadingBlock } from "../components/Feedback";
import { FormField } from "../components/FormField";
import { api, errorMessage } from "../lib/api";

const DRAG_THRESHOLD = 6;

const productNameError = (value: string): string | undefined => {
  const clean = value.trim();
  if (!clean) return "Ingresá el nombre del producto.";
  if (clean.length > 100) return "El nombre no puede superar 100 caracteres.";
  return undefined;
};

const unitError = (value: string): string | undefined => {
  if (value.trim().length > 20) return "La unidad no puede superar 20 caracteres.";
  return undefined;
};

interface DragGesture {
  pointerId: number;
  id: number;
  fromIndex: number;
  x: number;
  y: number;
  phase: "pending" | "dragging";
  type: string;
  timer: number;
}

function RowMenu({ name, index, total, onMove, onDelete }: {
  name: string;
  index: number;
  total: number;
  onMove: (index: number, offset: -1 | 1) => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div ref={root} className="relative shrink-0">
      <button type="button" aria-haspopup="menu" aria-expanded={open}
        aria-label={`Acciones para ${name}`} onClick={() => setOpen((value) => !value)}
        className="mini-button">⋯</button>
      {open && (
        <div role="menu" aria-label={`Acciones para ${name}`}
          className="absolute right-0 top-full z-30 mt-1 w-52 rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
          <button role="menuitem" type="button" disabled={index === 0}
            onClick={() => { setOpen(false); onMove(index, -1); }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40">
            <span aria-hidden className="text-slate-400">↑</span> Mover arriba
          </button>
          <button role="menuitem" type="button" disabled={index === total - 1}
            onClick={() => { setOpen(false); onMove(index, 1); }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40">
            <span aria-hidden className="text-slate-400">↓</span> Mover abajo
          </button>
          <div role="separator" aria-orientation="horizontal" className="my-1 h-px bg-slate-100" />
          <button role="menuitem" type="button" onClick={() => { setOpen(false); onDelete(); }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-red-700 hover:bg-red-50">
            <svg aria-hidden className="size-4 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" /></svg>
            Eliminar…
          </button>
        </div>
      )}
    </div>
  );
}

export function ProductManager({ onChanged }: { onChanged: () => void }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [addNameError, setAddNameError] = useState("");
  const [addUnitError, setAddUnitError] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editUnit, setEditUnit] = useState("");
  const [editError, setEditError] = useState("");
  const [dragId, setDragId] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const gestureRef = useRef<DragGesture | null>(null);
  const rowsRef = useRef<{ mid: number }[]>([]);
  const frameRef = useRef(0);
  const pendingYRef = useRef(0);
  const productsRef = useRef<Product[]>([]);

  useEffect(() => {
    let active = true;
    void api.products().then((response) => {
      if (active) setProducts(response.products);
    }).catch((caught: unknown) => {
      if (active) setError(errorMessage(caught));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    productsRef.current = products;
  });

  async function load() {
    try { setProducts((await api.products()).products); }
    catch (caught) { setError(errorMessage(caught)); }
    finally { setLoading(false); }
  }

  async function add(event: React.FormEvent) {
    event.preventDefault();
    const nameMsg = productNameError(name);
    const unitMsg = unitError(unit);
    setAddNameError(nameMsg ?? "");
    setAddUnitError(unitMsg ?? "");
    if (nameMsg || unitMsg) return;
    try {
      const response = await api.createProduct(name.trim(), unit.trim() || null);
      setProducts((current) => [...current, response.product]);
      setName(""); setUnit(""); onChanged();
    } catch (caught) { setError(errorMessage(caught)); }
  }

  async function toggle(product: Product) {
    try {
      const response = await api.updateProduct(product.id, { active: !product.active });
      setProducts((current) => current.map((item) => item.id === product.id ? response.product : item));
      onChanged();
    } catch (caught) { setError(errorMessage(caught)); }
  }

  function confirmDelete(product: Product) {
    const confirmed = window.confirm(
      `¿Eliminar «${product.name}»?\n\nSe quitará del registro diario. Su historial se conserva y podés activarlo de nuevo desde esta vista.`,
    );
    if (confirmed) void toggle(product);
  }

  function beginEdit(product: Product) {
    setEditing(product.id); setEditName(product.name); setEditUnit(product.unit ?? ""); setEditError("");
  }

  async function saveEdit(product: Product) {
    const nameMsg = productNameError(editName);
    const unitMsg = unitError(editUnit);
    const message = nameMsg ?? unitMsg;
    if (message) { setEditError(message); return; }
    setEditError("");
    try {
      const response = await api.updateProduct(product.id, { name: editName.trim(), unit: editUnit.trim() || null });
      setProducts((current) => current.map((item) => item.id === product.id ? response.product : item));
      setEditing(null); onChanged();
    } catch (caught) { setError(errorMessage(caught)); }
  }

  async function move(index: number, offset: -1 | 1) {
    const target = index + offset;
    if (target < 0 || target >= products.length) return;
    const reordered = [...products];
    const current = reordered[index];
    const other = reordered[target];
    if (!current || !other) return;
    reordered[index] = other; reordered[target] = current;
    setProducts(reordered);
    try { await api.reorderProducts(reordered.map((product) => product.id)); setError(""); onChanged(); }
    catch (caught) { setError(errorMessage(caught)); void load(); }
  }

  function measureRows() {
    rowsRef.current = [...document.querySelectorAll<HTMLElement>("[data-product-id]")].map((row) => {
      const rect = row.getBoundingClientRect();
      return { mid: rect.top + rect.height / 2 };
    });
  }

  function beginGesture(event: React.PointerEvent<HTMLElement>, product: Product) {
    if (gestureRef.current || event.button !== 0 || !event.isPrimary) return;
    const target = event.target as HTMLElement;
    if (target.closest("button, input, textarea, a, [role=menu]")) return;
    const gesture: DragGesture = {
      pointerId: event.pointerId, id: product.id, fromIndex: -1,
      x: event.clientX, y: event.clientY, phase: "pending", type: event.pointerType, timer: 0,
    };
    if (event.pointerType === "touch") {
      gesture.timer = window.setTimeout(() => {
        if (gestureRef.current === gesture && gesture.phase === "pending") {
          gesture.phase = "dragging";
          startRef.current(gesture);
        }
      }, 280);
    }
    gestureRef.current = gesture;
    pendingYRef.current = event.clientY;
  }

  function startDrag(gesture: DragGesture) {
    const fromIndex = productsRef.current.findIndex((item) => item.id === gesture.id);
    if (fromIndex === -1) { cancelGesture(); return; }
    gesture.fromIndex = fromIndex;
    measureRows();
    document.documentElement.classList.add("select-none");
    setDragId(gesture.id);
    setDropIndex(null);
  }

  function updateDrop() {
    const gesture = gestureRef.current;
    if (!gesture || gesture.phase !== "dragging") return;
    const y = pendingYRef.current;
    if (y < 72) window.scrollBy(0, -12);
    if (y > window.innerHeight - 72) window.scrollBy(0, 12);
    measureRows();
    const boundary = rowsRef.current.filter((row) => row.mid < y).length;
    const finalIndex = boundary > gesture.fromIndex ? boundary - 1 : boundary;
    setDropIndex(finalIndex === gesture.fromIndex ? null : boundary);
  }

  async function finishDrag(gesture: DragGesture) {
    const y = pendingYRef.current;
    const boundary = rowsRef.current.filter((row) => row.mid < y).length;
    const finalIndex = boundary > gesture.fromIndex ? boundary - 1 : boundary;
    cancelGesture();

    const list = productsRef.current;
    const dragged = list[gesture.fromIndex];
    if (!dragged || finalIndex === gesture.fromIndex) return;
    const next = list.filter((item) => item.id !== dragged.id);
    next.splice(finalIndex, 0, dragged);
    const ids = next.map((item) => item.id);
    if (ids.every((id, index) => list[index]?.id === id)) return;
    setProducts(next);
    try {
      await api.reorderProducts(ids);
      setError("");
      onChanged();
    } catch (caught) {
      setError(errorMessage(caught));
      void load();
    }
  }

  function cancelGesture() {
    const gesture = gestureRef.current;
    if (gesture) gestureRef.current = null;
    window.clearTimeout(gesture?.timer);
    if (frameRef.current) { window.cancelAnimationFrame(frameRef.current); frameRef.current = 0; }
    document.documentElement.classList.remove("select-none");
    setDragId(null);
    setDropIndex(null);
  }

  const beginRef = useRef((event: React.PointerEvent<HTMLElement>, product: Product) => beginGesture(event, product));
  const startRef = useRef((gesture: DragGesture) => startDrag(gesture));
  const updateRef = useRef(() => updateDrop());
  const finishRef = useRef((gesture: DragGesture) => { void finishDrag(gesture); });
  const cancelRef = useRef(() => cancelGesture());
  useEffect(() => {
    beginRef.current = beginGesture;
    startRef.current = startDrag;
    updateRef.current = updateDrop;
    finishRef.current = (gesture) => { void finishDrag(gesture); };
    cancelRef.current = cancelGesture;
  });

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const gesture = gestureRef.current;
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      if (gesture.phase === "pending") {
        const distance = Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y);
        if (gesture.type === "touch") {
          if (distance > 8) cancelRef.current();
          return;
        }
        if (distance < DRAG_THRESHOLD) return;
        gesture.phase = "dragging";
        startRef.current(gesture);
      }
      event.preventDefault();
      pendingYRef.current = event.clientY;
      if (frameRef.current) return;
      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = 0;
        updateRef.current();
      });
    };
    const onUp = (event: PointerEvent) => {
      const gesture = gestureRef.current;
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      if (gesture.phase === "dragging" && event.type === "pointerup") finishRef.current(gesture);
      else cancelRef.current();
    };
    const onTouchMove = (event: TouchEvent) => {
      if (gestureRef.current?.phase === "dragging") event.preventDefault();
    };
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("touchmove", onTouchMove);
      if (frameRef.current) window.cancelAnimationFrame(frameRef.current);
    };
  }, []);

  const dragIndex = dragId !== null ? products.findIndex((item) => item.id === dragId) : -1;
  const draggedProduct = dragIndex >= 0 ? products[dragIndex] : null;
  const targetIndex = dragIndex >= 0 && dropIndex !== null
    ? (dropIndex > dragIndex ? dropIndex - 1 : dropIndex)
    : dragIndex;

  if (loading) return <LoadingBlock label="Cargando productos…" />;
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold tracking-tight text-pine-950">Administrar productos</h2>
        <p className="section-caption mt-0.5">Configurá qué productos aparecen en el registro diario y en qué orden.</p>
      </div>
      {error && <ErrorBanner message={error} onDismiss={() => setError("")} />}
      <form onSubmit={add} noValidate className="grid grid-cols-[minmax(0,1fr)_6.5rem_auto] items-start gap-2">
        <FormField label="Nombre del producto" htmlFor="pm-new-name" error={addNameError}>
          {(className) => (
            <input id="pm-new-name" maxLength={100} value={name} autoComplete="off"
              aria-invalid={Boolean(addNameError)}
              aria-describedby={addNameError ? "pm-new-name-error" : undefined}
              onChange={(event) => { setName(event.target.value); setAddNameError(""); }}
              className={`${className} ${addNameError ? "field-invalid" : ""}`}
              placeholder="Nuevo producto" />
          )}
        </FormField>
        <FormField label="Unidad" htmlFor="pm-new-unit" error={addUnitError}>
          {(className) => (
            <input id="pm-new-unit" maxLength={20} value={unit}
              aria-invalid={Boolean(addUnitError)}
              aria-describedby={addUnitError ? "pm-new-unit-error" : undefined}
              onChange={(event) => { setUnit(event.target.value); setAddUnitError(""); }}
              className={`${className} ${addUnitError ? "field-invalid" : ""}`}
              placeholder="Unidad" />
          )}
        </FormField>
        <button className="btn-primary min-w-12 px-3" aria-label="Agregar producto">＋</button>
      </form>
      {dragId !== null && draggedProduct && (
        <>
          <div aria-live="assertive" className="sr-only">
            Moviendo {draggedProduct.name} a la posición {targetIndex + 1} de {products.length}.
          </div>
          <div aria-hidden className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
            <span className="rounded-full bg-pine-900/95 px-4 py-2 text-sm font-medium text-white shadow-lg">
              {draggedProduct.name} · posición {targetIndex + 1} de {products.length}
            </span>
          </div>
        </>
      )}
      <div className="overflow-hidden rounded-xl border border-slate-200">{products.map((product, index) => {
        const isDragged = dragId === product.id;
        return (
          <Fragment key={product.id}>
            {dropIndex === index && <div aria-hidden className="h-0.5 bg-pine-500" />}
            <div data-product-id={product.id}
              onPointerDown={(event) => beginGesture(event, product)}
              className={`flex min-h-14 items-center gap-1.5 border-b border-slate-100 p-3 last:border-b-0 ${product.active ? "" : "bg-slate-50 text-slate-500"} ${isDragged ? "opacity-40" : "cursor-grab active:cursor-grabbing"}`}>
              {editing === product.id ? <div className="grid w-full grid-cols-[1fr_5.5rem] gap-2">
                <input aria-label="Nombre" maxLength={100} value={editName}
                  aria-invalid={Boolean(editError)}
                  aria-describedby={editError ? "pm-edit-error" : undefined}
                  onChange={(event) => { setEditName(event.target.value); setEditError(""); }}
                  className={`field min-h-10 py-2 ${editError ? "field-invalid" : ""}`} />
                <input aria-label="Unidad" maxLength={20} value={editUnit}
                  onChange={(event) => { setEditUnit(event.target.value); setEditError(""); }}
                  className="field min-h-10 py-2" />
                {editError && <p id="pm-edit-error" role="alert" className="col-span-2 field-error">{editError}</p>}
                <div className="col-span-2 flex gap-2">
                  <button type="button" onClick={() => void saveEdit(product)} className="btn-primary min-h-10 flex-1">Guardar</button>
                  <button type="button" onClick={() => setEditing(null)} className="btn-secondary min-h-10 flex-1">Cancelar</button>
                </div>
              </div> : (
                <>
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-slate-800">{product.name}</p><p className="text-xs text-slate-400">{product.unit || "Sin unidad"} · {product.active ? "Activo" : "Inactivo"}</p></div>
                  <RowMenu name={product.name} index={index} total={products.length} onMove={move} onDelete={() => confirmDelete(product)} />
                  <button type="button" onClick={() => beginEdit(product)} className="mini-button" aria-label={`Editar ${product.name}`} title={`Editar ${product.name}`}>✎</button>
                  <button type="button" onClick={() => void toggle(product)} className="min-h-9 rounded-md px-2 text-xs font-semibold text-pine-700 hover:bg-pine-50"
                    aria-label={product.active ? `Ocultar ${product.name}` : `Activar ${product.name}`}
                    title={product.active ? `Ocultar ${product.name}` : `Activar ${product.name}`}>
                    {product.active ? "Ocultar" : "Activar"}
                  </button>
                </>
              )}
            </div>
          </Fragment>
        );
      })}
        {dropIndex === products.length && <div aria-hidden className="h-0.5 bg-pine-500" />}
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import type { Product } from "../../shared/types";
import { ErrorBanner, LoadingBlock } from "../components/Feedback";
import { api, errorMessage } from "../lib/api";

export function ProductManager({ onChanged }: { onChanged: () => void }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editUnit, setEditUnit] = useState("");

  async function load() {
    try { setProducts((await api.products()).products); setError(""); }
    catch (caught) { setError(errorMessage(caught)); }
    finally { setLoading(false); }
  }
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

  async function add(event: React.FormEvent) {
    event.preventDefault();
    try {
      const response = await api.createProduct(name, unit.trim() || null);
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

  function beginEdit(product: Product) { setEditing(product.id); setEditName(product.name); setEditUnit(product.unit ?? ""); }
  async function saveEdit(product: Product) {
    try {
      const response = await api.updateProduct(product.id, { name: editName, unit: editUnit.trim() || null });
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
    try { await api.reorderProducts(reordered.map((product) => product.id)); onChanged(); }
    catch (caught) { setError(errorMessage(caught)); void load(); }
  }

  if (loading) return <LoadingBlock label="Cargando productos…" />;
  return (
    <div className="space-y-4">
      {error && <ErrorBanner message={error} onDismiss={() => setError("")} />}
      <form onSubmit={add} className="grid grid-cols-[1fr_6rem_auto] gap-2">
        <label><span className="sr-only">Nombre del producto</span><input required value={name} onChange={(event) => setName(event.target.value)} className="field" placeholder="Nuevo producto" /></label>
        <label><span className="sr-only">Unidad</span><input value={unit} onChange={(event) => setUnit(event.target.value)} className="field" placeholder="Unidad" /></label>
        <button className="btn-primary min-w-12 px-3" aria-label="Agregar producto">＋</button>
      </form>
      <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">{products.map((product, index) => (
        <div key={product.id} className={`p-3 ${product.active ? "" : "bg-slate-50 text-slate-500"}`}>
          {editing === product.id ? <div className="grid grid-cols-[1fr_5.5rem] gap-2"><input aria-label="Nombre" value={editName} onChange={(event) => setEditName(event.target.value)} className="field min-h-10 py-2" /><input aria-label="Unidad" value={editUnit} onChange={(event) => setEditUnit(event.target.value)} className="field min-h-10 py-2" /><div className="col-span-2 flex gap-2"><button type="button" onClick={() => void saveEdit(product)} className="btn-primary flex-1 min-h-10">Guardar</button><button type="button" onClick={() => setEditing(null)} className="btn-secondary flex-1 min-h-10">Cancelar</button></div></div> : (
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-slate-800">{product.name}</p><p className="text-xs text-slate-400">{product.unit || "Sin unidad"} · {product.active ? "Activo" : "Inactivo"}</p></div>
              <button type="button" disabled={index === 0} onClick={() => void move(index, -1)} className="mini-button" aria-label={`Subir ${product.name}`}>↑</button>
              <button type="button" disabled={index === products.length - 1} onClick={() => void move(index, 1)} className="mini-button" aria-label={`Bajar ${product.name}`}>↓</button>
              <button type="button" onClick={() => beginEdit(product)} className="mini-button" aria-label={`Editar ${product.name}`}>✎</button>
              <button type="button" onClick={() => void toggle(product)} className="min-h-9 rounded-lg px-2 text-xs font-semibold text-pine-700 hover:bg-pine-50">{product.active ? "Ocultar" : "Activar"}</button>
            </div>
          )}
        </div>
      ))}</div>
    </div>
  );
}

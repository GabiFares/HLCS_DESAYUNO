import { useState } from "react";
import { api, errorMessage } from "../lib/api";
import type { ImportPreview, PlanItem } from "../../shared/desbravador/types";

interface ImportModalProps {
  open: boolean;
  onClose: () => void;
  onApplied: () => void;
}

function PlanRow({ item }: { item: PlanItem }) {
  const changes: string[] = [];
  if (item.changes.guestCount) changes.push(`PAX: ${item.changes.guestCount.from} → ${item.changes.guestCount.to}`);
  if (item.changes.checkOutDate) changes.push(`Check-out: ${item.changes.checkOutDate.from} → ${item.changes.checkOutDate.to}`);
  return (
                <div className="flex flex-col gap-1 rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm">
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-semibold text-pine-900">Hab. {item.roomNumber}</span>
                      <span className="text-xs text-slate-500">{item.checkInDate ?? "—"}</span>
                      <span className="text-xs text-slate-500">→ {item.checkOutDate ?? "—"}</span>
                      <span className="text-xs text-slate-500">{item.guestCount !== null ? `${item.guestCount} PAX` : "—"}</span>
                    </div>
                    {item.operation && <span className="text-[11px] uppercase tracking-wide text-slate-500">{item.operation}</span>}
                  </div>
                  {changes.length > 0 && <p className="text-xs text-amber-700">{changes.join(" • ")}</p>}
                  {item.reason && <p className="text-xs text-red-700">{item.reason}</p>}
                </div>
  );
}

export function ImportModal({ open, onClose, onApplied }: ImportModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [applied, setApplied] = useState(false);
  const [result, setResult] = useState<{ create: number; update: number; unchanged: number; review: number; ignored: number } | null>(null);

  if (!open) return null;

  async function doPreview(nextFile: File | null) {
    if (!nextFile) {
      setPreview(null);
      return;
    }
    setFile(nextFile);
    setBusy(true);
    setError("");
    try {
      const res = await api.previewDesbravador(nextFile);
      setPreview(res);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function doApply() {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const res = await api.applyDesbravador(file);
      setResult(res);
      setApplied(true);
      onApplied();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  function close() {
    setFile(null);
    setPreview(null);
    setBusy(false);
    setError("");
    setApplied(false);
    setResult(null);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-pine-950/40 px-4">
      <div role="dialog" aria-modal="true" className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-slate-200 bg-[#f7f8f7] shadow-2xl">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-[#f7f8f7]/95 px-5 py-4 backdrop-blur sm:px-6">
          <h2 className="text-base font-semibold text-pine-900 sm:text-lg">Importar reservas de Desbravador</h2>
          <button type="button" onClick={close} className="grid size-10 place-items-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-pine-900" aria-label="Cerrar">×</button>
        </header>

        <div className="space-y-6 px-5 py-6 sm:px-7 sm:py-7">
          {!applied ? (
            <>
              <div className="space-y-2.5">
                <label className="block text-sm font-medium text-pine-900">Archivo PDF</label>
                <input type="file" accept="application/pdf,.pdf" onChange={(event) => void doPreview(event.target.files?.[0] ?? null)} className="block w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm shadow-sm transition-colors file:mr-3 file:rounded-lg file:border-0 file:bg-pine-800 file:px-3 file:py-1.5 file:text-white file:hover:bg-pine-900 focus:border-pine-600 focus:ring-2 focus:ring-pine-600/15 focus:outline-none disabled:opacity-60" disabled={busy} />
                <p className="text-xs text-slate-500">Solo el “Informe Detalle Diario de Ocupación”. Los datos se procesan localmente en el servidor.</p>
              </div>

              {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-800">{error}</div>}

              {preview && (
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-emerald-800">Crear: {preview.counts.create}</span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2.5 py-0.5 text-sky-800">Actualizar: {preview.counts.update}</span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-slate-800">Sin cambios: {preview.counts.unchanged}</span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-amber-800">Revisar: {preview.counts.review}</span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-0.5 text-zinc-800">Ignoradas: {preview.counts.ignored}</span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-slate-600">{preview.pageCount} págs • {Math.round(preview.fileSize / 1024)} KB</span>
                  </div>

                  {preview.create.length > 0 && (
                    <section className="space-y-2">
                      <h3 className="text-sm font-semibold text-pine-900">Nuevas estadías</h3>
                      <div className="space-y-1.5">
                        {preview.create.map((item, i) => <PlanRow key={`${item.roomNumber}-${item.checkInDate}-${i}`} item={item} />)}
                      </div>
                    </section>
                  )}
                  {preview.update.length > 0 && (
                    <section className="space-y-2">
                      <h3 className="text-sm font-semibold text-pine-900">Actualizaciones</h3>
                      <div className="space-y-1.5">
                        {preview.update.map((item, i) => <PlanRow key={`${item.roomNumber}-${item.checkInDate}-${i}`} item={item} />)}
                      </div>
                    </section>
                  )}
                  {preview.review.length > 0 && (
                    <section className="space-y-2">
                      <h3 className="text-sm font-semibold text-pine-900">Para revisar</h3>
                      <div className="space-y-1.5">
                        {preview.review.map((item, i) => <PlanRow key={`${item.roomNumber}-${item.checkInDate}-${i}`} item={item} />)}
                      </div>
                    </section>
                  )}

                  <div className="flex flex-wrap justify-end gap-2 pt-2">
                    <button type="button" onClick={() => { setPreview(null); setFile(null); }} className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-pine-900 shadow-sm transition-colors hover:bg-slate-50 disabled:opacity-60" disabled={busy}>Cancelar</button>
                    <button type="button" onClick={() => void doApply()} className="rounded-xl bg-pine-800 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-pine-900 disabled:opacity-60" disabled={busy}>
                      {busy ? "Aplicando…" : "Confirmar e importar"}
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
                <div className="space-y-4">
                  <h3 className="text-base font-semibold text-pine-900 sm:text-lg">Importación completada</h3>
                  {result && (
                    <div className="flex flex-wrap gap-2 text-sm">
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-emerald-800 shadow-sm">Creadas: {result.create}</span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2.5 py-0.5 text-sky-800 shadow-sm">Actualizadas: {result.update}</span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-slate-800 shadow-sm">Sin cambios: {result.unchanged}</span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-amber-800 shadow-sm">Revisar: {result.review}</span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-0.5 text-zinc-800 shadow-sm">Ignoradas: {result.ignored}</span>
                    </div>
                  )}
              <div className="flex justify-end">
                <button type="button" onClick={close} className="rounded-xl bg-pine-800 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-pine-900">Cerrar</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

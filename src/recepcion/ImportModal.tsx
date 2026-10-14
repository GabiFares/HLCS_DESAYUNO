import { useCallback, useEffect, useRef, useState } from "react";
import type { ImportCounts, ImportPreview, ImportResult, PlanItem } from "../../shared/desbravador/types";
import { ErrorBanner } from "../components/Feedback";
import { api, errorMessage } from "../lib/api";
import { formatDate } from "../lib/dates";

interface ImportModalProps {
  open: boolean;
  onClose: () => void;
  onApplied: () => void | Promise<void>;
}

type BusyState = "preview" | "apply" | null;

const COUNT_STYLES = {
  create: "border-emerald-200 bg-emerald-50 text-emerald-800",
  update: "border-sky-200 bg-sky-50 text-sky-800",
  unchanged: "border-slate-200 bg-slate-50 text-slate-700",
  review: "border-amber-200 bg-amber-50 text-amber-800",
  ignored: "border-zinc-200 bg-zinc-50 text-zinc-700",
} as const;

function CountSummary({ counts, applied }: { counts: ImportCounts; applied?: boolean }) {
  const items = [
    { id: "create", label: applied ? "Creadas" : "A crear", value: counts.create },
    { id: "update", label: applied ? "Actualizadas" : "A actualizar", value: counts.update },
    { id: "unchanged", label: "Sin cambios", value: counts.unchanged },
    { id: "review", label: "Revisión manual", value: counts.review },
    { id: "ignored", label: "Ignoradas", value: counts.ignored },
  ] as const;

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5" aria-label={applied ? "Resultado de la importación" : "Resumen de la vista previa"}>
      {items.map((item) => (
        <div key={item.id} className={`rounded-xl border px-3 py-2.5 ${COUNT_STYLES[item.id]}`}>
          <p className="text-xl font-semibold leading-none tabular-nums">{item.value}</p>
          <p className="mt-1 text-[13px] font-medium leading-tight">{item.label}</p>
        </div>
      ))}
    </div>
  );
}

function displayDate(value: string | null): string {
  return value ? formatDate(value) : "Sin dato";
}

function PlanRow({ item }: { item: PlanItem }) {
  const changes: string[] = [];
  if (item.changes.guestCount) changes.push(`Pasajeros: ${item.changes.guestCount.from} → ${item.changes.guestCount.to}`);
  if (item.changes.checkOutDate) {
    changes.push(`Check-out: ${displayDate(item.changes.checkOutDate.from)} → ${displayDate(item.changes.checkOutDate.to)}`);
  }

  return (
    <article className="min-w-0 rounded-xl border border-slate-200 bg-white p-3.5 text-left">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <h4 className="text-base font-semibold text-pine-900">Habitación {item.roomNumber || "sin asignar"}</h4>
        {item.operation && <span className="max-w-full rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">{item.operation}</span>}
      </div>
      <dl className="mt-3 grid min-w-0 grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-3">
        <div className="min-w-0">
          <dt className="text-xs font-medium text-slate-500">Check-in</dt>
          <dd className="mt-0.5 truncate text-sm tabular-nums text-slate-800">{displayDate(item.checkInDate)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs font-medium text-slate-500">Check-out</dt>
          <dd className="mt-0.5 truncate text-sm tabular-nums text-slate-800">{displayDate(item.checkOutDate)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs font-medium text-slate-500">Pasajeros</dt>
          <dd className="mt-0.5 text-sm tabular-nums text-slate-800">{item.guestCount ?? "Sin dato"}</dd>
        </div>
      </dl>
      {changes.length > 0 && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[13px] leading-snug text-amber-800">{changes.join(" · ")}</p>}
      {item.reason && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-[13px] leading-snug text-red-800">{item.reason}</p>}
    </article>
  );
}

function ReviewNotice({ count, applied = false }: { count: number; applied?: boolean }) {
  if (count === 0) return null;
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-900">
      <strong>{count} {count === 1 ? "registro requiere" : "registros requieren"} revisión manual.</strong>{" "}
      {applied ? "No se importó automáticamente." : "No se importará automáticamente al confirmar."}
    </div>
  );
}

export function ImportModal({ open, onClose, onApplied }: ImportModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [busy, setBusy] = useState<BusyState>(null);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    if (busy) return;
    setFile(null);
    setPreview(null);
    setError("");
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    onClose();
  }, [busy, onClose]);

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [close, open]);

  if (!open) return null;

  function resetSelection() {
    setFile(null);
    setPreview(null);
    setError("");
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function doPreview(nextFile: File | null) {
    setPreview(null);
    setResult(null);
    setError("");
    setFile(nextFile);
    if (!nextFile) return;

    setBusy("preview");
    try {
      const response = await api.previewDesbravador(nextFile);
      setPreview(response);
    } catch (caught) {
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setError(errorMessage(caught));
    } finally {
      setBusy(null);
    }
  }

  async function doApply() {
    if (!file || !preview) return;
    setBusy("apply");
    setError("");
    try {
      const response = await api.applyDesbravador(file);
      setResult(response);
      setPreview(null);
      await onApplied();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(null);
    }
  }

  const title = result ? "Importación completada" : "Importar reservas de Desbravador";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-pine-950/40 sm:items-center sm:px-4 sm:py-6"
      onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-title"
        aria-busy={Boolean(busy)}
        tabIndex={-1}
        className="max-h-[96dvh] w-full min-w-0 max-w-2xl overflow-y-auto overscroll-contain rounded-t-3xl border border-slate-200 bg-[#f7f8f7] shadow-2xl outline-none sm:max-h-[92dvh] sm:rounded-3xl"
      >
        <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-200 bg-[#f7f8f7]/95 px-4 py-3 backdrop-blur sm:px-6 sm:py-4">
          <h2 id="import-title" className="min-w-0 text-base font-semibold leading-tight text-pine-900 sm:text-lg">{title}</h2>
          <button type="button" onClick={close} disabled={Boolean(busy)} className="grid size-11 shrink-0 place-items-center rounded-full text-2xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-pine-900" aria-label="Cerrar">×</button>
        </header>

        <div className="space-y-5 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 sm:px-7 sm:py-7">
          {!result ? (
            <>
              <div className="space-y-2.5">
                <label htmlFor="desbravador-file" className="block text-sm font-medium text-pine-900">Archivo PDF</label>
                <input
                  ref={fileInputRef}
                  id="desbravador-file"
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={(event) => void doPreview(event.target.files?.[0] ?? null)}
                  className="block min-h-12 w-full min-w-0 rounded-xl border border-slate-300 bg-white px-2 py-2 text-sm text-slate-700 shadow-sm transition-colors file:mr-2 file:min-h-9 file:rounded-lg file:border-0 file:bg-pine-800 file:px-3 file:text-sm file:font-semibold file:text-white file:hover:bg-pine-900 focus:border-pine-600 focus:ring-2 focus:ring-pine-600/15 focus:outline-none disabled:opacity-60 sm:px-3"
                  disabled={Boolean(busy)}
                />
                <p className="text-[13px] leading-relaxed text-slate-600">Usá únicamente el “Informe Detalle Diario de Ocupación”. Primero verás una vista previa; nada se importa hasta que confirmes.</p>
              </div>

              {busy === "preview" && (
                <div role="status" className="flex min-h-24 items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-600">
                  <span aria-hidden className="size-5 animate-spin rounded-full border-2 border-pine-200 border-t-pine-700" />
                  Analizando el PDF…
                </div>
              )}

              {error && <ErrorBanner message={error} onDismiss={() => setError("")} />}

              {preview && (
                <div className="space-y-5">
                  <div>
                    <h3 className="text-base font-semibold text-pine-900">Vista previa</h3>
                    <p className="mt-1 break-words text-[13px] text-slate-600">{preview.fileName} · {preview.pageCount} {preview.pageCount === 1 ? "página" : "páginas"} · {Math.max(1, Math.round(preview.fileSize / 1024))} KB</p>
                  </div>

                  <CountSummary counts={preview.counts} />
                  <ReviewNotice count={preview.counts.review} />

                  {preview.create.length > 0 && (
                    <section className="space-y-2" aria-labelledby="import-create-title">
                      <h3 id="import-create-title" className="text-sm font-semibold text-pine-900">Nuevas estadías</h3>
                      <div className="space-y-2">
                        {preview.create.map((item, index) => <PlanRow key={`${item.roomNumber}-${item.checkInDate}-${index}`} item={item} />)}
                      </div>
                    </section>
                  )}
                  {preview.update.length > 0 && (
                    <section className="space-y-2" aria-labelledby="import-update-title">
                      <h3 id="import-update-title" className="text-sm font-semibold text-pine-900">Actualizaciones</h3>
                      <div className="space-y-2">
                        {preview.update.map((item, index) => <PlanRow key={`${item.roomNumber}-${item.checkInDate}-${index}`} item={item} />)}
                      </div>
                    </section>
                  )}
                  {preview.review.length > 0 && (
                    <section className="space-y-2" aria-labelledby="import-review-title">
                      <h3 id="import-review-title" className="text-sm font-semibold text-amber-900">Pendientes de revisión</h3>
                      <div className="space-y-2">
                        {preview.review.map((item, index) => <PlanRow key={`${item.roomNumber}-${item.checkInDate}-${index}`} item={item} />)}
                      </div>
                    </section>
                  )}

                  {preview.counts.ignored > 0 && (
                    <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-[13px] leading-relaxed text-slate-700">
                      {preview.counts.ignored} {preview.counts.ignored === 1 ? "registro será ignorado" : "registros serán ignorados"} porque no corresponde importarlo como estadía.
                    </p>
                  )}

                  {busy === "apply" && (
                    <div role="status" className="flex items-center gap-3 rounded-xl border border-pine-200 bg-pine-50 px-4 py-3 text-sm font-medium text-pine-800">
                      <span aria-hidden className="size-5 animate-spin rounded-full border-2 border-pine-200 border-t-pine-700" />
                      Importando reservas…
                    </div>
                  )}

                  <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
                    <button type="button" onClick={resetSelection} className="btn-secondary min-h-11 w-full sm:w-auto" disabled={Boolean(busy)}>Elegir otro archivo</button>
                    <button type="button" onClick={() => void doApply()} className="btn-primary min-h-11 w-full sm:w-auto" disabled={Boolean(busy)}>
                      {busy === "apply" ? "Importando…" : "Confirmar e importar"}
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="space-y-5">
              <div className="rounded-2xl border border-pine-200 bg-pine-50 px-4 py-4 text-pine-900">
                <p className="text-base font-semibold">Las reservas importables ya fueron procesadas.</p>
                <p className="mt-1 text-sm leading-relaxed text-pine-800">La lista de Recepción se actualizó. Podés revisar el detalle del resultado antes de cerrar.</p>
              </div>
              <CountSummary counts={result} applied />
              <ReviewNotice count={result.review} applied />
              {result.ignored > 0 && (
                <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-700">
                  {result.ignored} {result.ignored === 1 ? "registro quedó ignorado" : "registros quedaron ignorados"} y no modificaron las estadías.
                </p>
              )}
              <div className="flex justify-end pt-1">
                <button type="button" onClick={close} className="btn-primary min-h-11 w-full sm:w-auto">Cerrar</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

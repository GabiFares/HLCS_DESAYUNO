import { useEffect, useRef, useState } from "react";
import { ErrorBanner } from "../components/Feedback";
import { api, errorMessage } from "../lib/api";

export function DailyNote({ date, initialContent }: { date: string; initialContent: string }) {
  const [content, setContent] = useState(initialContent);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  async function save(value: string) {
    try { await api.setNote(date, value); setStatus("Guardado"); }
    catch (caught) { setError(errorMessage(caught)); setStatus(""); }
  }

  function change(value: string) {
    setContent(value); setStatus("Guardando…"); setError("");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(value), 800);
  }

  function flush() {
    if (!timer.current) return;
    clearTimeout(timer.current);
    timer.current = null;
    void save(content);
  }

  return (
    <section aria-labelledby="note-title" className="rounded-xl border border-slate-200 bg-white px-4 py-4 sm:px-5">
      <div className="mb-2 flex items-center gap-3">
        <h2 id="note-title" className="text-base font-semibold tracking-tight text-pine-950">Notas del desayuno</h2>
        <span className="h-px flex-1 bg-slate-100" aria-hidden />
        <span role="status" className={`text-xs font-medium ${status === "Guardando…" ? "text-slate-400" : "text-pine-700"}`}>{status}</span>
      </div>
      {error && <div className="mb-3"><ErrorBanner message={error} onDismiss={() => setError("")} /></div>}
      <label className="block">
        <span className="sr-only">Nota general del día</span>
        <textarea maxLength={5000} rows={4} value={content} onChange={(event) => change(event.target.value)} onBlur={flush} className="field resize-y" placeholder="Escribí aquí faltantes o recordatorios…" />
      </label>
    </section>
  );
}
interface ErrorBannerProps { message: string; onDismiss?: () => void }

export function ErrorBanner({ message, onDismiss }: ErrorBannerProps) {
  return (
    <div role="alert" className="flex items-start justify-between gap-3 rounded-lg border border-red-200 bg-red-50/80 px-3.5 py-2.5 text-sm text-red-800">
      <span>{message}</span>
      {onDismiss && <button type="button" onClick={onDismiss} className="shrink-0 font-semibold text-red-700 underline underline-offset-2 hover:text-red-900">Cerrar</button>}
    </div>
  );
}

export function LoadingBlock({ label = "Cargando…" }: { label?: string }) {
  return <div className="py-12 text-center text-sm text-slate-500" role="status">{label}</div>;
}

export function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center">
      <p className="font-medium text-slate-700">{title}</p>
      <p className="mt-1 text-sm text-slate-500">{detail}</p>
    </div>
  );
}
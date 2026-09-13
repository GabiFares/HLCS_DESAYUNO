export function PageHeader({ eyebrow, title, action }: { eyebrow: string; title: string; action?: React.ReactNode }) {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-6 px-4 py-4 sm:px-6 sm:py-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-pine-700">{eyebrow}</p>
          <h1 className="page-title mt-1">{title}</h1>
        </div>
        {action}
      </div>
    </header>
  );
}
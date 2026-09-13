import { useEffect, useRef, useState } from "react";

export function ExpandableNote({ note, className = "" }: { note: string; className?: string }) {
  const [expanded, setExpanded] = useState(false);
  const [clamped, setClamped] = useState(false);
  const textRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (expanded) return;
    const element = textRef.current;
    if (!element) return;
    const check = () => setClamped(element.scrollHeight > element.clientHeight + 1);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, [note, expanded]);

  return (
    <p className={`mt-1 flex items-start gap-1.5 text-[13px] leading-snug text-slate-600 ${className}`}>
      <svg aria-hidden className="mt-0.5 size-3.5 shrink-0 text-pine-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>
      <span ref={textRef} className={`min-w-0 flex-1 whitespace-pre-line ${expanded ? "" : "line-clamp-2"}`}>{note}</span>
      {clamped && (
        <button type="button" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}
          className="shrink-0 rounded py-0.5 text-[12px] font-semibold text-pine-700 hover:text-pine-900 hover:underline">
          {expanded ? "Ver menos" : "Ver más"}
        </button>
      )}
    </p>
  );
}
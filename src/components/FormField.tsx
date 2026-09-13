import type { ReactNode } from "react";

interface FormFieldProps {
  label: string;
  error?: string;
  hint?: string;
  htmlFor: string;
  required?: boolean;
  children: (className: string) => ReactNode;
}

export function FormField({ label, error, hint, htmlFor, required, children }: FormFieldProps) {
  const invalid = Boolean(error);
  const className = `field ${invalid ? "field-invalid" : ""}`;
  return (
    <div className={error ? "mb-0.5" : ""}>
      <label htmlFor={htmlFor} className="field-label">
        {label}
        {required && <span className="text-red-600" aria-hidden> *</span>}
      </label>
      {children(className)}
      {error ? <p id={`${htmlFor}-error`} role="alert" className="field-error">{error}</p>
        : hint ? <p className="field-hint">{hint}</p> : null}
    </div>
  );
}

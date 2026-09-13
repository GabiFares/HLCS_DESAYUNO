import { useEffect, useState } from "react";
import type { Stay } from "../../shared/types";
import { FormField } from "../components/FormField";
import { api, errorMessage } from "../lib/api";
import { shiftCalendarDate, todayInUruguay } from "../lib/dates";
import { ErrorBanner } from "../components/Feedback";
import { hasErrors, validateBreakfastNotes, validateCheckIn, validateCheckOut, validateGuestCount, validateRoom, validateStayForm, type StayFieldErrors } from "./stayValidation";

interface StayFormProps {
  stay: Stay | null;
  onClose: () => void;
  onSaved: (stay: Stay) => void;
  onDeleted: (id: number) => void;
}

function onlyDigits(value: string): string {
  return value.replace(/\D/g, "").slice(0, 2);
}

export function StayForm({ stay, onClose, onSaved, onDeleted }: StayFormProps) {
  const today = todayInUruguay();
  const [roomNumber, setRoomNumber] = useState(stay?.roomNumber ?? "");
  const [checkInDate, setCheckInDate] = useState(stay?.checkInDate ?? today);
  const [checkOutDate, setCheckOutDate] = useState(stay?.checkOutDate ?? shiftCalendarDate(today, 1));
  const [guestCount, setGuestCount] = useState(String(stay?.guestCount ?? 1));
  const [breakfastNotes, setBreakfastNotes] = useState(stay?.breakfastNotes ?? "");
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState("");
  const [errors, setErrors] = useState<StayFieldErrors>({});
  const [touched, setTouched] = useState<Partial<Record<keyof StayFieldErrors, boolean>>>({});

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  function patch<N extends keyof StayFieldErrors>(
    field: N,
    setter: (value: string) => void,
    validator: (value: string) => string | undefined,
  ) {
    return (value: string) => {
      setter(value);
      setServerError("");
      if (touched[field]) {
        const message = validator(value);
        setErrors((current) => ({ ...current, [field]: message }));
      }
    };
  }

  function verifyAll() {
    const next = validateStayForm({ roomNumber, checkInDate, checkOutDate, guestCount, breakfastNotes });
    setErrors(next);
    setTouched({ roomNumber: true, checkInDate: true, checkOutDate: true, guestCount: true, breakfastNotes: true });
    return next;
  }

  function blur(field: keyof StayFieldErrors) {
    return () => {
      setTouched((current) => ({ ...current, [field]: true }));
      const next = validateStayForm({ roomNumber, checkInDate, checkOutDate, guestCount, breakfastNotes });
      setErrors((current) => ({ ...current, [field]: next[field] }));
    };
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setServerError("");
    const next = verifyAll();
    if (hasErrors(next)) return;
    setSaving(true);
    try {
      const data = { roomNumber, checkInDate, checkOutDate, guestCount: Number(guestCount), breakfastNotes };
      const response = stay ? await api.updateStay(stay.id, data) : await api.createStay(data);
      onSaved(response.stay);
    } catch (caught) {
      setServerError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!stay || !window.confirm(`¿Eliminar la estadía de la habitación ${stay.roomNumber}? Si ya tiene desayunos registrados no se podrá eliminar.`)) return;
    setSaving(true);
    setServerError("");
    try {
      await api.deleteStay(stay.id);
      onDeleted(stay.id);
    } catch (caught) {
      setServerError(errorMessage(caught));
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-pine-950/30 p-0 backdrop-blur-[2px] sm:items-center sm:p-6" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section role="dialog" aria-modal="true" aria-labelledby="stay-form-title" className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white shadow-xl sm:rounded-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 id="stay-form-title" className="text-lg font-semibold tracking-tight text-pine-950">{stay ? "Editar estadía" : "Nueva estadía"}</h2>
            <p className="mt-0.5 text-sm text-slate-500">{stay ? `Habitación ${stay.roomNumber}` : "Ingresá los datos de la reserva"}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="grid size-9 place-items-center rounded-lg text-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700">×</button>
        </div>

        <form onSubmit={submit} noValidate className="space-y-4 px-5 py-5">
          {serverError && <ErrorBanner message={serverError} />}
          <FormField label="Habitación" htmlFor="room-number" required
            error={errors.roomNumber}>
            {(className) => (
              <input id="room-number" autoFocus maxLength={20} value={roomNumber} inputMode="text"
                aria-invalid={Boolean(errors.roomNumber)}
                aria-describedby={errors.roomNumber ? "room-number-error" : undefined}
                onChange={(event) => patch("roomNumber", setRoomNumber, (v) => validateRoom(v))(event.target.value)}
                onBlur={blur("roomNumber")}
                className={`${className} ${touched.roomNumber && errors.roomNumber ? "field-invalid" : ""}`}
                placeholder="Ej. 203" />
            )}
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Check-in" htmlFor="check-in" required error={errors.checkInDate}>
              {(className) => (
                <input id="check-in" type="date" value={checkInDate} max={today}
                  aria-invalid={Boolean(errors.checkInDate)}
                  aria-describedby={errors.checkInDate ? "check-in-error" : undefined}
                  onChange={(event) => patch("checkInDate", setCheckInDate, (v) => validateCheckIn(v))(event.target.value)}
                  onBlur={blur("checkInDate")}
                  className={`${className} ${touched.checkInDate && errors.checkInDate ? "field-invalid" : ""}`} />
              )}
            </FormField>
            <FormField label="Check-out" htmlFor="check-out" required error={errors.checkOutDate}>
              {(className) => (
                <input id="check-out" type="date" value={checkOutDate}
                  aria-invalid={Boolean(errors.checkOutDate)}
                  aria-describedby={errors.checkOutDate ? "check-out-error" : undefined}
                  onChange={(event) => patch("checkOutDate", setCheckOutDate, (v) => validateCheckOut(v, checkInDate))(event.target.value)}
                  onBlur={blur("checkOutDate")}
                  className={`${className} ${touched.checkOutDate && errors.checkOutDate ? "field-invalid" : ""}`} />
              )}
            </FormField>
          </div>

          <FormField label="Pasajeros" htmlFor="guest-count" required
            error={errors.guestCount}>
            {(className) => (
              <input id="guest-count" inputMode="numeric" value={guestCount}
                minLength={1} maxLength={2}
                aria-invalid={Boolean(errors.guestCount)}
                aria-describedby={errors.guestCount ? "guest-count-error" : undefined}
                onChange={(event) => patch("guestCount", setGuestCount, (v) => validateGuestCount(v))(onlyDigits(event.target.value))}
                onBlur={blur("guestCount")}
                className={`${className} ${touched.guestCount && errors.guestCount ? "field-invalid" : ""}`}
                placeholder="1" />
            )}
          </FormField>

          <FormField label="Aclaración del desayuno" htmlFor="breakfast-notes"
            hint="Opcional. Por ejemplo: es celíaco, necesita huevo extra, no toma azúcar."
            error={errors.breakfastNotes}>
            {(className) => (
              <textarea id="breakfast-notes" rows={2} maxLength={300} value={breakfastNotes}
                aria-invalid={Boolean(errors.breakfastNotes)}
                aria-describedby={errors.breakfastNotes ? "breakfast-notes-error" : undefined}
                onChange={(event) => patch("breakfastNotes", setBreakfastNotes, (v) => validateBreakfastNotes(v))(event.target.value)}
                onBlur={blur("breakfastNotes")}
                className={`${className} resize-none leading-snug ${touched.breakfastNotes && errors.breakfastNotes ? "field-invalid" : ""}`}
                placeholder="Ej. es celíaco, necesita huevo…" />
            )}
          </FormField>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
            <button disabled={saving} className="btn-primary flex-1">{saving ? "Guardando…" : "Guardar"}</button>
          </div>
          {stay && <div className="pt-1">
            <button disabled={saving} type="button" onClick={remove} className="btn-danger w-full">Eliminar estadía</button>
          </div>}
        </form>
      </section>
    </div>
  );
}
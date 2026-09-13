export interface StayFormValues {
  roomNumber: string;
  checkInDate: string;
  checkOutDate: string;
  guestCount: string;
  breakfastNotes: string;
}

export type StayFieldErrors = Partial<Record<keyof StayFormValues, string>>;

const ROOM_MAX = 20;
const NOTES_MAX = 300;

export function validateRoom(value: string): string | undefined {
  const clean = value.trim();
  if (!clean) return "Ingresá el número de habitación.";
  if (clean.length > ROOM_MAX) return "El número de habitación no puede superar 20 caracteres.";
  return undefined;
}

export function validateCheckIn(value: string): string | undefined {
  if (!value) return "Seleccioná una fecha de check-in.";
  return undefined;
}

export function validateCheckOut(value: string, checkIn: string): string | undefined {
  if (!value) return "Seleccioná una fecha de check-out.";
  if (checkIn && value < checkIn) return "El check-out no puede ser anterior al check-in.";
  return undefined;
}

export function validateGuestCount(value: string): string | undefined {
  const clean = value.trim();
  if (!clean) return "Ingresá la cantidad de pasajeros.";
  const guests = Number(clean);
  if (!Number.isInteger(guests) || guests < 1) return "Ingresá al menos 1 pasajero.";
  if (guests > 99) return "El máximo de pasajeros es 99.";
  return undefined;
}

export function validateBreakfastNotes(value: string): string | undefined {
  if (value.trim().length > NOTES_MAX) return `La aclaración no puede superar ${NOTES_MAX} caracteres.`;
  return undefined;
}

export function validateStayForm(values: StayFormValues): StayFieldErrors {
  const errors: StayFieldErrors = {};
  const room = validateRoom(values.roomNumber);
  if (room) errors.roomNumber = room;
  const checkIn = validateCheckIn(values.checkInDate);
  if (checkIn) errors.checkInDate = checkIn;
  const checkOut = validateCheckOut(values.checkOutDate, values.checkInDate);
  if (checkOut) errors.checkOutDate = checkOut;
  const guests = validateGuestCount(values.guestCount);
  if (guests) errors.guestCount = guests;
  const notes = validateBreakfastNotes(values.breakfastNotes);
  if (notes) errors.breakfastNotes = notes;
  return errors;
}

export function hasErrors(errors: StayFieldErrors): boolean {
  return Object.keys(errors).length > 0;
}
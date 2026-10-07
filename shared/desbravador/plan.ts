/**
 * Construcción del plan de importación: decide, sin tocar la base, qué
 * estadías se crean, cuáles se actualizan, cuáles ya coinciden y cuáles
 * necesitan revisión.
 *
 * Identidad de una estadía: (habitación normalizada, check-in).
 *
 * No se usa el `ID` del informe porque no es único por estadía: Desbravador
 * lo reutiliza en las filas Check-in, En Marcha y Check-out de la misma
 * reserva y lo repite en días distintos. En cambio el check-in es inmutable
 * durante una estadía y una habitación no puede tener dos estadías el mismo
 * día, de modo que (habitación, check-in) identifica una estadía incluso si el
 * check-out o la cantidad de pasajeros cambian durante la misma estadía. Eso
 * es justamente lo que permite que una segunda importación del mismo PDF no
 * duplique nada y que un check-out corregido se detecte como actualización en
 * lugar de como una estadía nueva.
 *
 * La función es pura: recibe las estadías existentes con su historial de
 * desayunos y devuelve el plan. El Worker resuelve ese historial en D1 y luego
 * aplica el plan.
 */

import { formatReportDate, normalizeRoom } from "./normalize.ts";
import type { ImportPlan, ParsedReview, ParsedStay, ParseResult, PlanItem } from "./types.ts";

/** Un día con desayuno efectivamente servido. `count > 0` siempre. */
export interface ServedDay {
  date: string;
  count: number;
}

export interface ExistingStayView {
  id: number;
  roomNumber: string;
  checkInDate: string;
  checkOutDate: string;
  guestCount: number;
  completedOn: string | null;
  /** Historial de desayunos ya servidos. Nunca se sacrifica. */
  served: ServedDay[];
}

export type ReviewCode =
  | ParsedReview["reason"]
  | "estadía_ambigua"
  | "estadía_finalizada"
  | "conflicto_pasajeros"
  | "conflicto_check_out";

type ReviewDetail =
  | { kind: "pasajeros"; from: number; to: number }
  | { kind: "check_out"; from: string; to: string };

const REVIEW_MESSAGES: Record<ReviewCode, string> = {
  transferencia: "Transferencia entre habitaciones: creala o ajustala a mano.",
  sin_habitacion: "No se pudo identificar la habitación del registro.",
  fechas_incompletas: "Faltan las fechas de check-in o check-out.",
  fechas_invalidas: "El check-out tiene que ser posterior al check-in.",
  pax_invalido: "La cantidad de pasajeros no es válida.",
  ambigua: "El registro no tiene un tipo de operación legible.",
  duplicada_en_informe: "El informe repite esta habitación con datos distintos.",
  "estadía_ambigua": "Ya hay más de una estadía con esta habitación y check-in.",
  "estadía_finalizada": "La estadía ya estaba finalizada, se conserva como está.",
  conflicto_pasajeros: "Reducir los pasajeros afecta desayunos ya registrados.",
  conflicto_check_out: "Cambiar el check-out deja fuera desayunos ya registrados.",
};

/** Motivo listo para mostrar, en español y sin detalle técnico. */
export function reviewMessage(code: ReviewCode, detail?: ReviewDetail): string {
  if (code === "conflicto_pasajeros" && detail?.kind === "pasajeros") {
    return `Reducir los pasajeros de ${detail.from} a ${detail.to} pondría en riesgo desayunos ya registrados.`;
  }
  if (code === "conflicto_check_out" && detail?.kind === "check_out") {
    return `Cambiar el check-out de ${detail.from} a ${detail.to} dejaría fuera desayunos ya registrados.`;
  }
  return REVIEW_MESSAGES[code];
}

function identity(roomNumber: string, checkInDate: string): string {
  return `${normalizeRoom(roomNumber)}|${checkInDate}`;
}

function baseItem(stay: ParsedStay): PlanItem {
  return {
    action: "create",
    roomNumber: stay.roomNumber,
    checkInDate: stay.checkInDate,
    checkOutDate: stay.checkOutDate,
    guestCount: stay.guestCount,
    externalId: stay.externalId,
    operation: stay.operation,
    stayId: null,
    changes: {},
    reason: null,
  };
}

function reviewItem(review: ParsedReview): PlanItem {
  return {
    action: "review",
    roomNumber: review.roomNumber ?? "—",
    checkInDate: review.checkInDate,
    checkOutDate: review.checkOutDate,
    guestCount: review.guestCount,
    externalId: review.externalId,
    operation: null,
    stayId: null,
    changes: {},
    reason: reviewMessage(review.reason),
  };
}

export function buildPlan(parsed: ParseResult, existing: ExistingStayView[]): ImportPlan {
  const byIdentity = new Map<string, ExistingStayView[]>();
  for (const stay of existing) {
    const key = identity(stay.roomNumber, stay.checkInDate);
    const bucket = byIdentity.get(key);
    if (bucket) bucket.push(stay);
    else byIdentity.set(key, [stay]);
  }

  const plan: ImportPlan = { create: [], update: [], unchanged: [], review: [], ignored: parsed.skipped.length };

  for (const stay of parsed.stays) {
    const candidates = byIdentity.get(identity(stay.roomNumber, stay.checkInDate)) ?? [];
    const base = baseItem(stay);

    if (candidates.length > 1) {
      plan.review.push({ ...base, action: "review", reason: reviewMessage("estadía_ambigua") });
      continue;
    }

    const match = candidates[0];
    if (!match) {
      plan.create.push(base);
      continue;
    }

    const changes: PlanItem["changes"] = {};
    if (match.guestCount !== stay.guestCount) changes.guestCount = { from: match.guestCount, to: stay.guestCount };
    if (match.checkOutDate !== stay.checkOutDate) changes.checkOutDate = { from: match.checkOutDate, to: stay.checkOutDate };

    const linked: PlanItem = { ...base, stayId: match.id };

    if (Object.keys(changes).length === 0) {
      plan.unchanged.push({ ...linked, action: "unchanged" });
      continue;
    }

    if (match.completedOn !== null) {
      plan.review.push({ ...linked, action: "review", changes, reason: reviewMessage("estadía_finalizada") });
      continue;
    }

    // El trigger del clamp recortaría el desayuno en silencio ante una
    // reducción de pasajeros. Se intercepta acá y se manda a revisión.
    const newGuests = changes.guestCount?.to ?? match.guestCount;
    if (changes.guestCount && match.served.some((day) => day.count > newGuests)) {
      plan.review.push({
        ...linked,
        action: "review",
        changes,
        reason: reviewMessage("conflicto_pasajeros", { kind: "pasajeros", from: match.guestCount, to: newGuests }),
      });
      continue;
    }

    const newCheckOut = changes.checkOutDate?.to ?? match.checkOutDate;
    if (match.served.some((day) => day.date > newCheckOut)) {
      plan.review.push({
        ...linked,
        action: "review",
        changes,
        reason: reviewMessage("conflicto_check_out", {
          kind: "check_out",
          from: formatReportDate(match.checkOutDate),
          to: formatReportDate(newCheckOut),
        }),
      });
      continue;
    }

    plan.update.push({ ...linked, action: "update", changes });
  }

  for (const review of parsed.review) plan.review.push(reviewItem(review));
  return plan;
}
/**
 * Contratos de la importación de reservas desde Desbravador.
 *
 * Ningún tipo de este archivo transporta nombres, documentos ni empresas: la
 * app de desayunos sólo necesita habitación, fechas, pasajeros y la
 * referencia externa.
 */

export interface PositionedItem {
  text: string;
  x: number;
  y: number;
  /** Ancho en puntos. Permite interpolar la X de una palabra dentro de un item. */
  width?: number;
}

export type SkipReason = "not_hospedaje" | "malformed" | "unreadable";
export type ReviewReason =
  | "transferencia"
  | "sin_habitacion"
  | "fechas_incompletas"
  | "fechas_invalidas"
  | "pax_invalido"
  | "ambigua"
  | "duplicada_en_informe";

export interface ParsedStay {
  roomNumber: string;
  checkInDate: string;
  checkOutDate: string;
  guestCount: number;
  externalId: string | null;
  operation: string | null;
}

export interface ParsedSkipped {
  reason: SkipReason;
  roomNumber: string | null;
  operation: string | null;
}

export interface ParsedReview {
  reason: ReviewReason;
  roomNumber: string | null;
  checkInDate: string | null;
  checkOutDate: string | null;
  guestCount: number | null;
  externalId: string | null;
}

export interface ParseResult {
  stays: ParsedStay[];
  skipped: ParsedSkipped[];
  review: ParsedReview[];
  pageCount: number;
  /** False cuando el PDF no tiene el encabezado del informe de ocupación. */
  isReport: boolean;
}

export type PlanAction = "create" | "update" | "unchanged" | "review";

export interface FieldChange<T> {
  from: T;
  to: T;
}

export interface PlanItem {
  action: PlanAction;
  roomNumber: string;
  checkInDate: string | null;
  checkOutDate: string | null;
  guestCount: number | null;
  externalId: string | null;
  operation: string | null;
  stayId: number | null;
  changes: {
    guestCount?: FieldChange<number>;
    checkOutDate?: FieldChange<string>;
  };
  reason: string | null;
}

export interface ImportPlan {
  create: PlanItem[];
  update: PlanItem[];
  unchanged: PlanItem[];
  review: PlanItem[];
  ignored: number;
}

export interface ImportCounts {
  create: number;
  update: number;
  unchanged: number;
  review: number;
  ignored: number;
}

export interface ImportPreview {
  fileName: string;
  fileSize: number;
  pageCount: number;
  counts: ImportCounts;
  create: PlanItem[];
  update: PlanItem[];
  review: PlanItem[];
}

export interface ImportResult extends ImportCounts {
  importId: number;
}

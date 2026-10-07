import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildPlan, type ExistingStayView } from "../shared/desbravador/plan.ts";
import type { ParsedStay, ParseResult } from "../shared/desbravador/types.ts";

function parsed(stays: ParsedStay[] = [], overrides: Partial<ParseResult> = {}): ParseResult {
  return {
    stays,
    skipped: [],
    review: [],
    pageCount: 1,
    isReport: true,
    ...overrides,
  };
}

function stay(overrides: Partial<ParsedStay> = {}): ParsedStay {
  return {
    roomNumber: "303",
    checkInDate: "2026-09-30",
    checkOutDate: "2026-10-02",
    guestCount: 2,
    externalId: "2183",
    operation: "Check-in",
    ...overrides,
  };
}

function existing(overrides: Partial<ExistingStayView> = {}): ExistingStayView {
  return {
    id: 10,
    roomNumber: "303",
    checkInDate: "2026-09-30",
    checkOutDate: "2026-10-02",
    guestCount: 2,
    completedOn: null,
    served: [],
    ...overrides,
  };
}

const counts = (plan: ReturnType<typeof buildPlan>) => ({
  create: plan.create.length,
  update: plan.update.length,
  unchanged: plan.unchanged.length,
  review: plan.review.length,
});

describe("buildPlan: estadías nuevas", () => {
  it("crea la estadía cuando no existe", () => {
    const plan = buildPlan(parsed([stay()]), []);

    assert.deepEqual(counts(plan), { create: 1, update: 0, unchanged: 0, review: 0 });
    assert.equal(plan.create[0]?.roomNumber, "303");
    assert.equal(plan.create[0]?.externalId, "2183");
  });
});

describe("buildPlan: idempotencia (mismo PDF importado dos veces)", () => {
  it("no crea nada y no actualiza nada al repetir la importación", () => {
    const primerInforme = parsed([stay(), stay({ roomNumber: "304" })]);
    const created = buildPlan(primerInforme, []);

    // Lo que realmente se guardó tras aplicar el primer plan.
    const guardado: ExistingStayView[] = created.create.map((item) => existing({
      id: 100 + Number(item.roomNumber),
      roomNumber: item.roomNumber,
      checkInDate: item.checkInDate ?? "",
      checkOutDate: item.checkOutDate ?? "",
      guestCount: item.guestCount ?? 0,
    }));

    const segunda = buildPlan(parsed([stay(), stay({ roomNumber: "304" })]), guardado);

    assert.deepEqual(counts(segunda), { create: 0, update: 0, unchanged: 2, review: 0 });
    assert.equal(segunda.ignored, 0);
  });

  it("reconoce la misma estadía aunque la habitación tenga ceros a la izquierda", () => {
    const plan = buildPlan(parsed([stay({ roomNumber: "0303" })]), [existing({ roomNumber: "303" })]);

    assert.deepEqual(counts(plan), { create: 0, update: 0, unchanged: 1, review: 0 });
  });
});

describe("buildPlan: actualizaciones", () => {
  it("detecta el cambio de cantidad de pasajeros", () => {
    const plan = buildPlan(parsed([stay({ guestCount: 4 })]), [existing({ guestCount: 2 })]);

    assert.deepEqual(counts(plan), { create: 0, update: 1, unchanged: 0, review: 0 });
    assert.deepEqual(plan.update[0]?.changes.guestCount, { from: 2, to: 4 });
  });

  it("detecta el cambio de check-out sin crear una estadía duplicada", () => {
    const plan = buildPlan(
      parsed([stay({ checkOutDate: "2026-10-05" })]),
      [existing({ checkOutDate: "2026-10-02" })],
    );

    assert.deepEqual(counts(plan), { create: 0, update: 1, unchanged: 0, review: 0 });
    assert.equal(plan.update[0]?.stayId, 10);
    assert.deepEqual(plan.update[0]?.changes.checkOutDate, {
      from: "2026-10-02",
      to: "2026-10-05",
    });
  });

  it("sigue actualizando cuando cambian pasajeros y check-out juntos", () => {
    const plan = buildPlan(
      parsed([stay({ guestCount: 3, checkOutDate: "2026-10-06" })]),
      [existing({ guestCount: 2, checkOutDate: "2026-10-02" })],
    );

    assert.equal(plan.update.length, 1);
    assert.equal(Object.keys(plan.update[0]?.changes ?? {}).length, 2);
  });

  it("amplía pasajeros con desayunos ya registrados sin conflicto", () => {
    const plan = buildPlan(
      parsed([stay({ guestCount: 4 })]),
      [existing({ guestCount: 2, served: [{ date: "2026-09-30", count: 2 }] })],
    );

    assert.deepEqual(counts(plan), { create: 0, update: 1, unchanged: 0, review: 0 });
  });
});

describe("buildPlan: protección del historial de desayunos", () => {
  it("no reduce pasajeros por debajo de lo ya servido", () => {
    const plan = buildPlan(
      parsed([stay({ guestCount: 1 })]),
      [existing({ guestCount: 3, served: [{ date: "2026-09-30", count: 2 }] })],
    );

    assert.deepEqual(counts(plan), { create: 0, update: 0, unchanged: 0, review: 1 });
    assert.match(plan.review[0]?.reason ?? "", /Reducir los pasajeros de 3 a 1/);
  });

  it("reduce pasajeros cuando ningún día se vio afectado", () => {
    const plan = buildPlan(
      parsed([stay({ guestCount: 3 })]),
      [existing({ guestCount: 5, served: [{ date: "2026-09-30", count: 3 }] })],
    );

    assert.deepEqual(counts(plan), { create: 0, update: 1, unchanged: 0, review: 0 });
  });

  it("no acorta el check-out de una estadía con desayunos dentro del rango nuevo", () => {
    const plan = buildPlan(
      parsed([stay({ checkOutDate: "2026-10-01" })]),
      [existing({ checkOutDate: "2026-10-02", served: [{ date: "2026-10-02", count: 2 }] })],
    );

    assert.deepEqual(counts(plan), { create: 0, update: 0, unchanged: 0, review: 1 });
    assert.match(plan.review[0]?.reason ?? "", /Cambiar el check-out/);
  });

  it("no toca una estadía ya finalizada", () => {
    const plan = buildPlan(
      parsed([stay({ guestCount: 5 })]),
      [existing({ guestCount: 2, completedOn: "2026-10-02" })],
    );

    assert.deepEqual(counts(plan), { create: 0, update: 0, unchanged: 0, review: 1 });
    assert.match(plan.review[0]?.reason ?? "", /ya estaba finalizada/);
  });

  it("deja una estadía finalizada intacta si no hay cambios", () => {
    const plan = buildPlan(parsed([stay()]), [existing({ completedOn: "2026-10-02" })]);

    assert.deepEqual(counts(plan), { create: 0, update: 0, unchanged: 1, review: 0 });
  });
});

describe("buildPlan: casos ambiguos", () => {
  it("pide revisión si ya hay dos estadías con la misma habitación y check-in", () => {
    const plan = buildPlan(
      parsed([stay()]),
      [existing({ id: 10 }), existing({ id: 11, guestCount: 5 })],
    );

    assert.deepEqual(counts(plan), { create: 0, update: 0, unchanged: 0, review: 1 });
    assert.match(plan.review[0]?.reason ?? "", /más de una estadía/);
  });
});

describe("buildPlan: registros que no se pueden importar", () => {
  it("cuenta las ignoradas y traslada las que necesitan revisión", () => {
    const plan = buildPlan(
      parsed([], {
        skipped: [
          { reason: "not_hospedaje", roomNumber: "307", operation: "Termino" },
          { reason: "not_hospedaje", roomNumber: "308", operation: "Inicio" },
        ],
        review: [{
          reason: "transferencia",
          roomNumber: "412",
          checkInDate: "2026-09-30",
          checkOutDate: "2026-10-06",
          guestCount: 1,
          externalId: "2162",
        }],
      }),
      [],
    );

    assert.equal(plan.ignored, 2);
    assert.equal(plan.review.length, 1);
    assert.equal(plan.review[0]?.roomNumber, "412");
    assert.equal(plan.create.length, 0);
  });
});
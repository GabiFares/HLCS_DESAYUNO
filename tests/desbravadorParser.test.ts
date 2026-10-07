import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseReport } from "../shared/desbravador/parser.ts";
import type { PositionedItem } from "../shared/desbravador/types.ts";
import { positionedFromRuns, tableRow, type PdfRun } from "./helpers/pdfFixture.ts";

const HEADER_Y = 520;

/** Items de una página del informe, con el encabezado de columnas incluido. */
function page(...rows: PdfRun[][]): PositionedItem[] {
  const header: PdfRun[] = [
    { column: 0, text: "Habitacion", y: HEADER_Y },
    { column: 1, text: "Tipo", y: HEADER_Y },
    { column: 2, text: "Operacion", y: HEADER_Y },
    { column: 3, text: "ID", y: HEADER_Y },
    { column: 4, text: "Descripcion", y: HEADER_Y },
    { column: 5, text: "Fecha In", y: HEADER_Y },
    { column: 6, text: "Fecha Out", y: HEADER_Y },
    { column: 7, text: "PAX", y: HEADER_Y },
  ];
  return positionedFromRuns([...header, ...rows.flat()]);
}

const HOSPEDAJE_ROW = (y: number, values: (string | null)[]) => tableRow(y, values);

describe("parseReport: hospedaje normal", () => {
  it("extrae habitación, fechas, PAX y referencia externa", () => {
    const result = parseReport([
      page(
        HOSPEDAJE_ROW(500, ["303", "HOSPEDAJE", "Check-in", "2183", "NOMBRE APELLIDO - 21885372", "30/09/2026", "02/10/2026", "2"]),
      ),
    ]);

    assert.equal(result.isReport, true);
    assert.deepEqual(result.stays, [
      {
        roomNumber: "303",
        checkInDate: "2026-09-30",
        checkOutDate: "2026-10-02",
        guestCount: 2,
        externalId: "2183",
        operation: "Check-in",
      },
    ]);
    assert.equal(result.review.length, 0);
  });
});

describe("parseReport: operaciones de hospedaje", () => {
  const casos: [string, string, string, string][] = [
    ["Check-in", "30/09/2026", "02/10/2026", "2183"],
    ["Check-out", "28/09/2026", "30/09/2026", "2170"],
    ["Walk-in", "30/09/2026", "01/10/2026", "2201"],
    ["En Marcha", "28/09/2026", "04/10/2026", "2170"],
  ];

  for (const [operacion, fechaIn, fechaOut, id] of casos) {
    it(`importa una estadía con operación ${operacion}`, () => {
      const result = parseReport([
        page(HOSPEDAJE_ROW(500, ["303", "HOSPEDAJE", operacion, id, "HUESPED ANONIMO", fechaIn, fechaOut, "2"])),
      ]);

      assert.equal(result.stays.length, 1);
      assert.equal(result.stays[0]?.operation, operacion);
      assert.equal(result.stays[0]?.checkInDate, fechaIn.split("/").reverse().join("-"));
      assert.equal(result.stays[0]?.externalId, id);
      assert.equal(result.review.length, 0);
    });
  }
});

describe("parseReport: tipos que no son hospedaje", () => {
  it("ignora un registro de mantenimiento", () => {
    const result = parseReport([
      page(
        HOSPEDAJE_ROW(500, ["303", "HOSPEDAJE", "Check-in", "2183", "HUESPED", "30/09/2026", "02/10/2026", "2"]),
        HOSPEDAJE_ROW(480, ["307", "MANUTENCION", "Termino", null, "Cambio de colchon", null, null, null]),
      ),
    ]);

    assert.equal(result.stays.length, 1);
    assert.deepEqual(result.skipped, [{ reason: "not_hospedaje", roomNumber: "307", operation: "Termino" }]);
    assert.equal(result.review.length, 0);
  });

  it("no cuenta totales, encabezados ni pie de página", () => {
    const result = parseReport([
      page(
        HOSPEDAJE_ROW(500, ["303", "HOSPEDAJE", "Check-in", "2183", "HUESPED", "30/09/2026", "02/10/2026", "2"]),
        [{ column: 0, text: "Room Nights: 12   Check-ins: 5   Check-outs: 3", y: 440 }],
        [{ column: 0, text: "INFORME DETALLE DIARIO DE OCUPACION", y: 555 }],
        [{ column: 0, text: "Pagina 1 de 2", y: 60 }],
      ),
    ]);

    assert.equal(result.stays.length, 1);
    assert.equal(result.skipped.length, 0);
    assert.equal(result.review.length, 0);
  });
});

describe("parseReport: líneas partidas", () => {
  it("ignora la línea de continuación de la descripción", () => {
    const result = parseReport([
      page(
        HOSPEDAJE_ROW(500, ["303", "HOSPEDAJE", "Check-in", "2183", "ARACELI BROARDO - 21885372", "30/09/2026", "02/10/2026", "2"]),
        [{ column: 0, text: "ARACELI BROARDO, LUCIO MARANI", y: 490 }],
      ),
    ]);

    assert.equal(result.stays.length, 1);
    assert.equal(result.stays[0]?.roomNumber, "303");
    assert.equal(result.review.length, 0);
    assert.equal(result.skipped.length, 0);
  });

  it("recompone una fila con la habitación en la línea siguiente", () => {
    const result = parseReport([
      page(
        tableRow(500, [null, "HOSPEDAJE", "Check-in", "2183", "HUESPED ANONIMO", "30/09/2026", "02/10/2026", "2"]),
        tableRow(490, ["303", null, null, null, null, null, null, null]),
      ),
    ]);

    assert.equal(result.stays.length, 1);
    assert.equal(result.stays[0]?.roomNumber, "303");
    assert.equal(result.stays[0]?.checkInDate, "2026-09-30");
    assert.equal(result.review.length, 0);
  });
});

describe("parseReport: transferencias de habitación", () => {
  it("no crea dos estadías y deja la transferencia para revisión", () => {
    const result = parseReport([
      page(
        tableRow(500, [null, "HOSPEDAJE", "Transferencia", null, "NOMBRE APELLIDO", null, null, null]),
        [{ column: 4, text: "Transferencia IN - UH de origen 410", y: 490 }],
        tableRow(480, ["412", null, null, "2162", null, "30/09/2026", "06/10/2026", "1"]),
      ),
    ]);

    assert.equal(result.stays.length, 0, "una transferencia nunca se importa sola");
    assert.equal(result.review.length, 1);
    assert.equal(result.review[0]?.reason, "transferencia");
    assert.equal(result.review[0]?.roomNumber, "412");
    assert.equal(result.review[0]?.checkOutDate, "2026-10-06");
  });

  it("marca para revisión una transferencia declarada en la misma línea", () => {
    const result = parseReport([
      page(HOSPEDAJE_ROW(500, ["412", "HOSPEDAJE", "Transferencia", "2162", "NOMBRE APELLIDO", "30/09/2026", "06/10/2026", "1"])),
    ]);

    assert.equal(result.stays.length, 0);
    assert.equal(result.review[0]?.reason, "transferencia");
  });
});

describe("parseReport: validaciones", () => {
  it("rechaza check-out anterior o igual al check-in", () => {
    const result = parseReport([
      page(
        HOSPEDAJE_ROW(500, ["303", "HOSPEDAJE", "Check-in", "2183", "HUESPED", "30/09/2026", "28/09/2026", "2"]),
        HOSPEDAJE_ROW(480, ["304", "HOSPEDAJE", "Walk-in", "2184", "HUESPED", "30/09/2026", "30/09/2026", "1"]),
      ),
    ]);

    assert.equal(result.stays.length, 0);
    assert.equal(result.review.length, 2);
    assert.ok(result.review.every((entry) => entry.reason === "fechas_invalidas"));
  });

  it("rechaza un PAX ausente o fuera de rango", () => {
    const result = parseReport([
      page(
        HOSPEDAJE_ROW(500, ["303", "HOSPEDAJE", "Check-in", "2183", "HUESPED", "30/09/2026", "02/10/2026", null]),
        HOSPEDAJE_ROW(480, ["304", "HOSPEDAJE", "Check-in", "2184", "HUESPED", "30/09/2026", "02/10/2026", "0"]),
        HOSPEDAJE_ROW(460, ["305", "HOSPEDAJE", "Check-in", "2185", "HUESPED", "30/09/2026", "02/10/2026", "120"]),
      ),
    ]);

    assert.equal(result.stays.length, 0);
    assert.equal(result.review.length, 3);
    assert.ok(result.review.every((entry) => entry.reason === "pax_invalido"));
  });

  it("rechaza una fecha inexistente", () => {
    const result = parseReport([
      page(HOSPEDAJE_ROW(500, ["303", "HOSPEDAJE", "Check-in", "2183", "HUESPED", "31/02/2026", "02/10/2026", "2"])),
    ]);

    assert.equal(result.stays.length, 0);
    assert.equal(result.review[0]?.reason, "fechas_incompletas");
  });

  it("envía a revisión una fila malformada sin tipo de operación", () => {
    const result = parseReport([
      page(tableRow(500, ["303", null, null, "2183", "HUESPED", "30/09/2026", "02/10/2026", "2"])),
    ]);

    assert.equal(result.stays.length, 0);
    assert.equal(result.review[0]?.reason, "ambigua");
    assert.equal(result.review[0]?.roomNumber, "303");
  });
});

describe("parseReport: varias páginas", () => {
  it("lee todas las páginas aunque el encabezado se repita", () => {
    const result = parseReport([
      page(
        HOSPEDAJE_ROW(500, ["303", "HOSPEDAJE", "Check-in", "2183", "HUESPED", "30/09/2026", "02/10/2026", "2"]),
        HOSPEDAJE_ROW(480, ["304", "HOSPEDAJE", "En Marcha", "2170", "HUESPED", "28/09/2026", "01/10/2026", "3"]),
      ),
      page(
        HOSPEDAJE_ROW(500, ["305", "HOSPEDAJE", "Check-out", "2160", "HUESPED", "25/09/2026", "30/09/2026", "1"]),
        HOSPEDAJE_ROW(480, ["306", "MANTENIMIENTO", "Inicio", null, "Pintura", null, null, null]),
      ),
    ]);

    assert.equal(result.pageCount, 2);
    assert.deepEqual(result.stays.map((stay) => stay.roomNumber), ["303", "304", "305"]);
    assert.equal(result.skipped.length, 1);
  });
});

describe("parseReport: duplicados dentro del mismo informe", () => {
  it("colapsa la fila repetida con datos idénticos", () => {
    const fila: (string | null)[] = ["303", "HOSPEDAJE", "En Marcha", "2183", "HUESPED", "30/09/2026", "02/10/2026", "2"];
    const result = parseReport([page(HOSPEDAJE_ROW(500, fila), HOSPEDAJE_ROW(480, fila))]);

    assert.equal(result.stays.length, 1);
    assert.equal(result.review.length, 0);
  });

  it("manda a revisión la misma habitación con datos contradictorios", () => {
    const result = parseReport([
      page(
        HOSPEDAJE_ROW(500, ["303", "HOSPEDAJE", "Check-in", "2183", "HUESPED", "30/09/2026", "02/10/2026", "2"]),
        HOSPEDAJE_ROW(480, ["303", "HOSPEDAJE", "En Marcha", "2183", "HUESPED", "30/09/2026", "04/10/2026", "4"]),
      ),
    ]);

    assert.equal(result.stays.length, 0, "no se elige una versión al azar");
    assert.equal(result.review.length, 2);
    assert.ok(result.review.every((entry) => entry.reason === "duplicada_en_informe"));
  });
});

describe("parseReport: normalización de habitaciones", () => {
  it("trata 0303 y 303 como la misma habitación", () => {
    const result = parseReport([
      page(
        HOSPEDAJE_ROW(500, ["0303", "HOSPEDAJE", "Check-in", "2183", "HUESPED", "30/09/2026", "02/10/2026", "2"]),
        HOSPEDAJE_ROW(480, ["303", "HOSPEDAJE", "Check-in", "2184", "OTRO", "01/10/2026", "03/10/2026", "2"]),
      ),
    ]);

    assert.deepEqual(result.stays.map((stay) => stay.roomNumber), ["303", "303"]);
  });
});

describe("parseReport: archivos que no son el informe", () => {
  it("rechaza un PDF sin encabezado de ocupación", () => {
    const items = positionedFromRuns([
      { column: 0, text: "Factura 001-000123", y: 500 },
      { column: 0, text: "Total: 1.250,00", y: 480 },
    ]);

    const result = parseReport([items]);

    assert.equal(result.isReport, false);
    assert.equal(result.stays.length, 0);
  });

  it("devuelve un resultado vacío sin páginas", () => {
    const result = parseReport([]);

    assert.equal(result.isReport, false);
    assert.equal(result.pageCount, 0);
  });
});
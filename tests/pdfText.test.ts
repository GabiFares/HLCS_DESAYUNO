/**
 * Pruebas del extractor real (pdf.js → parser).
 *
 * Los tests de `desbravadorParser` construyen los ítems posicionados a mano, lo
 * que es cómodo pero idealizado: pdf.js fusiona rótulos vecinos, intercala
 * espacios y redondea coordenadas. Estos tests pasan por el mismo camino que el
 * Worker para que una diferencia de ese tipo se detecte acá y no en producción.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { parseReport } from "../shared/desbravador/parser.ts";
import { extractReportPages, ReportError } from "../shared/desbravador/extract.ts";
import { buildPdf, tableRow } from "./helpers/pdfFixture.ts";

async function parse(pages: Parameters<typeof buildPdf>[0]) {
  return parseReport(await extractReportPages(buildPdf(pages)));
}

test("reconoce el encabezado aunque pdf.js fusione rótulos vecinos", async () => {
  const result = await parse([
    {
      runs: [
        ...tableRow(500, ["303", "HOSPEDAJE", "Check-in", "51230", "Sr. Perez Juan", "15/10/2026", "18/10/2026", "2"]),
      ],
    },
  ]);

  assert.equal(result.isReport, true, "debe detectar el encabezado del informe");
  assert.equal(result.pageCount, 1);
  assert.deepEqual(
    result.stays.map((stay) => [stay.roomNumber, stay.checkInDate, stay.checkOutDate, stay.guestCount]),
    [["303", "2026-10-15", "2026-10-18", 2]],
  );
});

test("extrae todas las filas de una página y descarta las no HOSPEDAJE", async () => {
  const result = await parse([
    {
      runs: [
        ...tableRow(500, ["303", "HOSPEDAJE", "Check-in", "51230", "Sr. Perez Juan", "15/10/2026", "18/10/2026", "2"]),
        ...tableRow(480, ["304", "HOSPEDAJE", "Check-in", "51231", "Sra. Gomez Ana", "15/10/2026", "17/10/2026", "1"]),
        ...tableRow(460, ["305", "MANTENIMIENTO", "Mantenimiento", "51232", "Pintura", "15/10/2026", "16/10/2026", "0"]),
      ],
    },
  ]);

  assert.equal(result.stays.length, 2);
  assert.deepEqual(result.stays.map((stay) => stay.roomNumber), ["303", "304"]);
  assert.equal(result.stays[0]?.externalId, "51230");
  assert.equal(result.stays[1]?.guestCount, 1);
});

test("lee un informe de varias páginas", async () => {
  const result = await parse([
    { runs: [...tableRow(500, ["303", "HOSPEDAJE", "Check-in", "51230", "Sr. Perez", "15/10/2026", "18/10/2026", "2"])] },
    { runs: [...tableRow(500, ["304", "HOSPEDAJE", "Check-in", "51231", "Sra. Gomez", "15/10/2026", "17/10/2026", "1"])] },
  ]);

  assert.equal(result.pageCount, 2);
  assert.deepEqual(result.stays.map((stay) => stay.roomNumber), ["303", "304"]);
});

test("rechaza un PDF que no es el informe de ocupación", async () => {
  const pdf = buildPdf(
    [{ runs: [...tableRow(500, ["Factura", "12345", "Emitida", "hoy"])] }],
    { header: false, title: null },
  );

  const result = parseReport(await extractReportPages(pdf));
  assert.equal(result.isReport, false);
});

test("propaga los errores del endpoint para un PDF ilegible", async () => {
  await assert.rejects(
    () => extractReportPages(new TextEncoder().encode("esto no es un pdf")),
    (error: unknown) => error instanceof ReportError && error.code === "invalid_pdf",
  );
});

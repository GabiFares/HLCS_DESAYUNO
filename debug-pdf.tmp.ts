import { getDocumentProxy } from "unpdf";
import { parseReport } from "/Users/gabifares/projects/HLCS_DESAYUNO/shared/desbravador/parser.ts";
import { buildPdf, tableRow } from "/Users/gabifares/projects/HLCS_DESAYUNO/tests/helpers/pdfFixture.ts";

const pdf = buildPdf([
  {
    runs: [
      ...tableRow(500, ["303", "HOSPEDAJE", "Check-in", "51230", "Sr. Perez Juan", "15/10/2026", "18/10/2026", "2"]),
      ...tableRow(480, ["304", "HOSPEDAJE", "Check-in", "51231", "Sra. Gomez Ana", "15/10/2026", "17/10/2026", "1"]),
    ],
  },
]);

const doc = await getDocumentProxy(pdf);
console.log("paginas:", doc.numPages);
for (let n = 1; n <= doc.numPages; n += 1) {
  const page = await doc.getPage(n);
  const content = await page.getTextContent();
  console.log("--- items pagina", n, "---");
  for (const item of content.items) {
    const t = item.transform;
    console.log(`x=${(t[4] as number).toFixed(1)} y=${(t[5] as number).toFixed(1)} str=${JSON.stringify(item.str)}`);
  }
}

const result = parseReport([[]]);
console.log("parse vacio isReport:", result.isReport);

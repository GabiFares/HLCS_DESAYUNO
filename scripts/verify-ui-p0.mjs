import { writeFile } from "node:fs/promises";
import { buildPdf, tableRow } from "../tests/helpers/pdfFixture.ts";

const appUrl = process.env.APP_URL ?? "http://127.0.0.1:5173";
const debuggerUrl = process.env.CHROME_DEBUG_URL ?? "http://127.0.0.1:9222";
const suffix = Number(String(Date.now()).slice(-3));
const room = String(8000 + suffix);
const reviewRoom = String(9000 + suffix);
const ignoredRoom = String(7000 + suffix);
const externalId = `P0-${Date.now()}`;
const validPdfPath = `/private/tmp/hlcs-p0-${externalId}.pdf`;
const invalidPdfPath = `/private/tmp/hlcs-p0-invalid-${externalId}.pdf`;

class CdpPage {
  constructor(socket, targetId) {
    this.socket = socket;
    this.targetId = targetId;
    this.nextId = 1;
    this.pending = new Map();
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });
  }

  static async open(url) {
    const target = await fetch(`${debuggerUrl}/json/new?${encodeURIComponent(url)}`, { method: "PUT" }).then((response) => response.json());
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", reject, { once: true });
    });
    const page = new CdpPage(socket, target.id);
    await page.send("Page.enable");
    await page.send("Runtime.enable");
    await page.send("DOM.enable");
    await page.waitFor("document.readyState === 'complete'");
    return page;
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result.value;
  }

  async waitFor(expression, timeout = 10_000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      if (await this.evaluate(expression)) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Timeout esperando: ${expression}`);
  }

  async viewport(width, height = 900) {
    await this.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 600 });
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  async upload(selector, path) {
    const { root } = await this.send("DOM.getDocument");
    const { nodeId } = await this.send("DOM.querySelector", { nodeId: root.nodeId, selector });
    if (!nodeId) throw new Error(`No se encontró el input ${selector}`);
    await this.send("DOM.setFileInputFiles", { nodeId, files: [path] });
  }

  async screenshot(path) {
    const result = await this.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    await writeFile(path, Buffer.from(result.data, "base64"));
  }

  async close() {
    try { await fetch(`${debuggerUrl}/json/close/${this.targetId}`); } catch { /* best effort */ }
    this.socket.close();
  }
}

async function assertFits(page, label, selector) {
  const result = await page.evaluate(`(() => {
    const target = document.querySelector(${JSON.stringify(selector)});
    if (!target) return { missing: true };
    const rect = target.getBoundingClientRect();
    const controls = [...target.querySelectorAll('button,input')]
      .filter((element) => { const box = element.getBoundingClientRect(); return box.width > 0 && box.height > 0; })
      .map((element) => { const box = element.getBoundingClientRect(); return { label: element.getAttribute('aria-label') || element.textContent?.trim() || element.getAttribute('type'), width: Math.round(box.width), height: Math.round(box.height) }; })
      .filter((item) => item.width < 40 || item.height < 40);
    return {
      missing: false,
      viewport: innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      targetWidth: target.scrollWidth,
      targetClientWidth: target.clientWidth,
      left: Math.round(rect.left),
      right: Math.round(rect.right),
      controls,
    };
  })()`);
  if (result.missing) throw new Error(`${label}: falta ${selector}`);
  if (result.documentWidth > result.viewport || result.targetWidth > result.targetClientWidth + 1 || result.left < -1 || result.right > result.viewport + 1) {
    throw new Error(`${label}: overflow ${JSON.stringify(result)}`);
  }
  if (result.controls.length > 0) throw new Error(`${label}: controles pequeños ${JSON.stringify(result.controls)}`);
}

function clickButton(page, text) {
  return page.evaluate(`(() => {
    const button = [...document.querySelectorAll('button')].find((item) => item.textContent?.includes(${JSON.stringify(text)}));
    if (!button) return false;
    button.click();
    return true;
  })()`);
}

await writeFile(validPdfPath, buildPdf([{
  runs: [
    ...tableRow(500, [room, "HOSPEDAJE", "Check-in", externalId, "HUESPED QA", "15/10/2026", "18/10/2026", "2"]),
    ...tableRow(480, [reviewRoom, "HOSPEDAJE", "Transferencia", `${externalId}-R`, "HUESPED QA", "15/10/2026", "18/10/2026", "1"]),
    ...tableRow(460, [ignoredRoom, "MANTENIMIENTO", "Inicio", null, "QA", null, null, null]),
  ],
}]));
await writeFile(invalidPdfPath, buildPdf([{ runs: [...tableRow(500, ["Factura", "12345", "Emitida", "hoy"])] }], { header: false, title: null }));

let reception;
let cafeteria;
let importedStayId;
try {
  reception = await CdpPage.open(`${appUrl}/recepcion`);
  await reception.viewport(320);
  await reception.waitFor("document.body.innerText.includes('Estadías con desayuno')");
  if (!await clickButton(reception, "Importar reservas")) throw new Error("No se encontró Importar reservas");
  await reception.waitFor("Boolean(document.querySelector('#desbravador-file'))");

  await reception.upload("#desbravador-file", validPdfPath);
  await reception.waitFor("document.body.innerText.includes('Vista previa') && document.body.innerText.includes('Pendientes de revisión')", 15_000);
  await reception.upload("#desbravador-file", invalidPdfPath);
  await reception.waitFor("Boolean(document.querySelector('[role=alert]'))", 15_000);
  const stalePreview = await reception.evaluate("document.querySelector('[role=dialog]').innerText.includes('Vista previa')");
  if (stalePreview) throw new Error("El preview anterior siguió visible tras seleccionar otro PDF");

  await reception.upload("#desbravador-file", validPdfPath);
  await reception.waitFor("document.body.innerText.includes('Vista previa') && document.body.innerText.includes('No se importará automáticamente')", 15_000);
  for (const width of [320, 375, 390]) {
    await reception.viewport(width);
    await assertFits(reception, `modal importación ${width}px`, "[role=dialog]");
  }
  await reception.screenshot("/private/tmp/import-preview-390.png");

  if (!await clickButton(reception, "Confirmar e importar")) throw new Error("No se encontró Confirmar e importar");
  await reception.waitFor("document.body.innerText.includes('Importación completada') && document.body.innerText.includes('Las reservas importables ya fueron procesadas')", 15_000);
  const resultText = await reception.evaluate("document.querySelector('[role=dialog]').innerText");
  for (const expected of ["Creadas", "Actualizadas", "Ignoradas", "Revisión manual", "No se importó automáticamente"]) {
    if (!resultText.includes(expected)) throw new Error(`El resultado no muestra ${expected}: ${resultText}`);
  }
  await assertFits(reception, "resultado importación 390px", "[role=dialog]");
  await reception.screenshot("/private/tmp/import-result-390.png");
  console.log("IMPORT P0 PASS — preview anterior limpiado, revisión aclarada y resultado visible tras aplicar");

  if (!await clickButton(reception, "Cerrar")) throw new Error("No se encontró Cerrar");
  await reception.waitFor("!document.querySelector('[role=dialog]')");
  await reception.waitFor(`document.body.innerText.includes(${JSON.stringify(room)})`);

  await reception.viewport(320);
  await reception.evaluate("document.querySelector('[aria-label^=\"Elegir fecha:\"]').click()");
  await reception.waitFor("Boolean(document.querySelector('[role=dialog][aria-label=\"Elegir fecha\"]'))");
  for (const width of [320, 375, 390]) {
    await reception.viewport(width);
    await assertFits(reception, `calendario ${width}px`, "[role=dialog][aria-label=\"Elegir fecha\"]");
  }
  await reception.screenshot("/private/tmp/calendar-390.png");
  await reception.evaluate(`([...document.querySelectorAll('[role=dialog][aria-label="Elegir fecha"] button')].find((button) => button.textContent?.trim() === 'Cerrar')).click()`);
  console.log("CALENDAR P0 PASS — sin overflow y con controles táctiles a 320/375/390px");

  cafeteria = await CdpPage.open(`${appUrl}/cafeteria`);
  await cafeteria.waitFor("document.body.innerText.includes('Control de stock')");
  await cafeteria.evaluate("document.querySelector('#tab-stock').click()");
  await cafeteria.waitFor("document.querySelector('#panel-stock').hidden === false && Boolean(document.querySelector('[aria-labelledby=stock-title]'))");
  for (const width of [320, 375, 390]) {
    await cafeteria.viewport(width);
    await assertFits(cafeteria, `inventario ${width}px`, "[aria-labelledby=stock-title]");
  }
  await cafeteria.screenshot("/private/tmp/inventory-390.png");
  console.log("INVENTORY P0 PASS — grilla sin overflow y campos táctiles a 320/375/390px");
} finally {
  try {
    const stays = await fetch(`${appUrl}/api/stays`).then((response) => response.json());
    importedStayId = stays.stays?.find((stay) => stay.roomNumber === room)?.id;
    if (importedStayId) await fetch(`${appUrl}/api/stays/${importedStayId}`, { method: "DELETE" });
  } catch { /* el servidor puede no estar disponible durante una falla */ }
  await reception?.close();
  await cafeteria?.close();
}

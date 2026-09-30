import { writeFile } from "node:fs/promises";

const appUrl = process.env.APP_URL ?? "http://127.0.0.1:5173";
const debuggerUrl = process.env.CHROME_DEBUG_URL ?? "http://127.0.0.1:9222";
const room = `QA-M-${String(Date.now()).slice(-6)}`;

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
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    }
    return result.result.value;
  }

  async waitFor(expression, timeout = 5000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      if (await this.evaluate(expression)) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Timeout esperando: ${expression}`);
  }

  async viewport(width, height = 900) {
    await this.send("Emulation.setDeviceMetricsOverride", {
      width, height, deviceScaleFactor: 1, mobile: width < 600,
    });
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  async screenshot(path) {
    const result = await this.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    await writeFile(path, Buffer.from(result.data, "base64"));
  }

  async close() {
    try { await fetch(`${debuggerUrl}/json/close/${this.targetId}`); } catch { /* ignorar */ }
    this.socket.close();
  }
}

function todayInUruguay() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Montevideo", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const part = (type) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

async function setInput(page, index, value) {
  await page.evaluate(`(() => {
    const input = document.querySelectorAll('[role="dialog"] input')[${index}];
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
}

async function audit(page, route, width) {
  await page.viewport(width);
  const result = await page.evaluate(`(() => {
    const root = document.documentElement;
    const controls = [...document.querySelectorAll('button,input,textarea,summary')]
      .filter((element) => { const rect = element.getBoundingClientRect(); return rect.width > 0 && rect.height > 0; })
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const label = element.closest('label');
        const effective = label ? label.getBoundingClientRect() : rect;
        return { tag: element.tagName, label: element.getAttribute('aria-label') || element.textContent?.trim().slice(0, 30) || element.getAttribute('placeholder'), width: Math.round(Math.max(effective.width, rect.width)), height: Math.round(Math.max(effective.height, rect.height)) };
      });
    return { viewport: innerWidth, scrollWidth: root.scrollWidth, overflow: root.scrollWidth > innerWidth, tooSmall: controls.filter((item) => item.width < 40 || item.height < 40) };
  })()`);
  await page.screenshot(`/private/tmp/${route}-${width}.png`);
  if (result.overflow) throw new Error(`${route} a ${width}px tiene overflow horizontal (${result.scrollWidth}px)`);
  return result;
}

let stayId;
let reception;
let cafeteria;
let browserInventoryBefore;
let browserNoteBefore;
try {
  reception = await CdpPage.open(`${appUrl}/recepcion`);
  cafeteria = await CdpPage.open(`${appUrl}/cafeteria`);
  await reception.waitFor("document.body.innerText.includes('Estadías con desayuno')");
  await cafeteria.waitFor("document.body.innerText.toLowerCase().includes('desayunos · cafetería') && document.body.innerText.toLowerCase().includes('hotel los cedros')");

  await cafeteria.send("Page.addScriptToEvaluateOnNewDocument", {
    source: "sessionStorage.setItem('hlcs-reloads', String((Number(sessionStorage.getItem('hlcs-reloads')) || 0) + 1));",
  });

  await reception.evaluate(`([...document.querySelectorAll('button')].find((button) => button.getAttribute('aria-label') === 'Nueva estadía')).click()`);
  await reception.waitFor("Boolean(document.querySelector('[role=dialog]'))");
  const today = todayInUruguay();
  await setInput(reception, 0, room);
  await setInput(reception, 1, today);
  await setInput(reception, 2, today);
  await setInput(reception, 3, "2");
  await reception.evaluate(`(() => {
    const textarea = document.querySelector('[role="dialog"] textarea');
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    setter.call(textarea, ${JSON.stringify("necesita huevo extra y es celíaco; no toma azúcar, prefiere leche descremada, pan sin sal y fruta de temporada; pide café descafeinado, jugo de naranja fresco y yogurt durazno temprano")});
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await reception.evaluate("document.querySelector('[role=dialog] form').requestSubmit()");
  await reception.waitFor(`document.body.innerText.includes(${JSON.stringify(room)})`, 5000);
  const stays = await fetch(`${appUrl}/api/stays`).then((response) => response.json());
  stayId = stays.stays.find((stay) => stay.roomNumber === room)?.id;
  if (!stayId) throw new Error("La creación desde el formulario de recepción no llegó a la API");

  await new Promise((resolve) => setTimeout(resolve, 16_000));
  await cafeteria.waitFor(`document.body.innerText.includes(${JSON.stringify(room)})`, 3000);

  const clickedEdit = await reception.evaluate(`(() => {
    const article = [...document.querySelectorAll('article')].find((item) => item.innerText.includes(${JSON.stringify(room)}));
    const button = article ? [...article.querySelectorAll('button')].find((item) => (item.getAttribute('aria-label') || '').includes('Editar')) : null;
    if (!button) return false;
    button.click();
    return true;
  })()`);
  if (!clickedEdit) {
    const text = await reception.evaluate("document.body.innerText");
    throw new Error(`No se encontró Editar para ${room}. Pantalla: ${text}`);
  }
  await reception.waitFor("Boolean(document.querySelector('[role=dialog]'))");
  await setInput(reception, 3, "3");
  await reception.evaluate("document.querySelector('[role=dialog] form').requestSubmit()");
  await reception.waitFor(`document.body.innerText.includes('3 pasajeros')`, 5000);
  await new Promise((resolve) => setTimeout(resolve, 16_000));
  const cafeteriaCard = await cafeteria.evaluate(`(() => {
    const card = [...document.querySelectorAll('article')].find((article) => article.innerText.includes(${JSON.stringify(room)}));
    return card?.innerText.replace(/\\s+/g, ' ') ?? '';
  })()`);
  if (!cafeteriaCard.includes("3")) throw new Error(`Polling no reflejó 3 pasajeros: ${cafeteriaCard}`);
  if (!cafeteriaCard.includes("necesita huevo extra y es celíaco; no toma azúcar, prefiere leche descremada, pan sin sal y fruta de temporada; pide café descafeinado, jugo de naranja fresco y yogurt durazno temprano")) throw new Error(`La aclaración de desayuno no llegó a cafetería: ${cafeteriaCard}`);
  const receptionHasNote = await reception.evaluate(`document.body.innerText.includes(${JSON.stringify("necesita huevo extra y es celíaco; no toma azúcar, prefiere leche descremada, pan sin sal y fruta de temporada; pide café descafeinado, jugo de naranja fresco y yogurt durazno temprano")})`);
  if (!receptionHasNote) throw new Error("La aclaración no se ve en la tarjeta de recepción");
  const noteToggleShown = await cafeteria.evaluate(`(() => {
    const card = [...document.querySelectorAll('article')].find((article) => article.innerText.includes(${JSON.stringify(room)}));
    const button = card ? [...card.querySelectorAll('button')].find((item) => item.textContent.includes('Ver más')) : null;
    if (!button) return false;
    button.click();
    return true;
  })()`);
  if (!noteToggleShown) throw new Error("La aclaración larga no mostró el botón 'Ver más'");
  await cafeteria.waitFor(`(() => {
    const card = [...document.querySelectorAll('article')].find((article) => article.innerText.includes(${JSON.stringify(room)}));
    return card ? card.innerText.includes('Ver menos') : false;
  })()`, 3000);
  console.log("M PASS — ambas rutas abiertas; cafetería mostró la aclaración y 'Ver más' la expande por completo");

  const inventory = await fetch(`${appUrl}/api/inventory/${today}`).then((response) => response.json());
  const firstProduct = inventory.items[0];
  browserInventoryBefore = { date: today, productId: firstProduct.productId, receivedQuantity: firstProduct.receivedQuantity, remainingQuantity: firstProduct.remainingQuantity };
  browserNoteBefore = await fetch(`${appUrl}/api/notes/${today}`).then((response) => response.json());
  await cafeteria.evaluate(`(() => {
    const input = document.querySelector('input[aria-label*="cantidad ingresada"]');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, '6,5');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.blur();
    const note = document.querySelector('textarea');
    const noteSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    noteSetter.call(note, 'Nota desde navegador');
    note.dispatchEvent(new Event('input', { bubbles: true }));
    note.blur();
  })()`);
  await new Promise((resolve) => setTimeout(resolve, 1200));
  await cafeteria.send("Page.reload", { ignoreCache: true });
  await new Promise((resolve) => setTimeout(resolve, 800));
  await cafeteria.waitFor("document.body.innerText.includes('Desayunos por habitación') && document.body.innerText.includes('Control de stock')", 5000);
  await cafeteria.waitFor(`document.querySelector('input[aria-label*="cantidad ingresada"]')?.value === "6.5"`, 5000);
  const persistedBrowserValues = await cafeteria.evaluate(`({
    inventory: document.querySelector('input[aria-label*="cantidad ingresada"]')?.value,
    note: document.querySelector('textarea')?.value,
  })`);
  if (persistedBrowserValues.inventory !== "6.5" || persistedBrowserValues.note !== "Nota desde navegador") {
    throw new Error(`Autosave/recarga de navegador falló: ${JSON.stringify(persistedBrowserValues)}`);
  }
  console.log("J/K BROWSER PASS — inventario decimal y nota persisten tras recargar la página");

  const loadsAtCheckStart = (await cafeteria.evaluate("Number(sessionStorage.getItem('hlcs-reloads')) || 0"));
  await cafeteria.evaluate(`(() => {
    const q = document.querySelector('input[type=search]');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(q, ${JSON.stringify(room)});
    q.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('#tab-stock').click();
    return true;
  })()`);
  await cafeteria.waitFor(`document.querySelector('#tab-stock').getAttribute('aria-selected') === 'true'`);
  const pollStateBefore = await cafeteria.evaluate(`(() => ({
    stock: document.querySelector('#tab-stock').getAttribute('aria-selected'),
    rooms: document.querySelector('#tab-rooms').getAttribute('aria-selected'),
    stockVisible: document.querySelector('#panel-stock').hidden === false,
    roomsVisible: document.querySelector('#panel-rooms').hidden === false,
    date: document.querySelector('input[type=date]').value,
    search: document.querySelector('input[type=search]').value,
  }))()`);
  await new Promise((resolve) => setTimeout(resolve, 17_000));
  const pollStateAfter = await cafeteria.evaluate(`(() => ({
    stock: document.querySelector('#tab-stock').getAttribute('aria-selected'),
    rooms: document.querySelector('#tab-rooms').getAttribute('aria-selected'),
    stockVisible: document.querySelector('#panel-stock').hidden === false,
    roomsVisible: document.querySelector('#panel-rooms').hidden === false,
    date: document.querySelector('input[type=date]').value,
    search: document.querySelector('input[type=search]').value,
  }))()`);
  const loadsAtCheckEnd = (await cafeteria.evaluate("Number(sessionStorage.getItem('hlcs-reloads')) || 0"));
  const tabPersisted = pollStateAfter.stock === "true" && pollStateAfter.rooms === "false"
    && pollStateAfter.stockVisible && !pollStateAfter.roomsVisible;
  const searchPersisted = pollStateAfter.search === pollStateBefore.search;
  const datePersisted = pollStateAfter.date === pollStateBefore.date;
  const noReload = loadsAtCheckEnd === loadsAtCheckStart;
  if (!tabPersisted || !searchPersisted || !datePersisted || !noReload) {
    throw new Error(`El refresh automático reseteó la pantalla: antes=${JSON.stringify(pollStateBefore)} después=${JSON.stringify(pollStateAfter)} cargas=${loadsAtCheckStart}->${loadsAtCheckEnd}`);
  }
  await cafeteria.evaluate(`document.querySelector('#tab-rooms').click()`);
  await cafeteria.waitFor(`document.querySelector('#tab-rooms').getAttribute('aria-selected') === 'true'`);
  const backOnRooms = await cafeteria.evaluate(`(() => {
    const search = document.querySelector('input[type=search]').value;
    const card = [...document.querySelectorAll('article')].find((article) => article.innerText.includes(${JSON.stringify(room)}));
    return { search, row: Boolean(card) };
  })()`);
  if (!backOnRooms.row || backOnRooms.search !== room) {
    throw new Error(`Al volver a Habitaciones se perdió la búsqueda o la fila: ${JSON.stringify(backOnRooms)}`);
  }
  console.log("N PASS — un refresh automático mantiene la pestaña activa, la fecha y la búsqueda sin recargar la página");

  for (const width of [390, 768, 1280]) {
    const receptionAudit = await audit(reception, "recepcion", width);
    const cafeteriaAudit = await audit(cafeteria, "cafeteria", width);
    const small = [...receptionAudit.tooSmall, ...cafeteriaAudit.tooSmall];
    console.log(`RESPONSIVE ${width}px PASS — recepción ${receptionAudit.scrollWidth}/${receptionAudit.viewport}, cafetería ${cafeteriaAudit.scrollWidth}/${cafeteriaAudit.viewport}, controles pequeños visibles: ${JSON.stringify(small)}`);
  }
  await cafeteria.viewport(390);
  await cafeteria.evaluate("document.querySelector('#tab-stock').click()");
  await cafeteria.waitFor("document.querySelector('#panel-stock').hidden === false");
  await cafeteria.evaluate("document.querySelector('[aria-labelledby=stock-title]').scrollIntoView()");
  await cafeteria.screenshot("/private/tmp/cafeteria-stock-390.png");
  await reception.viewport(390);
  await reception.evaluate(`([...document.querySelectorAll('button')].find((button) => button.getAttribute('aria-label') === 'Nueva estadía')).click()`);
  await reception.waitFor("Boolean(document.querySelector('[role=dialog]'))");
  const dialogFits = await reception.evaluate(`(() => { const rect = document.querySelector('[role=dialog]').getBoundingClientRect(); return rect.left >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight; })()`);
  if (!dialogFits) throw new Error("El formulario de recepción no cabe en el viewport móvil");
  await reception.screenshot("/private/tmp/recepcion-modal-390.png");
  console.log("RESPONSIVE MODAL PASS — formulario completo dentro del viewport de 390px");
} finally {
  if (stayId) await fetch(`${appUrl}/api/stays/${stayId}`, { method: "DELETE" });
  if (browserInventoryBefore) await fetch(`${appUrl}/api/inventory/${browserInventoryBefore.date}/products/${browserInventoryBefore.productId}`, {
    method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(browserInventoryBefore),
  });
  if (browserNoteBefore) await fetch(`${appUrl}/api/notes/${browserNoteBefore.date}`, {
    method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ content: browserNoteBefore.content }),
  });
  await reception?.close();
  await cafeteria?.close();
}

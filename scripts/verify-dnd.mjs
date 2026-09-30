import { writeFile } from "node:fs/promises";

const appUrl = process.env.APP_URL ?? "http://127.0.0.1:5173";
const debuggerUrl = process.env.CHROME_DEBUG_URL ?? "http://127.0.0.1:9222";
const ROLLBACK_MESSAGE = "No se pudo guardar el orden. Intentá nuevamente.";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class CdpPage {
  constructor(socket, targetId) {
    this.socket = socket;
    this.targetId = targetId;
    this.nextId = 1;
    this.pending = new Map();
    this.handlers = new Map();
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (!message.id) {
        for (const handler of this.handlers.get(message.method) ?? []) handler(message.params);
        return;
      }
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

  on(method, handler) {
    if (!this.handlers.has(method)) this.handlers.set(method, []);
    this.handlers.get(method).push(handler);
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
      await sleep(100);
    }
    throw new Error(`Timeout esperando: ${expression}`);
  }

  async viewport(width, height = 900) {
    await this.send("Emulation.setDeviceMetricsOverride", {
      width, height, deviceScaleFactor: 1, mobile: width < 600,
    });
    await sleep(200);
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

const rowSelector = (id) => `[data-product-id="${id}"]`;

async function dragPoints(page, fromId, toId) {
  const points = await page.evaluate(`(() => {
    const row = document.querySelector(${JSON.stringify(rowSelector(fromId))});
    const to = document.querySelector(${JSON.stringify(rowSelector(toId))});
    if (!row || !to) return null;
    row.scrollIntoView({ block: 'center', inline: 'nearest' });
    const a = row.getBoundingClientRect();
    const b = to.getBoundingClientRect();
    const down = a.top <= b.top;
    return {
      x1: a.left + a.width * 0.35,
      y1: a.top + a.height / 2,
      x2: b.left + b.width / 2,
      y2: b.top + b.height * (down ? 0.8 : 0.2),
      viewport: innerHeight,
    };
  })()`);
  if (!points) throw new Error(`No encontré origen ${fromId} o destino ${toId}`);
  return points;
}

function assertInside(selector, points) {
  if (points.y1 < 0 || points.y1 > points.viewport || points.y2 < 0 || points.y2 > points.viewport) {
    throw new Error(`${selector}: coordenadas fuera del viewport (${points.y1}, ${points.y2} de ${points.viewport})`);
  }
}

async function mouseDrag(page, fromId, toId, { onBeforeRelease } = {}) {
  const points = await dragPoints(page, fromId, toId);
  assertInside(`mouse ${fromId}->${toId}`, points);
  const steps = 18;
  await page.send("Input.dispatchMouseEvent", { type: "mousePressed", x: points.x1, y: points.y1, button: "left", buttons: 1, clickCount: 1 });
  for (let step = 1; step <= steps; step += 1) {
    const t = step / steps;
    await page.send("Input.dispatchMouseEvent", {
      type: "mouseMoved", button: "left", buttons: 1,
      x: points.x1 + (points.x2 - points.x1) * t,
      y: points.y1 + (points.y2 - points.y1) * t,
    });
    await sleep(25);
  }
  if (onBeforeRelease) await onBeforeRelease(points);
  await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: points.x2, y: points.y2, button: "left", buttons: 1, clickCount: 1 });
  await sleep(400);
}

async function touchDrag(page, fromId, toId, { onBeforeRelease } = {}) {
  await page.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
  const points = await dragPoints(page, fromId, toId);
  assertInside(`touch ${fromId}->${toId}`, points);
  const steps = 18;
  await page.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: points.x1, y: points.y1 }] });
  await sleep(400);
  for (let step = 1; step <= steps; step += 1) {
    const t = step / steps;
    await page.send("Input.dispatchTouchEvent", {
      type: "touchMove", touchPoints: [{ x: points.x1 + (points.x2 - points.x1) * t, y: points.y1 + (points.y2 - points.y1) * t }],
    });
    await sleep(25);
  }
  if (onBeforeRelease) await onBeforeRelease(points);
  await page.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await sleep(400);
  await page.send("Emulation.setTouchEmulationEnabled", { enabled: false });
}

const domOrder = (page) => page.evaluate("[...document.querySelectorAll('[data-product-id]')].map((el) => Number(el.dataset.productId))");

async function apiOrder() {
  const data = await fetch(`${appUrl}/api/products`).then((response) => response.json());
  return data.products.map((product) => product.id);
}

function sameOrder(a, b) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

async function expectOrder(page, expected, label) {
  const dom = await domOrder(page);
  if (!sameOrder(dom, expected)) throw new Error(`${label}: DOM esperado ${expected.join(",")} pero fue ${dom.join(",")}`);
  const api = await apiOrder();
  if (!sameOrder(api, expected)) throw new Error(`${label}: API esperado ${expected.join(",")} pero fue ${api.join(",")}`);
}

async function restoreOrder(ids) {
  await fetch(`${appUrl}/api/products/order`, {
    method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ productIds: ids }),
  });
}

async function openProductManager(page) {
  await page.evaluate("document.querySelector('#tab-stock').click()");
  await page.waitFor("document.querySelector('#tab-stock').getAttribute('aria-selected') === 'true'");
  const manageButton = await page.evaluate(`([...document.querySelectorAll('button')].find((button) => (button.textContent || '').includes('Administrar productos')))?.textContent || null`);
  if (!manageButton) throw new Error("El panel de stock no ofrece 'Administrar productos'");
  await page.evaluate(`([...document.querySelectorAll('button')].find((button) => (button.textContent || '').includes('Administrar productos'))).click()`);
  await page.waitFor("Boolean(document.querySelector('[data-product-id]'))", 8000);
}

let page;
let originalIds = [];
try {
  page = await CdpPage.open(`${appUrl}/cafeteria`);
  await page.waitFor("document.body.innerText.includes('Desayunos · Cafetería')", 10000);

  originalIds = await apiOrder();
  if (originalIds.length < 4) throw new Error(`Se necesitan al menos 4 productos para probar; hay ${originalIds.length}`);

  await openProductManager(page);

  await page.viewport(1280, 1200);
  const fullHeight = await page.evaluate("document.documentElement.scrollHeight");
  await page.viewport(1280, Math.min(fullHeight + 400, 20000));
  await page.evaluate("window.scrollTo(0, 0)");
  await sleep(200);
  await page.evaluate(`document.querySelector('[data-product-id]').scrollIntoView({ block: 'center' })`);
  await sleep(200);

  await expectOrder(page, originalIds, "orden inicial antes de arrastrar");

  const [idA, idB, idC, idD] = originalIds;
  const idLast = originalIds[originalIds.length - 1];

  let chipSeen = false;
  await mouseDrag(page, idA, idLast, {
    onBeforeRelease: async () => {
      chipSeen = await page.evaluate("document.body.innerText.includes('posición') && document.body.innerText.includes('de " + originalIds.length + "')");
      await page.screenshot("/private/tmp/dnd-during.png");
    },
  });
  if (!chipSeen) throw new Error("No apareció el indicador de posición durante el arrastre con mouse");
  const expectedFirstToLast = [...originalIds.slice(1), idA];
  await expectOrder(page, expectedFirstToLast, "mouse primero→último");
  await page.screenshot("/private/tmp/dnd-mouse-first-last.png");
  console.log("DND MOUSE PASS — arrastrar toda la fila (sin handle de puntos) del primero al final muestra el chip y persiste");

  await mouseDrag(page, idA, idB);
  await expectOrder(page, originalIds, "mouse último→primero");
  console.log("DND MOUSE PASS — arrastrar toda la fila el último sobre el primero restaura el orden original");

  await mouseDrag(page, idA, idD);
  const expectedMiddle = [idB, idC, idD, idA, ...originalIds.slice(4)];
  await expectOrder(page, expectedMiddle, "mouse a posición intermedia");
  await page.screenshot("/private/tmp/dnd-mouse-middle.png");
  console.log("DND MOUSE PASS — soltar en una posición intermedia deja el producto exactamente en esa ranura");

  await page.send("Page.reload", { ignoreCache: true });
  await sleep(800);
  await page.waitFor("document.body.innerText.includes('Desayunos · Cafetería')", 8000);
  await openProductManager(page);
  await sleep(300);
  await expectOrder(page, expectedMiddle, "persistencia tras recarga");
  console.log("DND RELOAD PASS — el nuevo orden sobrevive a una recarga real de la página (DOM y API)");

  await page.send("Fetch.enable", { patterns: [{ urlPattern: "*products/order*", requestStage: "Request" }] });
  let rollbackIntercepts = 0;
  page.on("Fetch.requestPaused", (params) => {
    rollbackIntercepts += 1;
    void page.send("Fetch.fulfillRequest", {
      requestId: params.requestId,
      responseCode: 500,
      responseHeaders: [{ name: "content-type", value: "application/json" }],
      body: Buffer.from(JSON.stringify({ error: { code: "internal_error", message: ROLLBACK_MESSAGE } })).toString("base64"),
    });
  });
  await mouseDrag(page, idB, idD);
  if (rollbackIntercepts !== 1) throw new Error(`Se esperaba 1 intercepción de ${ROLLBACK_MESSAGE}; hubo ${rollbackIntercepts}`);
  await page.waitFor(`document.body.innerText.includes(${JSON.stringify(ROLLBACK_MESSAGE)})`, 4000);
  await sleep(600);
  await expectOrder(page, expectedMiddle, "rollback tras error 500");
  await page.screenshot("/private/tmp/dnd-rollback.png");
  await page.send("Fetch.disable");
  console.log("DND ROLLBACK PASS — un 500 al guardar muestra el error en español y revierte la lista al orden del servidor");

  const beforeTouch = await domOrder(page);
  const touchSource = beforeTouch[0];
  const touchTarget = beforeTouch[beforeTouch.length - 1];
  let touchChipSeen = false;
  await touchDrag(page, touchSource, touchTarget, {
    onBeforeRelease: async () => {
      touchChipSeen = await page.evaluate("document.body.innerText.includes('posición')");
    },
  });
  if (!touchChipSeen) throw new Error("No apareció el indicador de posición durante el arrastre táctil");
  const expectedTouch = [...beforeTouch.slice(1), touchSource];
  await expectOrder(page, expectedTouch, "touch primero→último");
  await page.screenshot("/private/tmp/dnd-touch.png");
  console.log("DND TOUCH PASS — en touch, mantener presionada la fila y arrastrar reordena (sin bloquear el scroll)");

  const menuBefore = await domOrder(page);
  const [menuFirst, menuSecond] = menuBefore;
  const menuOpened = await page.evaluate(`(() => {
    const button = document.querySelector('[data-product-id="${menuFirst}"] button[aria-haspopup=menu]');
    if (!button) return false;
    button.click();
    return true;
  })()`);
  if (!menuOpened) throw new Error("No se encontró el menú de acciones del producto");
  await page.waitFor("Boolean(document.querySelector('[role=menu]'))");
  const movedDown = await page.evaluate(`(() => {
    const item = [...document.querySelectorAll('[role=menu] [role=menuitem]')].find((button) => (button.textContent || '').includes('Mover abajo'));
    if (!item) return false;
    item.click();
    return true;
  })()`);
  if (!movedDown) throw new Error("El menú no ofreció 'Mover abajo'");
  await sleep(600);
  const expectedMenu = [menuSecond, menuFirst, ...menuBefore.slice(2)];
  await expectOrder(page, expectedMenu, "menú Mover abajo");
  console.log("DND MENU PASS — la alternativa de teclado 'Mover arriba/abajo' sigue reordenando y persiste");

  await restoreOrder(originalIds);
  console.log("DND CLEANUP — orden original restaurado");
} finally {
  try { if (page) await page.send("Fetch.disable"); } catch { /* ignorar */ }
  if (originalIds.length) {
    try { await restoreOrder(originalIds); } catch { /* ignorar */ }
  }
  if (page) await page.close();
}

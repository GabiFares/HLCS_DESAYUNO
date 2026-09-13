const baseUrl = process.env.APP_URL ?? "http://127.0.0.1:5173";

function uruguayDate(offset = 0) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Montevideo", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const part = (type) => parts.find((item) => item.type === type)?.value;
  const current = `${part("year")}-${part("month")}-${part("day")}`;
  const [year, month, day] = current.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + offset)).toISOString().slice(0, 10);
}

async function call(path, init) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: init?.body ? { "content-type": "application/json" } : undefined,
  });
  if (!response.ok) throw new Error(`${init?.method ?? "GET"} ${path}: ${response.status} ${await response.text()}`);
  return response.status === 204 ? undefined : response.json();
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const today = uruguayDate();
const yesterday = uruguayDate(-1);
const tomorrow = uruguayDate(1);
const suffix = String(Date.now()).slice(-6);
const createdStayIds = [];
let inventoryBefore;
let inventoryYesterdayBefore;
let noteBefore;
let noteYesterdayBefore;

async function createStay(roomNumber, checkInDate, checkOutDate, guestCount, breakfastNotes) {
  const response = await call("/api/stays", { method: "POST", body: JSON.stringify({ roomNumber, checkInDate, checkOutDate, guestCount, breakfastNotes }) });
  createdStayIds.push(response.stay.id);
  return response.stay;
}

try {
  const stayA = await createStay(`QA-A-${suffix}`, today, tomorrow, 3);
  let day = await call(`/api/breakfast/${today}`);
  assert(day.stays.some((stay) => stay.stayId === stayA.id), "A: la estadía no apareció en cafetería");
  console.log("A PASS — estadía activa creada y visible en cafetería");

  await call(`/api/breakfast/${today}/stays/${stayA.id}`, { method: "PATCH", body: JSON.stringify({ servedCount: 1 }) });
  day = await call(`/api/breakfast/${today}`);
  assert(day.stays.find((stay) => stay.stayId === stayA.id)?.servedCount === 1 && day.pendingRooms >= 1, "B: el desayuno parcial no quedó pendiente");
  console.log("B PASS — 1/3 continúa pendiente");

  await call(`/api/breakfast/${today}/stays/${stayA.id}`, { method: "PATCH", body: JSON.stringify({ servedCount: 3 }) });
  day = await call(`/api/breakfast/${today}`);
  assert(day.stays.find((stay) => stay.stayId === stayA.id)?.servedCount === 3, "C: no se guardó 3/3");
  assert(!day.stays.filter((stay) => stay.servedCount < stay.guestCount).some((stay) => stay.stayId === stayA.id), "C: la habitación completa sigue pendiente");
  console.log("C PASS — 3/3 deja de estar pendiente");

  const stayD = await createStay(`QA-D-${suffix}`, yesterday, today, 2);
  day = await call(`/api/breakfast/${today}`);
  assert(day.stays.some((stay) => stay.stayId === stayD.id && stay.servedCount === 0), "D: checkout de hoy no aparece pendiente");
  console.log("D PASS — checkout de hoy con 0/2 permanece pendiente");

  await call(`/api/stays/${stayD.id}`, { method: "PATCH", body: JSON.stringify({ completed: true }) });
  day = await call(`/api/breakfast/${today}`);
  assert(!day.stays.some((stay) => stay.stayId === stayD.id), "E: estadía finalizada sigue bloqueando");
  console.log("E PASS — checkout finalizado deja de bloquear el día");
  assert(day.canClose === true && day.pendingRooms === 0, "F: no habilitó cierre sin pendientes");
  console.log("F PASS — canClose=true sin habitaciones pendientes");

  const stayG = await createStay(`QA-G-${suffix}`, today, today, 3);
  await call(`/api/breakfast/${today}/stays/${stayG.id}`, { method: "PATCH", body: JSON.stringify({ servedCount: 3 }) });
  await call(`/api/stays/${stayG.id}`, { method: "PATCH", body: JSON.stringify({ guestCount: 2 }) });
  day = await call(`/api/breakfast/${today}`);
  const clamped = day.stays.find((stay) => stay.stayId === stayG.id);
  assert(clamped?.guestCount === 2 && clamped.servedCount === 2, "G: quedó un estado inválido al reducir pasajeros");
  console.log("G PASS — reducción de 3 a 2 recorta el registro a 2/2");

  const stayH = await createStay(`QA-H-${suffix}`, yesterday, today, 2);
  await call(`/api/breakfast/${yesterday}/stays/${stayH.id}`, { method: "PATCH", body: JSON.stringify({ servedCount: 1 }) });
  await call(`/api/breakfast/${today}/stays/${stayH.id}`, { method: "PATCH", body: JSON.stringify({ servedCount: 2 }) });
  const yesterdayDay = await call(`/api/breakfast/${yesterday}`);
  day = await call(`/api/breakfast/${today}`);
  assert(yesterdayDay.stays.find((stay) => stay.stayId === stayH.id)?.servedCount === 1, "H: valor del día anterior incorrecto");
  assert(day.stays.find((stay) => stay.stayId === stayH.id)?.servedCount === 2, "H: valor de hoy incorrecto");
  console.log("H PASS — conteos 1/2 y 2/2 independientes por fecha");

  const stayM = await createStay(`QA-M-${suffix}`, today, tomorrow, 2, "es celíaco");
  assert(stayM.breakfastNotes === "es celíaco", "M: la aclaración no se guardó al crear");
  day = await call(`/api/breakfast/${today}`);
  assert(day.stays.find((stay) => stay.stayId === stayM.id)?.breakfastNotes === "es celíaco", "M: la aclaración no llegó a cafetería");
  const updatedM = await call(`/api/stays/${stayM.id}`, { method: "PATCH", body: JSON.stringify({ breakfastNotes: "  prefiere sin sal  " }) });
  assert(updatedM.stay.breakfastNotes === "prefiere sin sal", "M: la aclaración no se actualizó");
  const clearedM = await call(`/api/stays/${stayM.id}`, { method: "PATCH", body: JSON.stringify({ breakfastNotes: "" }) });
  assert(clearedM.stay.breakfastNotes === null, "M: al vaciar la aclaración debería quedar null");
  const emptyM = await createStay(`QA-M2-${suffix}`, today, tomorrow, 1);
  assert(emptyM.breakfastNotes === null, "M: sin aclaración enviada debería venir null");
  console.log("M PASS — la aclaración de desayuno se guarda, llega a cafetería, se edita y se limpia");

  const servedSum = day.stays.reduce((sum, stay) => sum + stay.servedCount, 0);
  assert(day.totalServed === servedSum, `I: total ${day.totalServed} distinto de suma ${servedSum}`);
  console.log(`I PASS — total diario ${day.totalServed} coincide con suma de registros`);

  const inventory = await call(`/api/inventory/${today}`);
  assert(inventory.items.length >= 37, "J: no aparecieron los productos activos");
  const product = inventory.items[0];
  inventoryBefore = { productId: product.productId, received: product.receivedQuantity, remaining: product.remainingQuantity };
  await call(`/api/inventory/${today}/products/${product.productId}`, { method: "PUT", body: JSON.stringify({ receivedQuantity: 2.5, remainingQuantity: 1.25 }) });
  const reloadedInventory = await call(`/api/inventory/${today}`);
  const persisted = reloadedInventory.items.find((item) => item.productId === product.productId);
  assert(persisted?.receivedQuantity === 2.5 && persisted.remainingQuantity === 1.25, "J: inventario no persistió");
  console.log(`J PASS — ${inventory.items.length} productos; 2.5/1.25 persiste tras recarga`);

  noteBefore = await call(`/api/notes/${today}`);
  noteYesterdayBefore = await call(`/api/notes/${yesterday}`);
  const qaNote = `Nota QA ${suffix}`;
  await call(`/api/notes/${today}`, { method: "PUT", body: JSON.stringify({ content: qaNote }) });
  await call(`/api/notes/${yesterday}`, { method: "PUT", body: JSON.stringify({ content: `Anterior ${suffix}` }) });
  const noteReloaded = await call(`/api/notes/${today}`);
  assert(noteReloaded.content === qaNote, "K: nota de hoy no persistió");
  console.log("K PASS — nota persiste al cambiar de fecha y volver");

  const inventoryYesterday = await call(`/api/inventory/${yesterday}`);
  const historicalProduct = inventoryYesterday.items[0];
  inventoryYesterdayBefore = { productId: historicalProduct.productId, received: historicalProduct.receivedQuantity, remaining: historicalProduct.remainingQuantity };
  await call(`/api/inventory/${yesterday}/products/${historicalProduct.productId}`, { method: "PUT", body: JSON.stringify({ receivedQuantity: 7, remainingQuantity: 4 }) });
  const historicalInventoryReloaded = await call(`/api/inventory/${yesterday}`);
  const historicalNote = await call(`/api/notes/${yesterday}`);
  assert((await call(`/api/breakfast/${yesterday}`)).stays.find((stay) => stay.stayId === stayH.id)?.servedCount === 1, "L: desayuno histórico incorrecto");
  assert(historicalInventoryReloaded.items.find((item) => item.productId === historicalProduct.productId)?.remainingQuantity === 4, "L: inventario histórico incorrecto");
  assert(historicalNote.content === `Anterior ${suffix}`, "L: nota histórica incorrecta");
  console.log("L PASS — desayuno, inventario y nota históricos corresponden a la fecha");
} finally {
  for (const id of createdStayIds) {
    try { await call(`/api/stays/${id}`, { method: "DELETE" }); } catch { /* best-effort cleanup */ }
  }
  if (inventoryBefore) {
    await call(`/api/inventory/${today}/products/${inventoryBefore.productId}`, { method: "PUT", body: JSON.stringify({ receivedQuantity: inventoryBefore.received, remainingQuantity: inventoryBefore.remaining }) });
  }
  if (inventoryYesterdayBefore) {
    await call(`/api/inventory/${yesterday}/products/${inventoryYesterdayBefore.productId}`, { method: "PUT", body: JSON.stringify({ receivedQuantity: inventoryYesterdayBefore.received, remainingQuantity: inventoryYesterdayBefore.remaining }) });
  }
  if (noteBefore) await call(`/api/notes/${today}`, { method: "PUT", body: JSON.stringify({ content: noteBefore.content }) });
  if (noteYesterdayBefore) await call(`/api/notes/${yesterday}`, { method: "PUT", body: JSON.stringify({ content: noteYesterdayBefore.content }) });
}

import type { InventoryItem, Product } from "../shared/types";
import { HttpError, json, parseId, readJson } from "./http";
import { calendarDate, nullableQuantity, optionalText, requiredText } from "./validation";

interface InventoryRow { product_id: number; name: string; unit: string | null; received_quantity: number | null; remaining_quantity: number | null }
interface ProductRow { id: number; name: string; unit: string | null; active: number; display_order: number }

const mapProduct = (row: ProductRow): Product => ({ id: row.id, name: row.name, unit: row.unit,
  active: row.active === 1, displayOrder: row.display_order });

export async function getInventory(db: D1Database, rawDate: string): Promise<Response> {
  const date = calendarDate(rawDate, "La fecha");
  const result = await db.prepare(
    `SELECT p.id AS product_id, p.name, p.unit, i.received_quantity, i.remaining_quantity
     FROM products p LEFT JOIN daily_inventory i ON i.product_id = p.id AND i.inventory_date = ?
     WHERE p.active = 1 OR i.product_id IS NOT NULL ORDER BY p.display_order, p.name COLLATE NOCASE`,
  ).bind(date).all<InventoryRow>();
  const items: InventoryItem[] = result.results.map((row) => ({ productId: row.product_id,
    name: row.name, unit: row.unit, receivedQuantity: row.received_quantity,
    remainingQuantity: row.remaining_quantity }));
  return json({ date, items });
}

export async function updateInventory(db: D1Database, request: Request, rawDate: string, rawProductId: string): Promise<Response> {
  const date = calendarDate(rawDate, "La fecha");
  const productId = parseId(rawProductId, "identificador de producto");
  const product = await db.prepare("SELECT id FROM products WHERE id = ?").bind(productId).first();
  if (!product) throw new HttpError(404, "No se encontró el producto.", "product_not_found");
  const body = await readJson(request);
  const receivedQuantity = nullableQuantity(body.receivedQuantity, "La cantidad ingresada");
  const remainingQuantity = nullableQuantity(body.remainingQuantity, "El stock restante");
  await db.prepare(
    `INSERT INTO daily_inventory (product_id, inventory_date, received_quantity, remaining_quantity)
     VALUES (?, ?, ?, ?) ON CONFLICT(product_id, inventory_date) DO UPDATE SET
     received_quantity = excluded.received_quantity, remaining_quantity = excluded.remaining_quantity,
     updated_at = CURRENT_TIMESTAMP`,
  ).bind(productId, date, receivedQuantity, remainingQuantity).run();
  return json({ productId, date, receivedQuantity, remainingQuantity });
}

export async function listProducts(db: D1Database): Promise<Response> {
  const result = await db.prepare(
    "SELECT id, name, unit, active, display_order FROM products ORDER BY display_order, name COLLATE NOCASE",
  ).all<ProductRow>();
  return json({ products: result.results.map(mapProduct) });
}

export async function createProduct(db: D1Database, request: Request): Promise<Response> {
  const body = await readJson(request);
  const name = requiredText(body.name, "El nombre", 100);
  const unit = optionalText(body.unit, "La unidad", 20);
  const duplicate = await db.prepare("SELECT id FROM products WHERE name = ?")
    .bind(name).first<{ id: number }>();
  if (duplicate) throw new HttpError(409, "Ya existe un producto con ese nombre.", "duplicate_product");
  const order = await db.prepare("SELECT COALESCE(MAX(display_order), 0) + 1 AS next_order FROM products")
    .first<{ next_order: number }>();
  const result = await db.prepare("INSERT INTO products (name, unit, display_order) VALUES (?, ?, ?)")
    .bind(name, unit, order?.next_order ?? 1).run();
  const row = await db.prepare("SELECT id, name, unit, active, display_order FROM products WHERE id = ?")
    .bind(result.meta.last_row_id).first<ProductRow>();
  return json({ product: row ? mapProduct(row) : null }, { status: 201 });
}

export async function updateProduct(db: D1Database, request: Request, rawProductId: string): Promise<Response> {
  const id = parseId(rawProductId, "identificador de producto");
  const current = await db.prepare("SELECT id, name, unit, active, display_order FROM products WHERE id = ?")
    .bind(id).first<ProductRow>();
  if (!current) throw new HttpError(404, "No se encontró el producto.", "product_not_found");
  const body = await readJson(request);
  const name = body.name === undefined ? current.name : requiredText(body.name, "El nombre", 100);
  const unit = body.unit === undefined ? current.unit : optionalText(body.unit, "La unidad", 20);
  const active = body.active === undefined ? current.active === 1 : body.active;
  if (typeof active !== "boolean") throw new HttpError(400, "El estado del producto no es válido.", "validation_error");
  if (body.name !== undefined) {
    const duplicate = await db.prepare("SELECT id FROM products WHERE name = ? AND id != ?")
      .bind(name, id).first<{ id: number }>();
    if (duplicate) throw new HttpError(409, "Ya existe un producto con ese nombre.", "duplicate_product");
  }
  await db.prepare(
    "UPDATE products SET name = ?, unit = ?, active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
  ).bind(name, unit, active ? 1 : 0, id).run();
  const row = await db.prepare("SELECT id, name, unit, active, display_order FROM products WHERE id = ?")
    .bind(id).first<ProductRow>();
  return json({ product: row ? mapProduct(row) : null });
}

export async function reorderProducts(db: D1Database, request: Request): Promise<Response> {
  const body = await readJson(request);
  if (!Array.isArray(body.productIds) || body.productIds.some((id) => !Number.isInteger(id) || Number(id) <= 0)) {
    throw new HttpError(400, "El orden de productos no es válido.", "validation_error");
  }
  const ids = body.productIds as number[];
  if (new Set(ids).size !== ids.length) throw new HttpError(400, "El orden contiene productos repetidos.", "validation_error");
  const count = await db.prepare("SELECT COUNT(*) AS count FROM products").first<{ count: number }>();
  if (ids.length !== count?.count) throw new HttpError(400, "El orden debe incluir todos los productos.", "validation_error");
  await db.batch(ids.map((id, index) => db.prepare(
    "UPDATE products SET display_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
  ).bind(index + 1, id)));
  return json({ productIds: ids });
}

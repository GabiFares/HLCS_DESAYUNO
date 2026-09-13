import { getBreakfastDay, updateBreakfastCount } from "./breakfast";
import { HttpError, json } from "./http";
import { createProduct, getInventory, listProducts, reorderProducts, updateInventory, updateProduct } from "./inventory";
import { getNote, updateNote } from "./notes";
import { createStay, deleteStay, listStays, updateStay } from "./stays";

interface Env { DB: D1Database }

async function route(request: Request, env: Env): Promise<Response> {
  const { pathname } = new URL(request.url);
  const method = request.method;
  if (method === "GET" && pathname === "/api/health") return json({ ok: true });
  if (pathname === "/api/stays" && method === "GET") return listStays(env.DB);
  if (pathname === "/api/stays" && method === "POST") return createStay(env.DB, request);

  let match = /^\/api\/stays\/(\d+)$/.exec(pathname);
  if (match?.[1] && method === "PATCH") return updateStay(env.DB, request, match[1]);
  if (match?.[1] && method === "DELETE") return deleteStay(env.DB, match[1]);
  match = /^\/api\/breakfast\/(\d{4}-\d{2}-\d{2})$/.exec(pathname);
  if (match?.[1] && method === "GET") return getBreakfastDay(env.DB, match[1]);
  match = /^\/api\/breakfast\/(\d{4}-\d{2}-\d{2})\/stays\/(\d+)$/.exec(pathname);
  if (match?.[1] && match[2] && method === "PATCH") return updateBreakfastCount(env.DB, request, match[1], match[2]);
  match = /^\/api\/inventory\/(\d{4}-\d{2}-\d{2})$/.exec(pathname);
  if (match?.[1] && method === "GET") return getInventory(env.DB, match[1]);
  match = /^\/api\/inventory\/(\d{4}-\d{2}-\d{2})\/products\/(\d+)$/.exec(pathname);
  if (match?.[1] && match[2] && method === "PUT") return updateInventory(env.DB, request, match[1], match[2]);
  match = /^\/api\/notes\/(\d{4}-\d{2}-\d{2})$/.exec(pathname);
  if (match?.[1] && method === "GET") return getNote(env.DB, match[1]);
  if (match?.[1] && method === "PUT") return updateNote(env.DB, request, match[1]);
  if (pathname === "/api/products" && method === "GET") return listProducts(env.DB);
  if (pathname === "/api/products" && method === "POST") return createProduct(env.DB, request);
  if (pathname === "/api/products/order" && method === "PUT") return reorderProducts(env.DB, request);
  match = /^\/api\/products\/(\d+)$/.exec(pathname);
  if (match?.[1] && method === "PATCH") return updateProduct(env.DB, request, match[1]);
  throw new HttpError(404, "No se encontró el endpoint solicitado.", "not_found");
}

export default {
  async fetch(request, env): Promise<Response> {
    try {
      return await route(request, env);
    } catch (error) {
      if (error instanceof HttpError) {
        return json({ error: { code: error.code, message: error.message } }, { status: error.status });
      }
      console.error(error);
      return json({ error: { code: "internal_error", message: "Ocurrió un error inesperado. Intentá nuevamente." } }, { status: 500 });
    }
  },
} satisfies ExportedHandler<Env>;

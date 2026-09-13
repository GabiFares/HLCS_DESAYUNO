import type { BreakfastDay, InventoryDay, Product, Stay } from "../../shared/types";

export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: init?.body ? { "content-type": "application/json", ...init.headers } : init?.headers,
  });
  if (!response.ok) {
    let message = "No se pudo completar la operación.";
    try {
      const payload = await response.json() as { error?: { message?: string } };
      if (payload.error?.message) message = payload.error.message;
    } catch {
      // The fallback message is intentionally retained for non-JSON failures.
    }
    throw new ApiError(message, response.status);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const api = {
  listStays: (signal?: AbortSignal) => request<{ stays: Stay[] }>("/api/stays", { signal }),
  createStay: (data: Omit<Stay, "id" | "completedOn" | "createdAt" | "updatedAt">) =>
    request<{ stay: Stay }>("/api/stays", { method: "POST", body: JSON.stringify(data) }),
  updateStay: (id: number, data: Partial<Pick<Stay, "roomNumber" | "checkInDate" | "checkOutDate" | "guestCount" | "breakfastNotes">> & { completed?: boolean }) =>
    request<{ stay: Stay }>(`/api/stays/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteStay: (id: number) => request<void>(`/api/stays/${id}`, { method: "DELETE" }),
  breakfastDay: (date: string, signal?: AbortSignal) =>
    request<BreakfastDay>(`/api/breakfast/${date}`, { signal }),
  setBreakfastCount: (date: string, stayId: number, servedCount: number) =>
    request<{ servedCount: number }>(`/api/breakfast/${date}/stays/${stayId}`, {
      method: "PATCH", body: JSON.stringify({ servedCount }),
    }),
  inventoryDay: (date: string, signal?: AbortSignal) =>
    request<InventoryDay>(`/api/inventory/${date}`, { signal }),
  setInventory: (date: string, productId: number, receivedQuantity: number | null, remainingQuantity: number | null) =>
    request<void>(`/api/inventory/${date}/products/${productId}`, {
      method: "PUT", body: JSON.stringify({ receivedQuantity, remainingQuantity }),
    }),
  note: (date: string, signal?: AbortSignal) =>
    request<{ date: string; content: string }>(`/api/notes/${date}`, { signal }),
  setNote: (date: string, content: string) =>
    request<void>(`/api/notes/${date}`, { method: "PUT", body: JSON.stringify({ content }) }),
  products: () => request<{ products: Product[] }>("/api/products"),
  createProduct: (name: string, unit: string | null) => request<{ product: Product }>("/api/products", {
    method: "POST", body: JSON.stringify({ name, unit }),
  }),
  updateProduct: (id: number, data: Partial<Pick<Product, "name" | "unit" | "active">>) =>
    request<{ product: Product }>(`/api/products/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  reorderProducts: (productIds: number[]) => request<void>("/api/products/order", {
    method: "PUT", body: JSON.stringify({ productIds }),
  }),
};

export function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "Ocurrió un error inesperado.";
}

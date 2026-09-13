export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code = "request_error",
  ) {
    super(message);
  }
}

export function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(data), { ...init, headers });
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new HttpError(415, "El contenido debe enviarse como JSON.", "invalid_content_type");
  }
  try {
    const value: unknown = await request.json();
    if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch {
    throw new HttpError(400, "El cuerpo de la solicitud no es JSON válido.", "invalid_json");
  }
}

export function parseId(value: string, label = "identificador"): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new HttpError(400, `El ${label} no es válido.`, "invalid_id");
  }
  return id;
}

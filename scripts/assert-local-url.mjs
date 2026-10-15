const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "[::1]"]);

export function assertLocalAppUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`APP_URL no es una URL válida: ${value}`);
  }

  if (!LOOPBACK_HOSTS.has(url.hostname)) {
    throw new Error(`Ejecución cancelada: los scripts QA sólo admiten APP_URL local; se recibió ${url.origin}`);
  }
}

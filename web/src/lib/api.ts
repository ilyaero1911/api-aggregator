/** Клиент к Go-бэкенду. В браузере ходим через rewrites Next (/api → :8090), на сервере — напрямую. */
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

const serverBase = process.env.BACKEND_URL ?? "http://localhost:8090";

export async function api<T = unknown>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  const base = typeof window === "undefined" ? serverBase : "";
  const res = await fetch(base + path, {
    credentials: "same-origin",
    ...rest,
    headers: { ...(json !== undefined ? { "content-type": "application/json" } : {}), ...headers },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const e = data?.error ?? {};
    throw new ApiError(res.status, e.code ?? "error", e.message ?? res.statusText);
  }
  return data as T;
}

export const get = <T,>(p: string) => api<T>(p);
export const post = <T,>(p: string, json?: unknown) => api<T>(p, { method: "POST", json: json ?? {} });
export const put = <T,>(p: string, json?: unknown) => api<T>(p, { method: "PUT", json });
export const patch = <T,>(p: string, json?: unknown) => api<T>(p, { method: "PATCH", json });
export const del = <T,>(p: string) => api<T>(p, { method: "DELETE" });

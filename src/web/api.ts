export class ApiError extends Error {
  constructor(public status: number, public body: any) { super(body?.error ?? `http_${status}`); }
}

async function req<T>(method: string, url: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method, credentials: 'same-origin', headers: {} };
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) { (init.headers as Record<string, string>)['content-type'] = 'application/json'; init.body = JSON.stringify(body); }
  const res = await fetch(url, init);
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, data);
  return data as T;
}

export const api = {
  get: <T = any>(u: string) => req<T>('GET', u),
  post: <T = any>(u: string, b?: unknown) => req<T>('POST', u, b ?? {}),
  put: <T = any>(u: string, b?: unknown) => req<T>('PUT', u, b ?? {}),
  del: <T = any>(u: string) => req<T>('DELETE', u),
};

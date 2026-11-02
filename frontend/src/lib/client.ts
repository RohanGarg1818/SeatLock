// Browser-side API access. Everything goes through /api/* on our own origin (proxied by next.config.ts).
import type { ApiErrorBody } from './types';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: ApiErrorBody['error']['details']) {
    super(message);
  }
}

export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown; headers?: Record<string, string> } = {}): Promise<T> {
  let res: Response;
  // A cold server can take ~50 s to answer the first request. After 4 s tell the page, so it can say so.
  const slowTimer = setTimeout(() => window.dispatchEvent(new Event('seatlock:slow')), 4000);
  try {
    res = await fetch(`/api${path}`, {
      method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
      headers: { ...(opts.body !== undefined && { 'Content-Type': 'application/json' }), ...opts.headers },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      credentials: 'same-origin',
      signal: AbortSignal.timeout(90_000),
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Could not reach the server. Check your connection and try again.');
  } finally {
    clearTimeout(slowTimer);
    window.dispatchEvent(new Event('seatlock:settled'));
  }
  if (res.status === 204) return undefined as T;
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const e = (json as ApiErrorBody | null)?.error;
    throw new ApiError(res.status, e?.code ?? 'ERROR', e?.message ?? 'Something went wrong.', e?.details);
  }
  return json as T;
}

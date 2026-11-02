// Server-side API access for Server Components. Imported ONLY from server code.
import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import type { User } from './types';

const API_URL = process.env.API_URL || 'http://localhost:4000';

/**
 * Calls the API from the Next.js server and FORWARDS the visitor's cookie. The browser never talks to the API
 * directly, so the server component has to pass the auth cookie along itself, otherwise it would look logged-out.
 */
export async function serverFetch<T = unknown>(path: string, init: RequestInit = {}): Promise<{ status: number; data: T | null }> {
  const cookie = (await cookies()).toString();
  try {
    const res = await fetch(API_URL + path, {
      ...init,
      headers: { ...(cookie && { cookie }), ...(init.headers as Record<string, string>) },
      cache: 'no-store', // pages are personalised and show live seat counts: never cache
      signal: AbortSignal.timeout(60_000), // a sleeping free-tier API needs up to ~50 s to wake
    });
    const data = res.headers.get('content-type')?.includes('json') ? ((await res.json()) as T) : null;
    return { status: res.status, data };
  } catch {
    return { status: 503, data: null }; // API unreachable
  }
}

// cache(): the layout, header and page all ask who is logged in during one render; only the first call hits the API.
export const getUser = cache(async (): Promise<User | null> => {
  const { status, data } = await serverFetch<{ user: User }>('/auth/me');
  return status === 200 && data ? data.user : null;
});

/** The logged-in organizer of the organizer portal (a separate session from the attendee site), or null. */
export const getOrganizer = cache(async (): Promise<User | null> => {
  const { status, data } = await serverFetch<{ user: User }>('/organizer/auth/me');
  return status === 200 && data ? data.user : null;
});

import { useEffect, useState, useSyncExternalStore } from 'react';

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://192.168.178.103:3000';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

let token: string | null = null;
let onUnauthorized: (() => void) | null = null;

/** Called by the auth provider so requests carry the session token. */
export function configureApi(t: string | null, unauthorized: () => void) {
  token = t;
  onUnauthorized = unauthorized;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        ...(body !== undefined && { 'content-type': 'application/json' }),
        ...(token && { authorization: `Bearer ${token}` }),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('Server nicht erreichbar. Bist du im Heim-WLAN?', 0);
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && token) onUnauthorized?.();
    throw new ApiError(json.error ?? `Fehler ${res.status}`, res.status);
  }
  return json as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
  del: <T = { ok: true }>(path: string) => request<T>('DELETE', path),
};

// Global "data changed" signal: every mutation bumps the version, and all mounted queries refetch.
let version = 0;
const listeners = new Set<() => void>();

export function invalidate() {
  version += 1;
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

type QueryState<T> = { data?: T; error?: string; loading: boolean };

/** Fetches `path` (skipped when null) and refetches after any `invalidate()`. */
export function useApi<T>(path: string | null) {
  const v = useSyncExternalStore(subscribe, () => version);
  const [state, setState] = useState<QueryState<T> & { key?: string }>({ loading: true });

  useEffect(() => {
    if (!path) return;
    let active = true;
    api
      .get<T>(path)
      .then((data) => active && setState({ data, loading: false, key: path }))
      .catch((e: Error) => active && setState((s) => ({ ...s, error: e.message, loading: false })));
    return () => {
      active = false;
    };
  }, [path, v]);

  // Data from a previous path (e.g. the day before) is still shown until the new one arrives.
  return { ...state, stale: state.key !== path, reload: invalidate };
}

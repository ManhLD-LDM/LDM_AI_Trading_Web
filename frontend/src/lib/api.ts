/**
 * lib/api.ts
 * 
 * Centralised API client for LDM AI Trading backend.
 * Single source of truth for base URL, auth headers, and fetch helpers.
 * 
 * Usage:
 *   import { api, apiGet, apiPost } from '@/lib/api';
 *   const data = await apiGet('/api/user/me');
 *   const result = await apiPost('/api/analysis/run', { symbol: 'BTCUSDT', interval: '1h', model_type: 'lstm' });
 */

/** Resolves API base URL from env or falls back to same-host port 8000 */
function getBaseUrl(): string {
  if (typeof window === 'undefined') {
    // SSR: use env or localhost
    return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  }
  return process.env.NEXT_PUBLIC_API_URL || `http://${window.location.hostname}:8000`;
}

/** Resolves WebSocket URL */
export function getWsUrl(): string {
  if (typeof window === 'undefined') return 'ws://localhost:8000/ws';
  const wsBase = process.env.NEXT_PUBLIC_WS_URL;
  if (wsBase) return wsBase;
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.hostname}:8000/ws`;
}

export const API_BASE = getBaseUrl();

// ─── Token helpers ────────────────────────────────────────────────────────────
/** Get current JWT from localStorage (client-side only) */
export function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('token');
}

/** Persist JWT to localStorage */
export function setStoredToken(token: string): void {
  localStorage.setItem('token', token);
}

/** Clear JWT from localStorage (logout) */
export function clearStoredToken(): void {
  localStorage.removeItem('token');
}

// ─── Core fetch wrapper ───────────────────────────────────────────────────────
interface ApiOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  token?: string | null;  // Pass explicitly, or reads from localStorage
}

export async function api<T = unknown>(path: string, options: ApiOptions = {}): Promise<T> {
  const { body, token: explicitToken, ...fetchOptions } = options;
  const token = explicitToken !== undefined ? explicitToken : getStoredToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(fetchOptions.headers as Record<string, string> || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...fetchOptions,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const err = await response.json();
      detail = err.detail || err.message || detail;
    } catch {
      // ignore parse errors
    }
    throw new Error(detail);
  }

  // Handle empty responses (e.g. 204 No Content)
  const text = await response.text();
  return text ? JSON.parse(text) as T : ({} as T);
}

// ─── Convenience methods ──────────────────────────────────────────────────────
export function apiGet<T = unknown>(path: string, token?: string | null): Promise<T> {
  return api<T>(path, { method: 'GET', token });
}

export function apiPost<T = unknown>(path: string, body?: unknown, token?: string | null): Promise<T> {
  return api<T>(path, { method: 'POST', body, token });
}

export function apiPut<T = unknown>(path: string, body?: unknown, token?: string | null): Promise<T> {
  return api<T>(path, { method: 'PUT', body, token });
}

export function apiDelete<T = unknown>(path: string, token?: string | null): Promise<T> {
  return api<T>(path, { method: 'DELETE', token });
}

// ─── Domain-specific helpers ──────────────────────────────────────────────────
export const TradingAPI = {
  // Auth
  login: (email: string, password: string) => {
    const form = new URLSearchParams({ username: email, password });
    return fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    }).then(r => r.json());
  },

  register: (email: string, password: string) =>
    apiPost('/api/auth/register', { email, password }),

  me: (token: string) => apiGet('/api/user/me', token),

  // Analysis
  runAnalysis: (symbol: string, interval: string, modelType: string, token: string) =>
    apiPost('/api/analysis/run', { symbol, interval, model_type: modelType }, token),
};


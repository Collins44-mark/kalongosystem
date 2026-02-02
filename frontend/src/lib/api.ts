/**
 * API base URL from NEXT_PUBLIC_API_URL.
 * Axios/fetch wrapper for Kalongo Hotel backend.
 */
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export type ApiError = { detail?: string; [key: string]: unknown };

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('access_token');
}

function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('refresh_token');
}

function setTokens(access: string, refresh?: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('access_token', access);
  if (refresh) localStorage.setItem('refresh_token', refresh);
}

function clearTokens() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
}

export const auth = {
  getToken,
  getRefreshToken,
  setTokens,
  clearTokens,
};

async function request<T>(
  path: string,
  options: RequestInit & { skipAuth?: boolean } = {}
): Promise<T> {
  const { skipAuth, ...init } = options;
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string>),
  };
  if (!skipAuth && getToken()) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${getToken()}`;
  }
  const res = await fetch(url, { ...init, headers });
  if (res.status === 401 && getRefreshToken() && !skipAuth) {
    const refreshed = await refreshAccess();
    if (refreshed) return request(path, { ...options, skipAuth });
  }
  if (!res.ok) {
    const err: ApiError = await res.json().catch(() => ({ detail: res.statusText }));
    throw err;
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

async function refreshAccess(): Promise<boolean> {
  const refresh = getRefreshToken();
  if (!refresh) return false;
  try {
    const res = await fetch(`${API_BASE}/api/auth/refresh/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh }),
    });
    if (!res.ok) {
      clearTokens();
      return false;
    }
    const data = await res.json();
    setTokens(data.access, data.refresh);
    return true;
  } catch {
    clearTokens();
    return false;
  }
}

export const api = {
  get: <T>(path: string, options?: RequestInit) =>
    request<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: RequestInit) =>
    request<T>(path, { ...options, method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown, options?: RequestInit) =>
    request<T>(path, { ...options, method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown, options?: RequestInit) =>
    request<T>(path, { ...options, method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

// Auth
export type User = {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  role: number | null;
  role_name: string;
  department: number | null;
  department_code: string;
  is_manager: boolean;
  permission_codes: string[];
  is_active: boolean;
  is_staff?: boolean;
};

export type LoginResponse = { access: string; refresh: string; user: User };

export async function login(username: string, password: string): Promise<LoginResponse> {
  const data = await request<LoginResponse>('/api/auth/login/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
    skipAuth: true,
  });
  setTokens(data.access, data.refresh);
  return data;
}

export async function logout() {
  clearTokens();
}

export async function me(): Promise<User> {
  return api.get<User>('/api/auth/me/');
}

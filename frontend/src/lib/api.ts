const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

function getToken(options?: { token?: string | null }): string | null {
  if (options?.token && typeof options.token === 'string') return options.token;
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('hms-auth');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const t = parsed?.state?.token;
    return typeof t === 'string' ? t : null;
  } catch {
    return null;
  }
}

export async function api<T>(
  path: string,
  options?: RequestInit & { token?: string | null }
): Promise<T> {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options?.headers,
  };
  const token = getToken(options);
  if (token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  }
  const { token: _t, ...fetchOptions } = options ?? {};
  const res = await fetch(`${API_URL}${path}`, {
    ...fetchOptions,
    headers,
    credentials: 'include',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.message;
    const errMsg = Array.isArray(msg) ? msg.join('. ') : (msg && typeof msg === 'string' ? msg : 'Request failed');
    const err = new Error(errMsg) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return data;
}

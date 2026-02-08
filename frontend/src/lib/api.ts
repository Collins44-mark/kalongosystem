const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export async function api<T>(
  path: string,
  options?: RequestInit & { token?: string | null }
): Promise<T> {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options?.headers,
  };
  let token = options?.token;
  if (!token && typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem('hms-auth');
      if (raw) {
        const parsed = JSON.parse(raw);
        token = parsed?.state?.token ?? null;
      }
    } catch {
      /* ignore */
    }
  }
  if (token && typeof token === 'string') {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  }
  const { token: _t, ...fetchOptions } = options ?? {};
  const res = await fetch(`${API_URL}${path}`, {
    ...fetchOptions,
    headers,
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

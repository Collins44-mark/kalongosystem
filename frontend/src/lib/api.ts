const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export async function api<T>(
  path: string,
  options?: RequestInit & { token?: string | null }
): Promise<T> {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options?.headers,
  };
  if (options?.token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${options.token}`;
  }
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Request failed');
  return data;
}

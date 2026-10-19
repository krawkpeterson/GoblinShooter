export const USER_AGENT = "KrawkGame/0.1 (+https://github.com/krawkpeterson/GoblinShooter)";

export async function fetchWithTimeout(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const { timeoutMs = 15000, ...rest } = init;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort("timeout"), timeoutMs);
  try {
    return await fetch(url, {
      ...rest,
      signal: ctrl.signal,
      // browsers forbid overriding User-Agent and some reject the request outright
      headers: { ...(typeof window === "undefined" ? { "User-Agent": USER_AGENT } : {}), ...(rest.headers ?? {}) },
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchJson<T>(url: string, init?: RequestInit & { timeoutMs?: number }): Promise<T> {
  const res = await fetchWithTimeout(url, init);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} from ${new URL(url).host}`);
  return (await res.json()) as T;
}

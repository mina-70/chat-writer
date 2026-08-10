const BASE = import.meta.env.BASE_URL;

function apiUrl(path: string): string {
  const trimmed = path.startsWith("/") ? path.slice(1) : path;
  return `${BASE}${trimmed}`;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(apiUrl(path), {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    const message =
      (data && typeof data === "object" && "error" in data
        ? String((data as { error: unknown }).error)
        : null) ?? `Request failed (${res.status})`;
    const error = new Error(message) as Error & { status?: number };
    error.status = res.status;
    throw error;
  }

  return data as T;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export const api = {
  me: () => request<{ authenticated: boolean }>("api/me"),
  login: (password: string) =>
    request<{ ok: true }>("api/login", {
      method: "POST",
      body: JSON.stringify({ password }),
    }),
  logout: () => request<{ ok: true }>("api/logout", { method: "POST" }),
  chat: (messages: ChatMessage[]) =>
    request<{ reply: string }>("api/chat", {
      method: "POST",
      body: JSON.stringify({ messages }),
    }),
};

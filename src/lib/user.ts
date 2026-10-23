"use client";

export type User = { id: string; firstName: string; lastName: string; group: string };
export type Session = { user: User; token: string };

const KEY = "konspektor.user.v2";
/** Событие, по которому страница снова показывает вход: сервер не узнал токен. */
export const LOGOUT_EVENT = "konspektor:logout";

export function loadSession(): Session | null {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || "null");
    return s?.user?.firstName && s.token ? s : null;
  } catch {
    return null;
  }
}

export function saveSession(s: Session | null) {
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
  } catch {
    // хранилище недоступно — вход действует до перезагрузки
  }
}

export function authHeaders(): Record<string, string> {
  const s = loadSession();
  return s ? { "x-user-token": s.token } : {};
}

/** fetch с токеном входа; при 401 разлогинивает, чтобы человек вошёл заново. */
export async function authFetch(url: string, init: RequestInit = {}) {
  const res = await fetch(url, { ...init, headers: { ...init.headers, ...authHeaders() } });
  if (res.status === 401) {
    saveSession(null);
    window.dispatchEvent(new Event(LOGOUT_EVENT));
  }
  return res;
}

export const fullName = (u: User) => `${u.firstName} ${u.lastName}`;

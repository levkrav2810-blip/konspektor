import { createHash, createHmac, scryptSync, timingSafeEqual } from "node:crypto";
import { hasDb, pipeline } from "@/lib/db";
import { ADMINS, GROUP, STUDENTS, type Student } from "@/lib/students";

export type User = { id: string; firstName: string; lastName: string; group: string; admin: boolean };

export const TOKEN_HEADER = "x-user-token";

// Ключ для подписи входа. Если AUTH_SECRET не задан, берём его из ключей нейросети, которые и так есть только на сервере.
const SECRET = createHash("sha256")
  .update(process.env.AUTH_SECRET || [process.env.LLM_API_KEY, process.env.YANDEX_API_KEY, process.env.ANTHROPIC_API_KEY].join("|") || "konspektor-dev")
  .digest();

/** «Lev Kravchenko», «lev.kravchenko», «LevKravchenko» — один и тот же логин. */
const normalize = (login: string) => login.toLowerCase().replace(/[^a-z]/g, "");

const toUser = (s: Student): User => ({ id: s.login, firstName: s.firstName, lastName: s.lastName, group: GROUP, admin: ADMINS.includes(s.login) });

// Подпись зависит от хэша пароля: после смены пароля старые входы перестают работать.
const sign = (s: Student) => createHmac("sha256", SECRET).update(`${s.login}:${s.hash}`).digest("base64url");

export function login(loginName: string, password: string): { user: User; token: string } | null {
  const key = normalize(loginName);
  const s = STUDENTS.find((x) => normalize(x.login) === key);
  if (!s) return null;
  const hash = scryptSync(password.trim(), s.salt, 32);
  if (!timingSafeEqual(hash, Buffer.from(s.hash, "hex"))) return null;
  return { user: toUser(s), token: `${s.login}.${sign(s)}` };
}

export function userFromRequest(req: Request): User | null {
  const token = req.headers.get(TOKEN_HEADER) || "";
  const dot = token.lastIndexOf(".");
  const s = STUDENTS.find((x) => x.login === token.slice(0, dot));
  if (!s) return null;
  const given = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(sign(s));
  return given.length === expected.length && timingSafeEqual(given, expected) ? toUser(s) : null;
}

/** Пускает к нейросети только вошедших. Возвращает ответ с ошибкой или null, если всё в порядке. */
export async function requireUser(req: Request): Promise<Response | null> {
  const user = userFromRequest(req);
  if (user) {
    await track(user.id, false);
    return null;
  }
  return Response.json({ error: "Войдите на сайт заново: логин и пароль" }, { status: 401 });
}

export type Activity = { lastLogin?: number; lastSeen?: number; logins?: number; actions?: number };

/** Отмечает вход или действие с нейросетью. Без базы данных молча ничего не делает. */
export async function track(login: string, isLogin: boolean) {
  if (!hasDb()) return;
  const now = Date.now();
  try {
    await pipeline([
      ["HSET", `seen:${login}`, "lastSeen", now, ...(isLogin ? ["lastLogin", now] : [])],
      ["HINCRBY", `seen:${login}`, isLogin ? "logins" : "actions", 1],
    ]);
  } catch (err) {
    console.error(err); // отметка не важнее самого конспекта
  }
}

/** Список группы с отметками о входах; null — база данных не подключена. */
export async function groupActivity(): Promise<(Pick<User, "id" | "firstName" | "lastName"> & Activity)[] | { noDb: true; members: Pick<User, "id" | "firstName" | "lastName">[] }> {
  const members = STUDENTS.map(({ login, firstName, lastName }) => ({ id: login, firstName, lastName }));
  if (!hasDb()) return { noDb: true, members };
  const rows = (await pipeline(members.map((m) => ["HGETALL", `seen:${m.id}`]))) as string[][];
  return members.map((m, i) => {
    const flat = rows[i] || [];
    const a: Record<string, number> = {};
    for (let j = 0; j < flat.length; j += 2) a[flat[j]] = Number(flat[j + 1]);
    return { ...m, ...a };
  });
}

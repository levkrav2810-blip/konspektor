import { createHash, randomBytes, randomUUID } from "node:crypto";
import { hasDb, pipeline, redis } from "@/lib/db";

export type User = { id: string; firstName: string; lastName: string; group: string; createdAt: number };

export const TOKEN_HEADER = "x-user-token";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

/** «  иВАН » → «Иван»; «ю-21 1» → «Ю-21 1». */
export function cleanName(s: string) {
  const t = s.trim().replace(/\s+/g, " ").slice(0, 40);
  return t ? t[0].toUpperCase() + t.slice(1) : "";
}

export function cleanGroup(s: string) {
  return s.trim().replace(/\s+/g, " ").toUpperCase().slice(0, 30);
}

/** Код группы из GROUP_CODE: если задан, без него не зарегистрироваться. */
export function groupCodeOk(code: string | undefined) {
  const expected = process.env.GROUP_CODE?.trim();
  return !expected || code?.trim().toLowerCase() === expected.toLowerCase();
}

/** Находит участника по имени, фамилии и группе или создаёт нового; возвращает его и новый токен входа. */
export async function register(firstName: string, lastName: string, group: string): Promise<{ user: User; token: string }> {
  const token = randomBytes(24).toString("base64url");
  const fresh: User = { id: randomUUID(), firstName, lastName, group, createdAt: Date.now() };
  if (!hasDb()) return { user: fresh, token };

  const byName = `byname:${group}:${firstName.toLowerCase()}:${lastName.toLowerCase()}`;
  await redis(["SET", byName, fresh.id, "NX"]);
  const id = await redis<string>(["GET", byName]);
  let user = fresh;
  if (id === fresh.id) {
    await pipeline([
      ["SET", `user:${id}`, JSON.stringify(fresh)],
      ["SADD", `group:${group}`, id],
    ]);
  } else {
    const saved = await redis<string | null>(["GET", `user:${id}`]);
    user = saved ? JSON.parse(saved) : { ...fresh, id };
  }
  await redis(["SET", `token:${sha(token)}`, user.id]);
  return { user, token };
}

export async function userFromRequest(req: Request): Promise<User | null> {
  const token = req.headers.get(TOKEN_HEADER);
  if (!token || !hasDb()) return null;
  const id = await redis<string | null>(["GET", `token:${sha(token)}`]);
  if (!id) return null;
  const saved = await redis<string | null>(["GET", `user:${id}`]);
  return saved ? JSON.parse(saved) : null;
}

/**
 * Пускает к нейросети только зарегистрированных. Без базы данных проверять нечего,
 * поэтому сайт работает как раньше. Возвращает ответ с ошибкой или null, если всё в порядке.
 */
export async function requireUser(req: Request): Promise<Response | null> {
  if (!hasDb()) return null;
  try {
    if (await userFromRequest(req)) return null;
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Не удалось проверить вход, попробуйте ещё раз" }, { status: 503 });
  }
  return Response.json({ error: "Войдите на сайт заново: укажите имя, фамилию и группу" }, { status: 401 });
}

export async function groupMembers(group: string): Promise<User[]> {
  const ids = await redis<string[]>(["SMEMBERS", `group:${group}`]);
  if (!ids.length) return [];
  const raw = await redis<(string | null)[]>(["MGET", ...ids.map((id) => `user:${id}`)]);
  return raw
    .filter((r): r is string => Boolean(r))
    .map((r) => JSON.parse(r) as User)
    .sort((a, b) => a.lastName.localeCompare(b.lastName, "ru") || a.firstName.localeCompare(b.firstName, "ru"));
}

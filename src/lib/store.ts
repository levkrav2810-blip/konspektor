import { Pool } from "pg";
import { hasDb as hasRedis, pipeline, redis } from "@/lib/db";

/**
 * Хранилище аккаунтов: конспекты, предметы и отметки о входах.
 *  - DATABASE_URL задан → PostgreSQL (основной вариант, например Timeweb Cloud «Базы данных»);
 *  - иначе KV_REST_API_URL/TOKEN → Upstash Redis (старый вариант для Vercel);
 *  - иначе базы нет, и всё живёт только в браузере.
 * Таблицы создаются сами при первом обращении, отдельно запускать миграции не нужно.
 */

const PG_URL = process.env.DATABASE_URL || "";

export const storeKind = (): "postgres" | "redis" | null => (PG_URL ? "postgres" : hasRedis() ? "redis" : null);
export const hasStore = () => storeKind() !== null;

// --- PostgreSQL ---

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS notes (
  login      text   NOT NULL,
  id         text   NOT NULL,
  data       jsonb  NOT NULL,
  created_at bigint NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (login, id)
);
CREATE TABLE IF NOT EXISTS subjects (
  login      text  NOT NULL PRIMARY KEY,
  data       jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS activity (
  login      text   NOT NULL PRIMARY KEY,
  last_login bigint,
  last_seen  bigint,
  logins     integer NOT NULL DEFAULT 0,
  actions    integer NOT NULL DEFAULT 0
);
`;

/** sslmode в адресе: require/verify-* — шифрованное соединение; без него — как скажет сервер. */
function sslFrom(url: string) {
  try {
    const mode = new URL(url).searchParams.get("sslmode");
    if (!mode || mode === "disable") return undefined;
    // Управляемые базы часто дают свой сертификат; проверяем его, только если просили verify-full.
    return { rejectUnauthorized: mode === "verify-full" };
  } catch {
    return undefined;
  }
}

function cleanUrl(url: string) {
  try {
    const u = new URL(url);
    u.searchParams.delete("sslmode"); // ssl задаём сами, иначе pg перекрывает наши настройки
    return u.toString();
  } catch {
    return url;
  }
}

const g = globalThis as unknown as { __pg?: Pool; __pgReady?: Promise<void> };

function pool(): Pool {
  if (!g.__pg) {
    g.__pg = new Pool({ connectionString: cleanUrl(PG_URL), ssl: sslFrom(PG_URL), max: 5, idleTimeoutMillis: 30_000 });
    g.__pg.on("error", (err) => console.error("PostgreSQL:", err.message));
  }
  return g.__pg;
}

async function pg() {
  const p = pool();
  if (!g.__pgReady) {
    g.__pgReady = p.query(SCHEMA).then(() => undefined);
    g.__pgReady.catch(() => (g.__pgReady = undefined)); // при сбое попробуем создать таблицы в следующий раз
  }
  await g.__pgReady;
  return p;
}

// --- Переезд со старой базы ---

const imported = new Set<string>();

/**
 * Если заданы и DATABASE_URL, и старый Upstash Redis, при первом входе человека его конспекты
 * и предметы один раз копируются из Redis в PostgreSQL. Redis при этом не меняется.
 */
async function importFromRedis(login: string) {
  if (!PG_URL || !hasRedis() || imported.has(login)) return;
  const db = await pg();
  try {
    const { rows } = await db.query("SELECT 1 FROM notes WHERE login = $1 UNION ALL SELECT 1 FROM subjects WHERE login = $1 LIMIT 1", [login]);
    if (!rows.length) {
      const [flat, rawSubjects] = (await pipeline([["HGETALL", `notes:${login}`], ["GET", `subjects:${login}`]])) as [string[], string | null];
      const notes: { id: string; createdAt: number; json: string }[] = [];
      for (let i = 0; i + 1 < (flat || []).length; i += 2) {
        try {
          const n = JSON.parse(flat[i + 1]);
          notes.push({ id: flat[i], createdAt: Number(n.createdAt) || Date.now(), json: flat[i + 1] });
        } catch {
          // повреждённую запись пропускаем
        }
      }
      for (let i = 0; i < notes.length; i += 50) await saveNotes(login, notes.slice(i, i + 50));
      const subjects = rawSubjects ? JSON.parse(rawSubjects) : null;
      if (Array.isArray(subjects) && subjects.length) await setSubjects(login, subjects);
      if (notes.length) console.log(`Перенесено из Redis: ${login}, конспектов ${notes.length}`);
    }
    imported.add(login);
  } catch (err) {
    console.error("Перенос из Redis не удался, попробуем при следующем входе:", err);
  }
}

// --- Конспекты ---

/** Все конспекты пользователя как объекты. */
export async function listNotes(login: string): Promise<unknown[]> {
  if (storeKind() === "postgres") {
    await importFromRedis(login);
    const { rows } = await (await pg()).query<{ data: unknown }>("SELECT data FROM notes WHERE login = $1 ORDER BY created_at DESC", [login]);
    return rows.map((r) => r.data);
  }
  const flat = await redis<string[]>(["HGETALL", `notes:${login}`]);
  const notes = [];
  for (let i = 1; i < flat.length; i += 2) {
    try {
      notes.push(JSON.parse(flat[i]));
    } catch {
      // повреждённую запись пропускаем
    }
  }
  return notes;
}

/** Сколько конспектов уже лежит в аккаунте, не считая тех, что сейчас перезаписываются. */
export async function countOtherNotes(login: string, ids: string[]): Promise<number> {
  if (storeKind() === "postgres") {
    await importFromRedis(login); // до первой записи, иначе перенос решит, что аккаунт уже не пустой
    const { rows } = await (await pg()).query<{ n: string }>("SELECT count(*) AS n FROM notes WHERE login = $1 AND NOT (id = ANY($2))", [login, ids]);
    return Number(rows[0]?.n || 0);
  }
  const [total, existing] = (await pipeline([["HLEN", `notes:${login}`], ["HMGET", `notes:${login}`, ...ids]])) as [number, (string | null)[]];
  return total - existing.filter(Boolean).length;
}

/** Добавляет или обновляет конспекты; json — уже проверенная строка. */
export async function saveNotes(login: string, notes: { id: string; createdAt: number; json: string }[]) {
  if (!notes.length) return;
  if (storeKind() === "postgres") {
    const values: unknown[] = [];
    const rows = notes.map((n, i) => {
      values.push(login, n.id, n.json, n.createdAt);
      const b = i * 4;
      return `($${b + 1}, $${b + 2}, $${b + 3}::jsonb, $${b + 4})`;
    });
    await (await pg()).query(
      `INSERT INTO notes (login, id, data, created_at) VALUES ${rows.join(", ")}
       ON CONFLICT (login, id) DO UPDATE SET data = EXCLUDED.data, created_at = EXCLUDED.created_at, updated_at = now()`,
      values,
    );
    return;
  }
  await redis(["HSET", `notes:${login}`, ...notes.flatMap((n) => [n.id, n.json])]);
}

export async function deleteNotes(login: string, ids: string[]) {
  if (!ids.length) return;
  if (storeKind() === "postgres") {
    await (await pg()).query("DELETE FROM notes WHERE login = $1 AND id = ANY($2)", [login, ids]);
    return;
  }
  await pipeline([["HDEL", `notes:${login}`, ...ids]]);
}

// --- Предметы ---

export async function getSubjects(login: string): Promise<unknown[]> {
  if (storeKind() === "postgres") {
    await importFromRedis(login);
    const { rows } = await (await pg()).query<{ data: unknown }>("SELECT data FROM subjects WHERE login = $1", [login]);
    const list = rows[0]?.data;
    return Array.isArray(list) ? list : [];
  }
  const raw = await redis<string | null>(["GET", `subjects:${login}`]);
  const list = raw ? JSON.parse(raw) : [];
  return Array.isArray(list) ? list : [];
}

export async function setSubjects(login: string, subjects: unknown[]) {
  const json = JSON.stringify(subjects);
  if (storeKind() === "postgres") {
    await (await pg()).query(
      "INSERT INTO subjects (login, data) VALUES ($1, $2::jsonb) ON CONFLICT (login) DO UPDATE SET data = EXCLUDED.data, updated_at = now()",
      [login, json],
    );
    return;
  }
  await redis(["SET", `subjects:${login}`, json]);
}

// --- Входы и действия ---

export type Activity = { lastLogin?: number; lastSeen?: number; logins?: number; actions?: number };

export async function recordActivity(login: string, isLogin: boolean) {
  const now = Date.now();
  if (storeKind() === "postgres") {
    await (await pg()).query(
      `INSERT INTO activity (login, last_seen, last_login, logins, actions) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (login) DO UPDATE SET
         last_seen  = EXCLUDED.last_seen,
         last_login = COALESCE(EXCLUDED.last_login, activity.last_login),
         logins     = activity.logins + EXCLUDED.logins,
         actions    = activity.actions + EXCLUDED.actions`,
      [login, now, isLogin ? now : null, isLogin ? 1 : 0, isLogin ? 0 : 1],
    );
    return;
  }
  await pipeline([
    ["HSET", `seen:${login}`, "lastSeen", now, ...(isLogin ? ["lastLogin", now] : [])],
    ["HINCRBY", `seen:${login}`, isLogin ? "logins" : "actions", 1],
  ]);
}

export async function activityOf(logins: string[]): Promise<Activity[]> {
  if (storeKind() === "postgres") {
    const { rows } = await (await pg()).query<{ login: string; last_login: string | null; last_seen: string | null; logins: number; actions: number }>(
      "SELECT login, last_login, last_seen, logins, actions FROM activity WHERE login = ANY($1)",
      [logins],
    );
    const by = new Map(rows.map((r) => [r.login, r]));
    return logins.map((l) => {
      const r = by.get(l);
      if (!r) return {};
      return {
        ...(r.last_login ? { lastLogin: Number(r.last_login) } : {}),
        ...(r.last_seen ? { lastSeen: Number(r.last_seen) } : {}),
        logins: r.logins,
        actions: r.actions,
      };
    });
  }
  const rows = (await pipeline(logins.map((l) => ["HGETALL", `seen:${l}`]))) as string[][];
  return rows.map((flat) => {
    const a: Record<string, number> = {};
    for (let j = 0; j < (flat || []).length; j += 2) a[flat[j]] = Number(flat[j + 1]);
    return a;
  });
}

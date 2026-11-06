import { userFromRequest } from "@/lib/auth";
import { hasDb, pipeline, redis } from "@/lib/db";

// Конспекты в аккаунте: Redis-хэш notes:<логин>, поле — id конспекта, значение — JSON.
const MAX_NOTES = 1000;
const MAX_NOTE_BYTES = 900_000;

const key = (login: string) => `notes:${login}`;

type Incoming = { id?: unknown; summary?: unknown; createdAt?: unknown };

function valid(n: Incoming) {
  return typeof n?.id === "string" && n.id.length <= 64 && typeof n.summary === "string" && typeof n.createdAt === "number";
}

async function guard(req: Request) {
  const me = userFromRequest(req);
  if (!me) return { error: Response.json({ error: "Войдите на сайт заново" }, { status: 401 }) };
  if (!hasDb()) return { error: Response.json({ enabled: false, error: "Хранилище не подключено" }, { status: 503 }) };
  return { me };
}

/** Все конспекты пользователя; enabled: false — база не подключена, конспекты живут только в браузере. */
export async function GET(req: Request) {
  const me = userFromRequest(req);
  if (!me) return Response.json({ error: "Войдите на сайт заново" }, { status: 401 });
  if (!hasDb()) return Response.json({ enabled: false, notes: [] });
  try {
    const flat = await redis<string[]>(["HGETALL", key(me.id)]);
    const notes = [];
    for (let i = 1; i < flat.length; i += 2) {
      try {
        notes.push(JSON.parse(flat[i]));
      } catch {
        // повреждённую запись пропускаем
      }
    }
    return Response.json({ enabled: true, notes });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Не удалось загрузить конспекты" }, { status: 502 });
  }
}

/** Сохраняет (добавляет или обновляет) один или несколько конспектов: { notes: Note[] }. */
export async function PUT(req: Request) {
  const g = await guard(req);
  if (g.error) return g.error;
  try {
    const body = (await req.json()) as { notes?: Incoming[] };
    const notes = (body.notes || []).filter(valid);
    if (!notes.length) return Response.json({ saved: 0 });
    const count = await redis<number>(["HLEN", key(g.me.id)]);
    if (count + notes.length > MAX_NOTES) return Response.json({ error: `Можно хранить до ${MAX_NOTES} конспектов` }, { status: 413 });
    const fields: string[] = [];
    for (const n of notes) {
      let json = JSON.stringify(n);
      // очень длинную расшифровку не храним, сам конспект важнее
      if (json.length > MAX_NOTE_BYTES) json = JSON.stringify({ ...n, transcript: undefined });
      if (json.length > MAX_NOTE_BYTES) continue;
      fields.push(n.id as string, json);
    }
    if (fields.length) await redis(["HSET", key(g.me.id), ...fields]);
    return Response.json({ saved: fields.length / 2 });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Не удалось сохранить конспект" }, { status: 502 });
  }
}

/** Удаляет конспекты: { ids: string[] }. */
export async function DELETE(req: Request) {
  const g = await guard(req);
  if (g.error) return g.error;
  try {
    const body = (await req.json()) as { ids?: unknown[] };
    const ids = (body.ids || []).filter((id): id is string => typeof id === "string");
    if (ids.length) await pipeline([["HDEL", key(g.me.id), ...ids]]);
    return Response.json({ deleted: ids.length });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Не удалось удалить конспект" }, { status: 502 });
  }
}

import { userFromRequest } from "@/lib/auth";
import { countOtherNotes, deleteNotes, hasStore, listNotes, saveNotes } from "@/lib/store";

// Конспекты в аккаунте: таблица notes в PostgreSQL (или Redis-хэш notes:<логин>), см. src/lib/store.ts.
const MAX_NOTES = 1000;
const MAX_NOTE_BYTES = 900_000;

type Incoming = { id?: unknown; summary?: unknown; createdAt?: unknown };

function valid(n: Incoming) {
  return typeof n?.id === "string" && n.id.length <= 64 && typeof n.summary === "string" && typeof n.createdAt === "number";
}

async function guard(req: Request) {
  const me = userFromRequest(req);
  if (!me) return { error: Response.json({ error: "Войдите на сайт заново" }, { status: 401 }) };
  if (!hasStore()) return { error: Response.json({ enabled: false, error: "Хранилище не подключено" }, { status: 503 }) };
  return { me };
}

/** Все конспекты пользователя; enabled: false — база не подключена, конспекты живут только в браузере. */
export async function GET(req: Request) {
  const me = userFromRequest(req);
  if (!me) return Response.json({ error: "Войдите на сайт заново" }, { status: 401 });
  if (!hasStore()) return Response.json({ enabled: false, notes: [] });
  try {
    return Response.json({ enabled: true, notes: await listNotes(me.id) });
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
    const count = await countOtherNotes(g.me.id, notes.map((n) => n.id as string));
    if (count + notes.length > MAX_NOTES) return Response.json({ error: `Можно хранить до ${MAX_NOTES} конспектов` }, { status: 413 });
    const rows: { id: string; createdAt: number; json: string }[] = [];
    for (const n of notes) {
      let json = JSON.stringify(n);
      // очень длинную расшифровку не храним, сам конспект важнее
      if (json.length > MAX_NOTE_BYTES) json = JSON.stringify({ ...n, transcript: undefined });
      if (json.length > MAX_NOTE_BYTES) continue;
      rows.push({ id: n.id as string, createdAt: n.createdAt as number, json });
    }
    await saveNotes(g.me.id, rows);
    return Response.json({ saved: rows.length });
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
    await deleteNotes(g.me.id, ids);
    return Response.json({ deleted: ids.length });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Не удалось удалить конспект" }, { status: 502 });
  }
}

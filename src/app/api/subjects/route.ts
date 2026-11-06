import { userFromRequest } from "@/lib/auth";
import { hasDb, redis } from "@/lib/db";

// Предметы (папки) пользователя: одна строка JSON в Redis subjects:<логин>.
const MAX_SUBJECTS = 200;
const key = (login: string) => `subjects:${login}`;

type Subject = { id: string; name: string; color: string; createdAt: number };

function valid(s: Partial<Subject>): s is Subject {
  return typeof s?.id === "string" && s.id.length <= 64 && typeof s.name === "string" && s.name.length <= 80 && typeof s.color === "string" && s.color.length <= 16 && typeof s.createdAt === "number";
}

export async function GET(req: Request) {
  const me = userFromRequest(req);
  if (!me) return Response.json({ error: "Войдите на сайт заново" }, { status: 401 });
  if (!hasDb()) return Response.json({ enabled: false, subjects: [] });
  try {
    const raw = await redis<string | null>(["GET", key(me.id)]);
    const list = raw ? JSON.parse(raw) : [];
    return Response.json({ enabled: true, subjects: Array.isArray(list) ? list.filter(valid) : [] });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Не удалось загрузить предметы" }, { status: 502 });
  }
}

/** Сохраняет весь список предметов: { subjects: Subject[] }. */
export async function PUT(req: Request) {
  const me = userFromRequest(req);
  if (!me) return Response.json({ error: "Войдите на сайт заново" }, { status: 401 });
  if (!hasDb()) return Response.json({ enabled: false, error: "Хранилище не подключено" }, { status: 503 });
  try {
    const body = (await req.json()) as { subjects?: Partial<Subject>[] };
    const subjects = (body.subjects || []).filter(valid).slice(0, MAX_SUBJECTS).map(({ id, name, color, createdAt }) => ({ id, name, color, createdAt }));
    await redis(["SET", key(me.id), JSON.stringify(subjects)]);
    return Response.json({ saved: subjects.length });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Не удалось сохранить предметы" }, { status: 502 });
  }
}

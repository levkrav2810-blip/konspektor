import { userFromRequest } from "@/lib/auth";
import { getSubjects, hasStore, setSubjects } from "@/lib/store";

// Предметы (папки) пользователя: один список JSON на аккаунт (см. src/lib/store.ts).
const MAX_SUBJECTS = 200;

type Subject = { id: string; name: string; color: string; createdAt: number };

function valid(s: Partial<Subject>): s is Subject {
  return typeof s?.id === "string" && s.id.length <= 64 && typeof s.name === "string" && s.name.length <= 80 && typeof s.color === "string" && s.color.length <= 16 && typeof s.createdAt === "number";
}

export async function GET(req: Request) {
  const me = userFromRequest(req);
  if (!me) return Response.json({ error: "Войдите на сайт заново" }, { status: 401 });
  if (!hasStore()) return Response.json({ enabled: false, subjects: [] });
  try {
    const list = (await getSubjects(me.id)) as Partial<Subject>[];
    return Response.json({ enabled: true, subjects: list.filter(valid) });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Не удалось загрузить предметы" }, { status: 502 });
  }
}

/** Сохраняет весь список предметов: { subjects: Subject[] }. */
export async function PUT(req: Request) {
  const me = userFromRequest(req);
  if (!me) return Response.json({ error: "Войдите на сайт заново" }, { status: 401 });
  if (!hasStore()) return Response.json({ enabled: false, error: "Хранилище не подключено" }, { status: 503 });
  try {
    const body = (await req.json()) as { subjects?: Partial<Subject>[] };
    const subjects = (body.subjects || []).filter(valid).slice(0, MAX_SUBJECTS).map(({ id, name, color, createdAt }) => ({ id, name, color, createdAt }));
    await setSubjects(me.id, subjects);
    return Response.json({ saved: subjects.length });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Не удалось сохранить предметы" }, { status: 502 });
  }
}

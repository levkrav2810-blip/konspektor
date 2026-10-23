import { groupActivity, userFromRequest } from "@/lib/auth";

/** Список группы и кто когда заходил — только для администратора. */
export async function GET(req: Request) {
  const me = userFromRequest(req);
  if (!me) return Response.json({ error: "Войдите на сайт заново" }, { status: 401 });
  if (!me.admin) return Response.json({ error: "Список группы видит только администратор" }, { status: 403 });
  try {
    const data = await groupActivity();
    return Response.json(Array.isArray(data) ? { group: me.group, tracking: true, members: data } : { group: me.group, tracking: false, members: data.members });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Не удалось загрузить список группы" }, { status: 500 });
  }
}

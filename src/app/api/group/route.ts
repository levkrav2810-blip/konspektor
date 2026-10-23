import { connection } from "next/server";
import { groupMembers, userFromRequest } from "@/lib/auth";
import { hasDb } from "@/lib/db";

/** Участники группы того, кто спрашивает: только имена, без токенов. */
export async function GET(req: Request) {
  await connection(); // переменные окружения читаем при запросе, а не при сборке
  if (!hasDb()) return Response.json({ shared: false, members: [] });
  try {
    const me = await userFromRequest(req);
    if (!me) return Response.json({ error: "Войдите на сайт заново" }, { status: 401 });
    const members = (await groupMembers(me.group)).map(({ id, firstName, lastName }) => ({ id, firstName, lastName }));
    return Response.json({ shared: true, group: me.group, members });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Не удалось загрузить список группы" }, { status: 500 });
  }
}

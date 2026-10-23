import { connection } from "next/server";
import { cleanGroup, cleanName, groupCodeOk, register } from "@/lib/auth";
import { hasDb } from "@/lib/db";

/** Что нужно для входа: код группы и хранится ли список участников на сервере. */
export async function GET() {
  await connection(); // переменные окружения читаем при запросе, а не при сборке
  return Response.json({ needCode: Boolean(process.env.GROUP_CODE?.trim()), shared: hasDb() });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { firstName?: string; lastName?: string; group?: string; code?: string };
    const firstName = cleanName(body.firstName || "");
    const lastName = cleanName(body.lastName || "");
    const group = cleanGroup(body.group || "");
    if (!firstName || !lastName || !group) return Response.json({ error: "Заполните имя, фамилию и группу" }, { status: 400 });
    if (!groupCodeOk(body.code)) return Response.json({ error: "Неверный код группы. Спросите его у старосты." }, { status: 403 });
    return Response.json(await register(firstName, lastName, group));
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Не получилось зарегистрироваться, попробуйте ещё раз" }, { status: 500 });
  }
}

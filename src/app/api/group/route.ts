import { groupMembers, userFromRequest } from "@/lib/auth";

/** Список группы — только для вошедших и только имена. */
export async function GET(req: Request) {
  const me = userFromRequest(req);
  if (!me) return Response.json({ error: "Войдите на сайт заново" }, { status: 401 });
  const members = groupMembers().map(({ id, firstName, lastName }) => ({ id, firstName, lastName }));
  return Response.json({ group: me.group, members });
}

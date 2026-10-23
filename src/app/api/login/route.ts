import { login, track } from "@/lib/auth";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { login?: string; password?: string };
  const result = login(body.login || "", body.password || "");
  if (!result) {
    // небольшая пауза, чтобы пароли нельзя было быстро перебирать
    await new Promise((r) => setTimeout(r, 800));
    return Response.json({ error: "Неверный логин или пароль" }, { status: 401 });
  }
  await track(result.user.id, true);
  return Response.json(result);
}

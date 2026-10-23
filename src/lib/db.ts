// Upstash Redis через REST: Vercel → Storage → Upstash Redis сам добавляет переменные в проект.
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";

export const hasDb = () => Boolean(URL_ && TOKEN);

type Command = (string | number)[];

async function call(path: string, body: unknown) {
  const res = await fetch(`${URL_.replace(/\/$/, "")}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`База данных ответила ошибкой ${res.status}`);
  return res.json();
}

/** Одна команда Redis, например redis(["GET", "key"]). */
export async function redis<T = unknown>(cmd: Command): Promise<T> {
  const data = await call("", cmd);
  if (data.error) throw new Error(`База данных: ${data.error}`);
  return data.result as T;
}

/** Несколько команд за один запрос. */
export async function pipeline(cmds: Command[]): Promise<unknown[]> {
  const data = (await call("/pipeline", cmds)) as { result?: unknown; error?: string }[];
  const failed = data.find((d) => d.error);
  if (failed) throw new Error(`База данных: ${failed.error}`);
  return data.map((d) => d.result);
}

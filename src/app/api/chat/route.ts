import { requireUser } from "@/lib/auth";
import { errorResponse, streamText } from "@/lib/ai";
import { CHAT_SYSTEM } from "@/lib/prompts";

export const maxDuration = 300;

type Message = { role: "user" | "assistant"; content: string };

const MAX_HISTORY = 12;
const MAX_SUMMARY = 60_000;

/** Ответ нейросети на вопрос по конспекту: { summary, messages } → поток текста. */
export async function POST(req: Request) {
  const denied = await requireUser(req);
  if (denied) return denied;
  try {
    const { summary, messages } = (await req.json()) as { summary?: string; messages?: Message[] };
    const history = (messages || []).filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string").slice(-MAX_HISTORY);
    const last = history.at(-1);
    if (!last || last.role !== "user" || !last.content.trim()) return errorResponse(new Error("Напишите вопрос"), 400);
    const dialog = history
      .map((m) => `${m.role === "user" ? "Студент" : "Ассистент"}: ${m.content.slice(0, 4000)}`)
      .join("\n\n");
    const task = `<dialog>\n${dialog}\n</dialog>\n\nОтветь на последнее сообщение студента.`;
    return new Response(await streamText(CHAT_SYSTEM, { text: `<summary>\n${(summary || "").slice(0, MAX_SUMMARY)}\n</summary>` }, task, "low"), {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (err) {
    return errorResponse(err);
  }
}

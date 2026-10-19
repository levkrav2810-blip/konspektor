import { errorResponse, streamText } from "@/lib/ai";
import { TRANSFORMS } from "@/lib/prompts";

export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const { summary, kind, language } = (await req.json()) as { summary: string; kind: string; language?: string };
    const t = TRANSFORMS[kind];
    if (!t) return errorResponse(new Error("Неизвестное действие"), 400);
    const task = kind === "translate" ? `Язык перевода: ${language || "English"}` : "Выполни задание для этого конспекта.";
    return new Response(await streamText(t.system, { text: `<summary>\n${summary}\n</summary>` }, task, "low"), {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (err) {
    return errorResponse(err);
  }
}

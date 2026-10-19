import { errorResponse, streamText } from "@/lib/claude";
import { TRANSFORMS } from "@/lib/prompts";

export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const { summary, kind, language } = (await req.json()) as { summary: string; kind: string; language?: string };
    const t = TRANSFORMS[kind];
    if (!t) return errorResponse(new Error("Неизвестное действие"), 400);
    let task = `<summary>\n${summary}\n</summary>`;
    if (kind === "translate") task += `\n\nЯзык перевода: ${language || "English"}`;
    return new Response(await streamText(t.system, [{ type: "text", text: task }], "low"), {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (err) {
    return errorResponse(err);
  }
}

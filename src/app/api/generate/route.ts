import { requireUser } from "@/lib/auth";
import { z } from "zod";
import { errorResponse, generateJson } from "@/lib/ai";
import { GAME_SYSTEM, PODCAST_SYSTEM, SLIDES_SYSTEM } from "@/lib/prompts";

export const maxDuration = 300;

// Учебные материалы из конспекта в виде JSON: презентация, сценарий подкаста, вопросы для игры.
const KINDS = {
  slides: {
    system: SLIDES_SYSTEM,
    task: "Сделай презентацию по конспекту.",
    schema: z.object({ slides: z.array(z.object({ title: z.string(), emoji: z.string(), bullets: z.array(z.string()) })) }),
  },
  podcast: {
    system: PODCAST_SYSTEM,
    task: "Напиши сценарий подкаста по конспекту.",
    schema: z.object({ lines: z.array(z.object({ speaker: z.enum(["A", "B"]), text: z.string() })) }),
  },
  game: {
    system: GAME_SYSTEM,
    task: "Сделай вопросы для игры по конспекту.",
    schema: z.object({ items: z.array(z.object({ question: z.string(), correct: z.string(), wrong: z.array(z.string()) })) }),
  },
};

export async function POST(req: Request) {
  const denied = await requireUser(req);
  if (denied) return denied;
  try {
    const { summary, kind } = (await req.json()) as { summary: string; kind: keyof typeof KINDS };
    const k = KINDS[kind];
    if (!k) return errorResponse(new Error("Неизвестное действие"), 400);
    const data = await generateJson(k.system, `${k.task}\n\n<summary>\n${summary}\n</summary>`, k.schema as z.ZodType);
    return Response.json(data);
  } catch (err) {
    return errorResponse(err);
  }
}

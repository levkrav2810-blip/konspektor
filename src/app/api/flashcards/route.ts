import { z } from "zod";
import { errorResponse, generateJson } from "@/lib/ai";
import { FLASHCARDS_SYSTEM } from "@/lib/prompts";

export const maxDuration = 300;

const Schema = z.object({
  cards: z.array(z.object({ front: z.string(), back: z.string() })),
});

export async function POST(req: Request) {
  try {
    const { summary, count = 15 } = (await req.json()) as { summary: string; count?: number };
    const data = await generateJson(
      FLASHCARDS_SYSTEM,
      `Сделай ${count} карточек по конспекту:\n\n<summary>\n${summary}\n</summary>`,
      Schema,
    );
    return Response.json(data);
  } catch (err) {
    return errorResponse(err);
  }
}

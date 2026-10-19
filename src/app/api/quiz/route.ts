import { z } from "zod";
import { errorResponse, generateJson } from "@/lib/ai";
import { QUIZ_SYSTEM } from "@/lib/prompts";

export const maxDuration = 300;

const Schema = z.object({
  questions: z.array(
    z.object({
      question: z.string(),
      options: z.array(z.string()),
      correctIndex: z.number().int(),
      explanation: z.string(),
    }),
  ),
});

export async function POST(req: Request) {
  try {
    const { summary, count = 10 } = (await req.json()) as { summary: string; count?: number };
    const data = await generateJson(
      QUIZ_SYSTEM,
      `Составь тест из ${count} вопросов по конспекту:\n\n<summary>\n${summary}\n</summary>`,
      Schema,
    );
    return Response.json(data);
  } catch (err) {
    return errorResponse(err);
  }
}

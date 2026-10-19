import { errorResponse, streamText, type Material } from "@/lib/ai";
import { SUMMARY_SYSTEM } from "@/lib/prompts";

export const maxDuration = 300;

type Body = {
  text?: string;
  file?: { base64: string; mediaType: string; name?: string };
  source?: string;
  wishes?: string;
};

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    const material: Material = {};

    if (body.file) {
      const { base64, mediaType } = body.file;
      if (mediaType === "application/pdf") material.pdf = base64;
      else if (IMAGE_TYPES.includes(mediaType)) material.image = { base64, mediaType };
      else return errorResponse(new Error(`Неподдерживаемый тип файла: ${mediaType}`), 400);
    }
    if (body.text) material.text = `<material>\n${body.text}\n</material>`;
    if (!material.text && !material.pdf && !material.image) return errorResponse(new Error("Нет материала для конспекта"), 400);

    let task = "Сделай структурированный конспект этого материала.";
    if (body.source) task += ` Источник: ${body.source}.`;
    if (body.wishes?.trim()) task += `\nПожелания пользователя: ${body.wishes.trim()}`;

    return new Response(await streamText(SUMMARY_SYSTEM, material, task, "medium"), {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (err) {
    return errorResponse(err);
  }
}

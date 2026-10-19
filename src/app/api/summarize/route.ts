import { errorResponse, streamText, type UserContent } from "@/lib/claude";
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
    const content: UserContent = [];

    if (body.file) {
      const { base64, mediaType } = body.file;
      if (mediaType === "application/pdf") {
        content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } });
      } else if (IMAGE_TYPES.includes(mediaType)) {
        content.push({
          type: "image",
          source: { type: "base64", media_type: mediaType as "image/png", data: base64 },
        });
      } else {
        return errorResponse(new Error(`Неподдерживаемый тип файла: ${mediaType}`), 400);
      }
    }

    if (body.text) {
      content.push({ type: "text", text: `<material>\n${body.text}\n</material>` });
    }
    if (content.length === 0) return errorResponse(new Error("Нет материала для конспекта"), 400);

    let task = "Сделай структурированный конспект этого материала.";
    if (body.source) task += ` Источник: ${body.source}.`;
    if (body.wishes?.trim()) task += `\nПожелания пользователя: ${body.wishes.trim()}`;
    content.push({ type: "text", text: task });

    return new Response(await streamText(SUMMARY_SYSTEM, content, "medium"), {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (err) {
    return errorResponse(err);
  }
}

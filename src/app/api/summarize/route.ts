import { errorResponse, streamSummary, type Material } from "@/lib/ai";

export const maxDuration = 300;

type Body = {
  text?: string;
  file?: { base64: string; mediaType: string; name?: string };
  source?: string;
  wishes?: string;
  settings?: { language?: string; detail?: "short" | "normal" | "deep"; additions?: boolean; answers?: boolean };
};

const DETAIL: Record<string, string> = {
  short: "Сделай компактный конспект: 3–5 разделов по 1–2 абзаца, только главное, без длинных примеров.",
  deep: "Сделай максимально подробный конспект: больше разделов, примеров, пояснений и связей между темами.",
};

/** Превращает настройки пользователя в дополнительные указания для нейросети. */
function settingsToTask(s: Body["settings"] = {}) {
  const out: string[] = [];
  if (s.detail && DETAIL[s.detail]) out.push(DETAIL[s.detail]);
  if (s.language?.trim()) out.push(`Пиши конспект на языке: ${s.language.trim().slice(0, 40)}.`);
  if (s.additions === false) out.push("Не добавляй ничего от себя: никаких блоков «💡 Дополнение», только то, что есть в материале.");
  if (s.answers === false) out.push("В разделе «Вопросы для самопроверки» пиши только вопросы, без ответов.");
  return out.length ? `\n${out.join("\n")}` : "";
}

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
    if (body.text) material.text = body.text;
    if (!material.text && !material.pdf && !material.image) return errorResponse(new Error("Нет материала для конспекта"), 400);

    let extra = "";
    if (body.source) extra += ` Источник: ${body.source}.`;
    extra += settingsToTask(body.settings);
    if (body.wishes?.trim()) extra += `\nПожелания пользователя: ${body.wishes.trim()}`;

    return new Response(await streamSummary(material, extra), {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (err) {
    return errorResponse(err);
  }
}

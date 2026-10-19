import Anthropic from "@anthropic-ai/sdk";
import { extractText, getDocumentProxy } from "unpdf";
import type { z } from "zod";
import { claudeGenerateJson, claudeStreamText, type UserContent } from "./claude";
import { yandexGenerateJson, yandexStreamText } from "./yandex";

// Какая нейросеть пишет конспекты: "claude" (по умолчанию) или "yandex" (YandexGPT, оплата российской картой).
export const PROVIDER = process.env.AI_PROVIDER === "yandex" ? "yandex" : "claude";

export type Material = {
  text?: string;
  pdf?: string; // base64
  image?: { base64: string; mediaType: string };
};

export async function pdfToText(base64: string) {
  const pdf = await getDocumentProxy(new Uint8Array(Buffer.from(base64, "base64")));
  const { text } = await extractText(pdf, { mergePages: true });
  if (!text.trim()) throw new Error("В PDF нет текстового слоя (похоже на скан). Сфотографируйте страницы или вставьте текст.");
  return text;
}

/** Стримит ответ нейросети как text/plain. material — исходник, task — что с ним сделать. */
export async function streamText(system: string, material: Material, task: string, effort: "low" | "medium" = "medium") {
  if (PROVIDER === "claude") {
    const content: UserContent = [];
    if (material.pdf) content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: material.pdf } });
    if (material.image) content.push({ type: "image", source: { type: "base64", media_type: material.image.mediaType as "image/png", data: material.image.base64 } });
    if (material.text) content.push({ type: "text", text: material.text });
    content.push({ type: "text", text: task });
    return claudeStreamText(system, content, effort);
  }
  if (material.image) throw new Error("Фото пока поддерживаются только с Claude. Загрузите PDF, документ или вставьте текст.");
  let text = material.text ?? "";
  if (material.pdf) text = `${await pdfToText(material.pdf)}\n${text}`;
  return yandexStreamText(system, `${text}\n\n${task}`);
}

export function generateJson<T extends z.ZodType>(system: string, prompt: string, schema: T): Promise<z.infer<T>> {
  return PROVIDER === "claude" ? claudeGenerateJson(system, prompt, schema) : yandexGenerateJson(system, prompt, schema);
}

export function errorResponse(err: unknown, status = 500) {
  let message = err instanceof Error ? err.message : String(err);
  if (err instanceof Anthropic.AuthenticationError || /authentication method/i.test(message)) {
    message = "Не задан или неверен ANTHROPIC_API_KEY в настройках сайта";
  } else if (err instanceof Anthropic.RateLimitError) {
    message = "Слишком много запросов, попробуйте через минуту";
    status = 429;
  } else if (err instanceof Anthropic.APIError && err.status) {
    status = err.status >= 500 ? 502 : err.status;
  }
  console.error(err);
  return Response.json({ error: message }, { status });
}

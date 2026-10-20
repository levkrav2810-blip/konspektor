import Anthropic from "@anthropic-ai/sdk";
import { extractText, getDocumentProxy } from "unpdf";
import type { z } from "zod";
import { claudeGenerateJson, claudeStreamText, type UserContent } from "./claude";
import { SUMMARY_FINAL_SYSTEM, SUMMARY_PART_SYSTEM, SUMMARY_SYSTEM } from "./prompts";
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

// YandexGPT видит ~32 тыс. токенов и пишет не больше 8 тыс., поэтому длинную лекцию
// конспектируем по частям (параллельно), а в конце дописываем выводы и вопросы.
const PART_CHARS = 12000;
const PART_CONCURRENCY = 4;

/** Режет текст на части около size символов по границам абзацев или предложений. */
export function splitText(text: string, size = PART_CHARS) {
  const parts: string[] = [];
  let rest = text.trim();
  while (rest.length > size * 1.3) {
    const window = rest.slice(0, size);
    let cut = window.lastIndexOf("\n\n");
    if (cut < size * 0.6) cut = Math.max(window.lastIndexOf(". "), window.lastIndexOf("? "), window.lastIndexOf("! ")) + 1;
    if (cut < size * 0.6) cut = window.lastIndexOf(" ");
    if (cut <= 0) cut = size;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

/** Стримит конспект. extra — источник и пожелания пользователя. */
export async function streamSummary(material: Material, extra: string) {
  const task = `Сделай подробный конспект этого материала.${extra}`;
  const wrapped = { ...material, text: material.text ? `<material>\n${material.text}\n</material>` : undefined };
  if (PROVIDER === "claude") return streamText(SUMMARY_SYSTEM, wrapped, task, "medium");

  if (material.image) throw new Error("Фото пока поддерживаются только с Claude. Загрузите PDF, документ или вставьте текст.");
  let text = material.text ?? "";
  if (material.pdf) text = `${await pdfToText(material.pdf)}\n${text}`;
  const parts = splitText(text);
  if (parts.length === 1) return yandexStreamText(SUMMARY_SYSTEM, `<material>\n${text}\n</material>\n\n${task}`);

  const n = parts.length;
  const partTask = (i: number) =>
    `<material>\n${parts[i]}\n</material>\n\nЭто часть ${i + 1} из ${n}. Сделай подробный конспект этой части.` +
    (i === 0 ? " Начни с заголовка «# <эмодзи> <тема всей лекции>»." : "") +
    extra;

  // Части пишутся параллельно, но отдаются пользователю строго по порядку.
  type Part = { chunks: string[]; done: boolean; wake?: () => void };
  const buffers: Part[] = parts.map(() => ({ chunks: [], done: false }));
  let active = 0;
  const queue: (() => void)[] = [];
  const acquire = () => (active < PART_CONCURRENCY ? (active++, Promise.resolve()) : new Promise<void>((r) => queue.push(r)));
  const release = () => (queue.length ? queue.shift()!() : active--);

  async function produce(i: number, first?: ReadableStream<Uint8Array>) {
    const buf = buffers[i];
    const decoder = new TextDecoder();
    try {
      const stream = first ?? (await acquire(), await yandexStreamText(SUMMARY_PART_SYSTEM, partTask(i)));
      const reader = stream.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf.chunks.push(decoder.decode(value, { stream: true }));
        buf.wake?.();
      }
    } catch (err) {
      buf.chunks.push(`\n\n> ⚠️ Не удалось законспектировать часть ${i + 1}: ${err instanceof Error ? err.message : String(err)}\n`);
    } finally {
      buf.done = true;
      buf.wake?.();
      release();
    }
  }

  // Первую часть запрашиваем сразу: если ключ неверный, ошибка уйдёт пользователю как JSON.
  await acquire();
  let firstStream: ReadableStream<Uint8Array>;
  try {
    firstStream = await yandexStreamText(SUMMARY_PART_SYSTEM, partTask(0));
  } catch (err) {
    release();
    throw err;
  }
  produce(0, firstStream);
  for (let i = 1; i < n; i++) produce(i);

  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const written: string[] = [];
      for (let i = 0; i < n; i++) {
        const buf = buffers[i];
        let pos = 0;
        for (;;) {
          while (pos < buf.chunks.length) {
            const chunk = buf.chunks[pos++];
            written.push(chunk);
            controller.enqueue(encoder.encode(chunk));
          }
          if (buf.done) break;
          await new Promise<void>((r) => (buf.wake = r));
          buf.wake = undefined;
        }
        controller.enqueue(encoder.encode("\n\n"));
        written.push("\n\n");
      }
      try {
        const notes = written.join("").slice(0, 60000);
        const final = await yandexStreamText(SUMMARY_FINAL_SYSTEM, `<notes>\n${notes}\n</notes>\n\nДопиши завершающий блок.${extra}`);
        const reader = final.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(value);
        }
      } catch (err) {
        controller.enqueue(encoder.encode(`\n\n> ⚠️ Не удалось дописать выводы: ${err instanceof Error ? err.message : String(err)}\n`));
      }
      controller.close();
    },
  });
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

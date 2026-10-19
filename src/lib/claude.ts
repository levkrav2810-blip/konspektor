import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";

export const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5-5";

// Если основная модель отказывает по политике, сервер Anthropic сам повторит запрос на запасной модели.
const FALLBACK = {
  betas: ["server-side-fallback-2026-07-01"],
  fallbacks: "default" as const,
};

let client: Anthropic | null = null;
function getClient() {
  if (!client) client = new Anthropic();
  return client;
}

export type UserContent = Anthropic.Beta.BetaContentBlockParam[];

/**
 * Стримит текстовый ответ модели как обычный text/plain поток.
 * Ждёт первое событие, чтобы ошибки (ключ, лимиты) вернулись обычным JSON-ответом, а не оборванным потоком.
 */
export async function streamText(system: string, content: UserContent, effort: "low" | "medium" | "high" = "medium") {
  const stream = getClient().beta.messages.stream({
    model: MODEL,
    max_tokens: 64000,
    system,
    output_config: { effort },
    messages: [{ role: "user", content }],
    ...FALLBACK,
  });
  const events = stream[Symbol.asyncIterator]();
  const first = await events.next();

  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for (let r = first; !r.done; r = await events.next()) {
          const event = r.value;
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
        const final = await stream.finalMessage();
        if (final.stop_reason === "refusal") {
          controller.enqueue(encoder.encode("\n\n_Модель отказалась обрабатывать этот материал._"));
        } else if (final.stop_reason === "max_tokens") {
          controller.enqueue(encoder.encode("\n\n_Материал слишком большой: конспект обрезан._"));
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
    cancel() {
      stream.abort();
    },
  });
}

/** Запрос со строгой JSON-схемой: ответ гарантированно соответствует zod-схеме. */
export async function generateJson<T extends z.ZodType>(system: string, prompt: string, schema: T): Promise<z.infer<T>> {
  const response = await getClient().beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    system,
    output_config: { effort: "low", format: betaZodOutputFormat(schema) },
    messages: [{ role: "user", content: prompt }],
    ...FALLBACK,
  });
  if (response.stop_reason === "refusal" || !response.parsed_output) {
    throw new Error("Модель не смогла сгенерировать ответ");
  }
  return response.parsed_output;
}

export function errorResponse(err: unknown, status = 500) {
  let message = err instanceof Error ? err.message : String(err);
  if (err instanceof Anthropic.AuthenticationError || /authentication method/i.test(message)) {
    message = "Не задан или неверен ANTHROPIC_API_KEY в .env.local";
  } else if (err instanceof Anthropic.RateLimitError) {
    message = "Слишком много запросов, попробуйте через минуту";
    status = 429;
  } else if (err instanceof Anthropic.APIError && err.status) {
    status = err.status >= 500 ? 502 : err.status;
  }
  console.error(err);
  return Response.json({ error: message }, { status });
}

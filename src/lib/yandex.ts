import { z } from "zod";

// OpenAI-совместимый API: Yandex AI Studio (AI_PROVIDER=yandex) или любой другой провайдер
// с таким же API, например Cloud.ru Evolution Foundation Models (AI_PROVIDER=openai).
const IS_OPENAI = process.env.AI_PROVIDER === "openai";
const NAME = IS_OPENAI ? "нейросети" : "YandexGPT";
const MAX_TOKENS = IS_OPENAI ? 16000 : 8000;

function config() {
  if (IS_OPENAI) {
    const apiKey = process.env.LLM_API_KEY;
    const baseUrl = process.env.LLM_BASE_URL || "https://foundation-models.api.cloud.ru/v1";
    const model = process.env.LLM_MODEL;
    if (!apiKey || !model) throw new Error("Не заданы LLM_API_KEY и LLM_MODEL в настройках сайта");
    return { baseUrl, model, headers: { Authorization: `Bearer ${apiKey}` } as Record<string, string> };
  }
  const apiKey = process.env.YANDEX_API_KEY;
  const folder = process.env.YANDEX_FOLDER_ID;
  if (!apiKey || !folder) throw new Error("Не заданы YANDEX_API_KEY и YANDEX_FOLDER_ID в настройках сайта");
  const model = process.env.YANDEX_MODEL || "yandexgpt/latest";
  return {
    baseUrl: process.env.YANDEX_BASE_URL || "https://ai.api.cloud.yandex.net/v1",
    model: model.startsWith("gpt://") ? model : `gpt://${folder}/${model}`,
    headers: { Authorization: `Api-Key ${apiKey}`, "x-folder-id": folder } as Record<string, string>,
  };
}

async function chat(body: Record<string, unknown>) {
  const { baseUrl, model, headers } = config();
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ model, temperature: 0.3, ...body }),
  });
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 401 || res.status === 403)
      throw new Error(
        IS_OPENAI
          ? `Провайдер нейросети отклонил ключ (${res.status}). Проверьте LLM_API_KEY и LLM_BASE_URL.`
          : `Yandex Cloud отклонил ключ (${res.status}). Проверьте YANDEX_API_KEY, YANDEX_FOLDER_ID и роль ai.languageModels.user.`,
      );
    if (res.status === 404 && IS_OPENAI) throw new Error(`Модель «${model}» не найдена. Проверьте LLM_MODEL. ${text.slice(0, 200)}`);
    if (res.status === 429) throw new Error("Слишком много запросов к нейросети, попробуйте через минуту");
    const err = new Error(`Ошибка ${NAME} (${res.status}): ${text.slice(0, 300)}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return res;
}

export async function yandexStreamText(system: string, user: string) {
  const res = await chat({
    stream: true,
    max_tokens: MAX_TOKENS,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          return;
        }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        let emitted = false;
        for (const line of lines) {
          const data = line.trim();
          if (!data.startsWith("data:")) continue;
          const payload = data.slice(5).trim();
          if (payload === "[DONE]") continue;
          try {
            const delta = JSON.parse(payload).choices?.[0]?.delta?.content;
            if (delta) {
              controller.enqueue(encoder.encode(delta));
              emitted = true;
            }
          } catch {
            // неполный или служебный фрагмент
          }
        }
        if (emitted) return;
      }
    },
    cancel() {
      reader.cancel();
    },
  });
}

export async function yandexGenerateJson<T extends z.ZodType>(system: string, user: string, schema: T): Promise<z.infer<T>> {
  const jsonSchema = z.toJSONSchema(schema);
  const body = {
    max_tokens: MAX_TOKENS,
    messages: [
      { role: "system", content: `${system}\nОтвечай строго JSON-объектом по этой схеме, без пояснений:\n${JSON.stringify(jsonSchema)}` },
      { role: "user", content: user },
    ],
  };
  let res: Response;
  try {
    res = await chat({ ...body, response_format: { type: "json_schema", json_schema: { name: "result", schema: jsonSchema, strict: true } } });
  } catch (err) {
    // Не все провайдеры умеют json_schema: тогда просим JSON только инструкцией.
    if ((err as { status?: number }).status !== 400) throw err;
    res = await chat(body);
  }
  const data = await res.json();
  const text: string = data.choices?.[0]?.message?.content ?? "";
  const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  const parsed = schema.safeParse(JSON.parse(json || "null"));
  if (!parsed.success) throw new Error("Нейросеть вернула ответ в неверном формате, попробуйте ещё раз");
  return parsed.data;
}

/** Распознаёт один фрагмент речи (до 30 с, LPCM 16 кГц моно) через SpeechKit v1. */
export async function yandexRecognize(pcm: ArrayBuffer) {
  const apiKey = process.env.YANDEX_API_KEY;
  const folder = process.env.YANDEX_FOLDER_ID;
  if (!apiKey || !folder) throw new Error("Не заданы YANDEX_API_KEY и YANDEX_FOLDER_ID в настройках сайта");
  const params = new URLSearchParams({
    lang: process.env.STT_LANG || "ru-RU",
    format: "lpcm",
    sampleRateHertz: "16000",
    folderId: folder,
  });
  const sttUrl = process.env.YANDEX_STT_URL || "https://stt.api.cloud.yandex.net/speech/v1/stt:recognize";
  const res = await fetch(`${sttUrl}?${params}`, {
    method: "POST",
    headers: { Authorization: `Api-Key ${apiKey}` },
    body: pcm,
  });
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 401 || res.status === 403) throw new Error(`SpeechKit отклонил ключ (${res.status}). Нужна роль ai.speechkit-stt.user.`);
    throw new Error(`Ошибка SpeechKit (${res.status}): ${text.slice(0, 300)}`);
  }
  const data = (await res.json()) as { result?: string };
  return data.result ?? "";
}

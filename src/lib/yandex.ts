import { z } from "zod";

// OpenAI-совместимый API Yandex AI Studio (YandexGPT и другие модели из Model Gallery).
const BASE_URL = process.env.YANDEX_BASE_URL || "https://ai.api.cloud.yandex.net/v1";

function config() {
  const apiKey = process.env.YANDEX_API_KEY;
  const folder = process.env.YANDEX_FOLDER_ID;
  if (!apiKey || !folder) throw new Error("Не заданы YANDEX_API_KEY и YANDEX_FOLDER_ID в настройках сайта");
  const model = process.env.YANDEX_MODEL || "yandexgpt/latest";
  return { apiKey, folder, model: model.startsWith("gpt://") ? model : `gpt://${folder}/${model}` };
}

async function chat(body: Record<string, unknown>) {
  const { apiKey, folder, model } = config();
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Api-Key ${apiKey}`,
      "x-folder-id": folder,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, temperature: 0.3, ...body }),
  });
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 401 || res.status === 403) throw new Error(`Yandex Cloud отклонил ключ (${res.status}). Проверьте YANDEX_API_KEY, YANDEX_FOLDER_ID и роль ai.languageModels.user.`);
    if (res.status === 429) throw new Error("Слишком много запросов к YandexGPT, попробуйте через минуту");
    throw new Error(`Ошибка YandexGPT (${res.status}): ${text.slice(0, 300)}`);
  }
  return res;
}

export async function yandexStreamText(system: string, user: string) {
  const res = await chat({
    stream: true,
    max_tokens: 8000,
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
  const res = await chat({
    max_tokens: 8000,
    response_format: {
      type: "json_schema",
      json_schema: { name: "result", schema: z.toJSONSchema(schema), strict: true },
    },
    messages: [
      { role: "system", content: `${system}\nОтвечай строго JSON-объектом по заданной схеме, без пояснений.` },
      { role: "user", content: user },
    ],
  });
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

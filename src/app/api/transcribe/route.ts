import { errorResponse } from "@/lib/claude";

export const maxDuration = 300;

// Любой сервис с OpenAI-совместимым API распознавания речи: OpenAI Whisper, Groq и т.п.
const STT_BASE_URL = process.env.STT_BASE_URL || "https://api.openai.com/v1";
const STT_MODEL = process.env.STT_MODEL || "whisper-1";

export async function POST(req: Request) {
  try {
    const apiKey = process.env.STT_API_KEY;
    if (!apiKey) {
      return errorResponse(new Error("Распознавание речи не настроено: задайте STT_API_KEY в .env.local"), 501);
    }
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return errorResponse(new Error("Файл не передан"), 400);

    const upstream = new FormData();
    upstream.append("file", file, file.name || "audio.webm");
    upstream.append("model", STT_MODEL);
    upstream.append("response_format", "text");

    const res = await fetch(`${STT_BASE_URL}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: upstream,
    });
    if (!res.ok) {
      return errorResponse(new Error(`Ошибка распознавания (${res.status}): ${await res.text()}`), 502);
    }
    const text = (await res.text()).trim();
    return Response.json({ text });
  } catch (err) {
    return errorResponse(err);
  }
}

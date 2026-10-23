import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/ai";
import { yandexRecognize } from "@/lib/yandex";

export const maxDuration = 60;

// Распознаёт один фрагмент речи: браузер режет запись на куски до 25 с в формате LPCM 16 кГц моно.
// По умолчанию OpenAI-совместимый Whisper (OpenAI, Groq); STT_PROVIDER=yandex — Yandex SpeechKit.
const SAMPLE_RATE = 16000;
const MAX_BYTES = 1024 * 1024;

function wav(pcm: ArrayBuffer) {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.byteLength, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.byteLength, 40);
  return new Blob([header, new Uint8Array(pcm)], { type: "audio/wav" });
}

async function whisper(pcm: ArrayBuffer) {
  const apiKey = process.env.STT_API_KEY;
  if (!apiKey) throw new Error("Не задан STT_API_KEY в настройках сайта");
  const form = new FormData();
  form.append("file", wav(pcm), "chunk.wav");
  form.append("model", process.env.STT_MODEL || "whisper-1");
  form.append("response_format", "text");
  const res = await fetch(`${process.env.STT_BASE_URL || "https://api.openai.com/v1"}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!res.ok) throw new Error(`Ошибка распознавания (${res.status}): ${(await res.text()).slice(0, 300)}`);
  return (await res.text()).trim();
}

export async function POST(req: Request) {
  const denied = await requireUser(req);
  if (denied) return denied;
  try {
    const pcm = await req.arrayBuffer();
    if (!pcm.byteLength) return errorResponse(new Error("Пустой фрагмент"), 400);
    if (pcm.byteLength > MAX_BYTES) return errorResponse(new Error("Фрагмент больше 1 МБ"), 413);
    const text = process.env.STT_PROVIDER === "yandex" ? await yandexRecognize(pcm) : await whisper(pcm);
    return Response.json({ text });
  } catch (err) {
    return errorResponse(err);
  }
}

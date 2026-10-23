"use client";

import { authFetch } from "@/lib/user";

const RATE = 16000;
const CHUNK_SECONDS = 25;

/**
 * Декодирует любую запись или видео, которое умеет браузер, в моно LPCM 16 кГц
 * и режет на фрагменты по 25 секунд (каждый меньше 1 МБ — лимит синхронного SpeechKit).
 */
export async function audioToChunks(blob: Blob): Promise<ArrayBuffer[]> {
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx({ sampleRate: RATE });
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
  } catch {
    throw new Error("Не удалось прочитать звук из файла. Попробуйте mp3, m4a, wav или mp4.");
  } finally {
    ctx.close();
  }

  const mono = new Float32Array(decoded.length);
  for (let c = 0; c < decoded.numberOfChannels; c++) {
    const data = decoded.getChannelData(c);
    for (let i = 0; i < data.length; i++) mono[i] += data[i] / decoded.numberOfChannels;
  }
  const samples = decoded.sampleRate === RATE ? mono : resample(mono, decoded.sampleRate, RATE);

  const size = RATE * CHUNK_SECONDS;
  const chunks: ArrayBuffer[] = [];
  for (let start = 0; start < samples.length; start += size) {
    const part = samples.subarray(start, Math.min(start + size, samples.length));
    const pcm = new DataView(new ArrayBuffer(part.length * 2));
    for (let i = 0; i < part.length; i++) {
      const s = Math.max(-1, Math.min(1, part[i]));
      pcm.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    chunks.push(pcm.buffer);
  }
  return chunks;
}

function resample(input: Float32Array, from: number, to: number) {
  const ratio = from / to;
  const out = new Float32Array(Math.floor(input.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const pos = i * ratio;
    const j = Math.floor(pos);
    const frac = pos - j;
    out[i] = input[j] * (1 - frac) + (input[j + 1] ?? input[j]) * frac;
  }
  return out;
}

/** Отправляет фрагменты на распознавание по несколько параллельно, сохраняя порядок. */
export async function transcribeChunks(chunks: ArrayBuffer[], onProgress: (done: number, total: number) => void) {
  const results: string[] = new Array(chunks.length).fill("");
  let next = 0;
  let done = 0;
  async function worker() {
    while (next < chunks.length) {
      const i = next++;
      const res = await authFetch("/api/transcribe", { method: "POST", body: chunks[i] });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Ошибка распознавания ${res.status}`);
      results[i] = data.text || "";
      onProgress(++done, chunks.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, chunks.length) }, worker));
  return results.join(" ").replace(/\s+/g, " ").trim();
}

"use client";

import { authFetch } from "@/lib/user";

const RATE = 16000;
const CHUNK_SECONDS = 25;
// сколько фрагментов распознаём одновременно: длинная лекция — это сотни фрагментов
const PARALLEL = 6;
const RETRIES = 3;

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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Распознаёт один фрагмент; временные сбои (таймаут, перегрузка, обрыв сети) повторяет с паузой. */
async function recognize(chunk: ArrayBuffer): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    let status = 0;
    let message = "";
    try {
      const res = await authFetch("/api/transcribe", { method: "POST", body: chunk });
      const data = await res.json().catch(() => ({}));
      if (res.ok) return data.text || "";
      status = res.status;
      message = data.error || `Ошибка распознавания ${res.status}`;
    } catch (e) {
      message = e instanceof Error ? e.message : String(e); // обрыв сети
    }
    // неверный ключ, вход или слишком большой кусок повтор не исправит
    const permanent = status === 400 || status === 401 || status === 403 || status === 413;
    if (permanent || attempt >= RETRIES) throw Object.assign(new Error(message), { permanent });
    await sleep(1500 * 2 ** attempt);
  }
}

/**
 * Отправляет фрагменты на распознавание по несколько параллельно, сохраняя порядок.
 * Если отдельные фрагменты так и не распознались, пропускает их (до 5% записи), чтобы
 * один сбой не перечёркивал полтора часа работы.
 * done — уже распознанные раньше фрагменты (null — ещё нет): их не отправляем повторно.
 * onChunk вызывается после каждого распознанного фрагмента, чтобы сохранить прогресс.
 */
export async function transcribeChunks(
  chunks: ArrayBuffer[],
  onProgress: (done: number, total: number) => void,
  opts: { done?: (string | null)[]; onChunk?: (texts: (string | null)[]) => void } = {},
) {
  const results: (string | null)[] = chunks.map((_, i) => opts.done?.[i] ?? null);
  const todo = results.flatMap((r, i) => (r === null ? [i] : []));
  let next = 0;
  let done = chunks.length - todo.length;
  let failed = 0;
  let fatal: Error | null = null;
  const maxSkipped = Math.max(1, Math.floor(chunks.length * 0.05));
  if (done) onProgress(done, chunks.length);
  async function worker() {
    while (next < todo.length && !fatal) {
      const i = todo[next++];
      try {
        results[i] = await recognize(chunks[i]);
        opts.onChunk?.(results);
      } catch (e) {
        const err = e as Error & { permanent?: boolean };
        if (err.permanent || ++failed > maxSkipped) {
          fatal = err;
          return;
        }
      }
      if (!fatal) onProgress(++done, chunks.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(PARALLEL, todo.length) }, worker));
  if (fatal) throw fatal;
  return results.join(" ").replace(/\s+/g, " ").trim();
}

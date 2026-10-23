"use client";

export type Flashcard = { front: string; back: string };
export type QuizQuestion = { question: string; options: string[]; correctIndex: number; explanation: string };

export type Note = {
  id: string;
  title: string;
  createdAt: number;
  source: string;
  summary: string;
  transcript?: string;
  flashcards?: Flashcard[];
  quiz?: QuizQuestion[];
  extras?: { id: string; label: string; content: string }[];
};

const KEY = "konspektor.notes.v1";

export function loadNotes(): Note[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

export function saveNotes(notes: Note[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(notes));
  } catch {
    // переполнено хранилище — просто не сохраняем
  }
}

export function titleFromMarkdown(md: string, fallback: string) {
  const m = md.match(/^#\s+(.+)$/m);
  return (m?.[1] || fallback).replace(/[*_`]/g, "").slice(0, 80);
}

async function readError(res: Response) {
  try {
    const data = await res.json();
    return data.error || `Ошибка ${res.status}`;
  } catch {
    return `Ошибка ${res.status}`;
  }
}

export async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export async function postForm<T>(url: string, file: Blob, name: string): Promise<T> {
  const form = new FormData();
  form.append("file", file, name);
  const res = await fetch(url, { method: "POST", body: form });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

/** POST и чтение потокового текстового ответа; onChunk получает весь накопленный текст. */
export async function postStream(url: string, body: unknown, onChunk: (text: string) => void): Promise<string> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok || !res.body) throw new Error(await readError(res));
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
    onChunk(text);
  }
  return text;
}

export function fileToBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1]);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

export function downloadText(filename: string, text: string, type = "text/markdown") {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Русское склонение: plural(3, "конспект", "конспекта", "конспектов") → «конспекта». */
export function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

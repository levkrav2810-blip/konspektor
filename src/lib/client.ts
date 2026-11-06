"use client";

import { authFetch } from "@/lib/user";

export type Flashcard = { front: string; back: string };
export type QuizQuestion = { question: string; options: string[]; correctIndex: number; explanation: string };

export type ChatMessage = { role: "user" | "assistant"; content: string };
export type Slide = { title: string; emoji: string; bullets: string[] };
export type PodcastLine = { speaker: "A" | "B"; text: string };
export type GameItem = { question: string; correct: string; wrong: string[] };
export type Subject = { id: string; name: string; color: string; createdAt: number };

export const SUBJECT_COLORS = ["#3b7bff", "#10b981", "#ec4899", "#f97316", "#8b5cf6", "#06b6d4", "#eab308", "#ef4444"];

const subjectsKey = (userId: string) => `konspektor.subjects.${userId}`;

export function loadSubjects(userId: string): Subject[] {
  try {
    const v = JSON.parse(localStorage.getItem(subjectsKey(userId)) || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function saveSubjects(userId: string, subjects: Subject[]) {
  try {
    localStorage.setItem(subjectsKey(userId), JSON.stringify(subjects));
  } catch {
    // хранилище недоступно
  }
}

/** Предметы из аккаунта; null — база не подключена. */
export async function fetchServerSubjects(): Promise<Subject[] | null> {
  const res = await authFetch("/api/subjects");
  if (!res.ok) throw new Error(await readError(res));
  const data = await res.json();
  return data.enabled ? (data.subjects as Subject[]) : null;
}

export async function pushSubjects(subjects: Subject[]) {
  const res = await authFetch("/api/subjects", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subjects }) });
  if (!res.ok) throw new Error(await readError(res));
}

/** Подпись дня для списка: «Сб, 24 окт.», «Сегодня», «Вчера». */
export function dayLabel(ts: number) {
  const d = new Date(ts);
  const today = new Date();
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(today) - start(d)) / 86400000);
  if (diff === 0) return "Сегодня";
  if (diff === 1) return "Вчера";
  const s = d.toLocaleDateString("ru-RU", { weekday: "short", day: "numeric", month: "short", ...(d.getFullYear() !== today.getFullYear() ? { year: "numeric" } : {}) });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Откуда конспект: для подписи в списке. */
export function sourceLabel(source: string) {
  if (source === "запись диктофона") return "🎙️ Запись";
  if (source === "текст") return "✍️ Текст";
  if (/^https?:\/\//.test(source)) return "🔗 Ссылка";
  return "📄 Файл";
}

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
  /** Переводы конспекта: язык → текст. */
  translations?: Record<string, string>;
  /** Язык, на котором конспект сейчас показан; пусто — оригинал. */
  lang?: string;
  /** Предмет (папка), в которой лежит конспект. */
  subjectId?: string;
  /** Переписка с нейросетью по этому конспекту. */
  chat?: ChatMessage[];
  /** Презентация по конспекту. */
  slides?: Slide[];
  /** Сценарий подкаста: реплики двух ведущих. */
  podcast?: PodcastLine[];
  /** Вопросы для учебной игры. */
  game?: GameItem[];
  /** Рекорд в игре. */
  gameBest?: number;
  /**
   * Конспект ещё не дописан (страница закрылась или пропала связь): пожелания и исходный
   * текст, по которым его можно дописать. Для записей текстом служит расшифровка.
   */
  pending?: { wishes: string; text?: string };
  /** Лучший результат теста, в процентах. */
  quizBest?: number;
  /** Сколько карточек отмечено как выученные (лучший результат). */
  cardsKnown?: number;
  /** Когда конспект меняли в последний раз: нужно, чтобы понять, какая копия свежее. */
  updatedAt?: number;
  /** Копия уже есть в аккаунте. Если такого конспекта на сервере нет, значит его удалили с другого устройства. */
  synced?: boolean;
};

const COLORS = ["#3b7bff", "#8b5cf6", "#ec4899", "#f97316", "#10b981", "#06b6d4", "#eab308", "#ef4444"];

/** Постоянный цвет конспекта: по id, чтобы не менялся между заходами. */
export function noteColor(id: string) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length];
}

const EMOJI_RE = /^\p{Extended_Pictographic}(\uFE0F|\u200D\p{Extended_Pictographic})*/u;

/** Эмодзи из начала заголовка (их ставит нейросеть) и заголовок без него. */
export function splitTitle(title: string): { emoji: string; text: string } {
  const m = title.match(EMOJI_RE);
  return m ? { emoji: m[0], text: title.slice(m[0].length).trim() } : { emoji: "📘", text: title };
}

/** Прогресс по конспекту от 0 до 100: среднее по тесту и карточкам, если они есть. */
export function noteProgress(n: Note): number | null {
  const parts: number[] = [];
  if (n.quizBest !== undefined) parts.push(n.quizBest);
  if (n.flashcards?.length && n.cardsKnown !== undefined) parts.push(Math.round((n.cardsKnown / n.flashcards.length) * 100));
  return parts.length ? Math.round(parts.reduce((a, b) => a + b, 0) / parts.length) : null;
}

// Конспекты, сделанные до входа по логину, лежали в общем ключе; они переезжают к первому, кто войдёт.
const LEGACY_KEY = "konspektor.notes.v1";
const keyFor = (userId: string) => `konspektor.notes.${userId}`;

function read(key: string): Note[] {
  try {
    const v = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/** Копия конспектов пользователя в этом браузере. */
export function loadNotes(userId: string): Note[] {
  const own = read(keyFor(userId));
  const legacy = read(LEGACY_KEY);
  if (!legacy.length) return own;
  const merged = mergeNotes(own, legacy);
  saveNotes(userId, merged);
  try {
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    // не получилось — перенесём в следующий раз
  }
  return merged;
}

/** Сохраняет конспекты в браузере; false — не хватило места. */
export function saveNotes(userId: string, notes: Note[]) {
  try {
    localStorage.setItem(keyFor(userId), JSON.stringify(notes));
    return true;
  } catch {
    return false;
  }
}

const stamp = (n: Note) => n.updatedAt ?? n.createdAt;

/** Объединяет два списка: для одинаковых id берётся более свежая копия. */
export function mergeNotes(a: Note[], b: Note[]): Note[] {
  const byId = new Map(a.map((n) => [n.id, n]));
  for (const n of b) {
    const had = byId.get(n.id);
    if (!had || stamp(n) > stamp(had)) byId.set(n.id, n);
  }
  return [...byId.values()].sort((x, y) => y.createdAt - x.createdAt);
}

/** Конспекты из аккаунта; null — хранилище на сервере не подключено. */
export async function fetchServerNotes(): Promise<Note[] | null> {
  const res = await authFetch("/api/notes");
  if (!res.ok) throw new Error(await readError(res));
  const data = await res.json();
  return data.enabled ? (data.notes as Note[]).map((n) => ({ ...n, synced: true })) : null;
}

/** Отправляет конспекты на сервер пачками, чтобы не упереться в размер запроса. */
export async function pushNotes(notes: Note[]) {
  let batch: Note[] = [];
  let size = 0;
  const send = async () => {
    if (!batch.length) return;
    const res = await authFetch("/api/notes", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notes: batch }) });
    if (!res.ok) throw new Error(await readError(res));
    batch = [];
    size = 0;
  };
  for (const n of notes) {
    const len = JSON.stringify(n).length;
    if (size + len > 2_500_000) await send();
    batch.push(n);
    size += len;
  }
  await send();
}

export async function deleteServerNotes(ids: string[]) {
  if (!ids.length) return;
  const res = await authFetch("/api/notes", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }) });
  if (!res.ok) throw new Error(await readError(res));
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
  const res = await authFetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export async function postForm<T>(url: string, file: Blob, name: string): Promise<T> {
  const form = new FormData();
  form.append("file", file, name);
  const res = await authFetch(url, { method: "POST", body: form });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

/** POST и чтение потокового текстового ответа; onChunk получает весь накопленный текст. */
export async function postStream(url: string, body: unknown, onChunk: (text: string) => void): Promise<string> {
  const res = await authFetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
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

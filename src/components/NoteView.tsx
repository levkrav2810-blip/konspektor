"use client";

import { useState } from "react";
import Markdown from "./Markdown";
import Flashcards from "./Flashcards";
import Quiz from "./Quiz";
import { downloadText, noteColor, noteProgress, postJson, postStream, splitTitle, type Flashcard, type Note, type QuizQuestion } from "@/lib/client";

const LANGUAGES = ["English", "Русский", "Українська", "Deutsch", "Français", "Español", "Italiano", "Português", "Polski", "Türkçe", "中文", "日本語", "한국어", "العربية", "Қазақша", "O‘zbekcha"];

const ACTIONS = [
  { id: "simplify", label: "Объяснить проще" },
  { id: "short", label: "Шпаргалка" },
  { id: "mindmap", label: "Интеллект-карта" },
  { id: "plan", label: "План ответа" },
];

type View = "summary" | "cards" | "quiz" | "transcript" | string;

export default function NoteView({ note, onChange, onRemove }: { note: Note; onChange: (n: Note) => void; onRemove?: () => void }) {
  const [view, setView] = useState<View>("summary");
  const [loading, setLoading] = useState<string | null>(null);
  const [streaming, setStreaming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [translating, setTranslating] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Конспект на выбранном языке; карточки, тест и остальное делаются из него же.
  const lang = note.lang || "";
  const summary = (lang && note.translations?.[lang]) || note.summary;

  /** Переключает язык конспекта сразу: готовый перевод показывается мгновенно, новый пишется на глазах. */
  async function changeLanguage(next: string) {
    setView("summary");
    if (!next || note.translations?.[next]) {
      onChange({ ...note, lang: next });
      return;
    }
    setTranslating(next);
    setStreaming("");
    await run("translate", async () => {
      const content = await postStream("/api/transform", { summary: note.summary, kind: "translate", language: next }, setStreaming);
      onChange({ ...note, lang: next, translations: { ...note.translations, [next]: content } });
    });
    setStreaming(null);
    setTranslating(null);
  }

  async function makeCards() {
    setView("cards");
    if (note.flashcards?.length) return;
    await run("cards", async () => {
      const { cards } = await postJson<{ cards: Flashcard[] }>("/api/flashcards", { summary });
      onChange({ ...note, flashcards: cards });
    });
  }

  async function makeQuiz(force = false) {
    setView("quiz");
    if (note.quiz?.length && !force) return;
    await run("quiz", async () => {
      const { questions } = await postJson<{ questions: QuizQuestion[] }>("/api/quiz", { summary });
      onChange({ ...note, quiz: questions, quizBest: undefined });
    });
  }

  async function transform(kind: string, label: string) {
    const id = `${kind}-${crypto.randomUUID()}`;
    setView(id);
    await run(id, async () => {
      const content = await postStream("/api/transform", { summary, kind }, setStreaming);
      onChange({ ...note, extras: [...(note.extras || []), { id, label, content }] });
    });
    setStreaming(null);
  }

  async function run(key: string, fn: () => Promise<void>) {
    setError(null);
    setLoading(key);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(null);
    }
  }

  const extra = note.extras?.find((x) => x.id === view);
  const currentText = view === "summary" ? summary : view === "transcript" ? note.transcript || "" : extra?.content || "";

  async function copy() {
    await navigator.clipboard.writeText(currentText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const tabs: { id: View; label: string; onClick: () => void }[] = [
    { id: "summary", label: "📝 Конспект", onClick: () => setView("summary") },
    { id: "cards", label: "🃏 Карточки", onClick: makeCards },
    { id: "quiz", label: "✅ Тест", onClick: () => makeQuiz() },
    ...(note.extras || []).map((x) => ({ id: x.id, label: x.label, onClick: () => setView(x.id) })),
    ...(note.transcript ? [{ id: "transcript", label: "🎧 Расшифровка", onClick: () => setView("transcript") }] : []),
  ];
  if (loading && loading.includes("-") && !extra) tabs.push({ id: loading, label: "…", onClick: () => {} });

  const { emoji, text: titleText } = splitTitle(note.title);
  const progress = noteProgress(note);

  return (
    <div className="flex flex-col gap-4">
      <div className="no-print card fade-up relative overflow-hidden p-5 sm:p-6" style={{ ["--c" as string]: noteColor(note.id), background: "linear-gradient(120deg, color-mix(in srgb, var(--c) 22%, var(--surface)), var(--surface) 70%)" }}>
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-3xl" style={{ background: "color-mix(in srgb, var(--c) 25%, transparent)" }}>{emoji}</div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold leading-tight sm:text-2xl">{titleText}</h1>
            <div className="mt-1 truncate text-sm text-muted">
              {new Date(note.createdAt).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })} · {note.source}
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium">
              {note.flashcards?.length ? <span className="badge">🃏 {note.cardsKnown ?? 0}/{note.flashcards.length} карточек</span> : null}
              {note.quiz?.length ? <span className="badge">✅ Тест: {note.quizBest !== undefined ? `${note.quizBest}%` : "не пройден"}</span> : null}
              {progress !== null && <span className="badge">📈 Прогресс {progress}%</span>}
              {!note.flashcards?.length && !note.quiz?.length && <span className="badge">✨ Сделайте карточки и тест, чтобы видеть прогресс</span>}
            </div>
          </div>
        </div>
        {progress !== null && <div className="progress mt-4" style={{ ["--accent" as string]: "var(--c)" }}><div style={{ width: `${progress}%` }} /></div>}
      </div>

      <div className="no-print flex flex-col-reverse gap-2 border-b border-line sm:flex-row sm:items-end">
        <div className="-mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          {tabs.map((t) => (
            <button key={t.id} type="button" onClick={t.onClick} disabled={!!loading && t.id !== view} className={`tab ${view === t.id ? "tab-active" : ""}`}>
              {t.label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 pb-2 text-sm text-muted sm:ml-auto">
          🌍
          <select
            value={translating ?? lang}
            onChange={(e) => changeLanguage(e.target.value)}
            disabled={!!loading}
            aria-label="Язык конспекта"
            className="input !w-auto !rounded-lg !py-1.5 text-sm text-foreground"
          >
            <option value="">Язык оригинала</option>
            {LANGUAGES.map((l) => <option key={l} value={l}>{l}{note.translations?.[l] ? " ✓" : ""}</option>)}
          </select>
        </label>
      </div>

      <div className="no-print -mx-4 flex items-center gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
        <span className="mr-1 shrink-0 text-sm text-muted">Сделать из конспекта:</span>
        {ACTIONS.map((a) => (
          <button key={a.id} type="button" onClick={() => transform(a.id, a.label)} disabled={!!loading} className="btn-chip shrink-0">{a.label}</button>
        ))}
      </div>

      {error && <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">{error}</div>}

      <div className="min-h-[300px]">
        {view === "summary" && translating && (
          <div className="card p-4 sm:p-8">
            <div className="mb-4 flex items-center gap-2 text-sm text-accent"><span className="h-2 w-2 animate-pulse rounded-full bg-accent" />Перевожу на {translating}…</div>
            {streaming ? <Markdown>{streaming}</Markdown> : <p className="text-muted">Начинаю перевод…</p>}
          </div>
        )}
        {((view === "summary" && !translating) || view === "transcript" || extra) && (
          <div className="card p-4 sm:p-8">
            <div className="no-print -mt-2 mb-4 flex flex-wrap justify-end gap-1">
              <button type="button" onClick={copy} className="btn-ghost">{copied ? "Скопировано ✓" : "Копировать"}</button>
              <button type="button" onClick={() => downloadText(`${note.title}.md`, currentText)} className="btn-ghost">Скачать .md</button>
              <button type="button" onClick={() => window.print()} className="btn-ghost">PDF / печать</button>
              {onRemove && view === "summary" && <button type="button" onClick={onRemove} className="btn-ghost hover:!text-red-500">Удалить</button>}
            </div>
            {view === "transcript" ? <p className="whitespace-pre-wrap leading-relaxed">{currentText}</p> : <Markdown>{currentText}</Markdown>}
          </div>
        )}
        {loading === view && streaming !== null && !extra && (
          <div className="card p-4 sm:p-8"><Markdown>{streaming}</Markdown></div>
        )}
        {loading === view && streaming === null && <Spinner text={view === "cards" ? "Делаю карточки…" : view === "quiz" ? "Составляю тест…" : "Готовлю…"} />}
        {view === "cards" && note.flashcards && loading !== "cards" && <Flashcards cards={note.flashcards} best={note.cardsKnown} onKnown={(k) => k > (note.cardsKnown ?? 0) && onChange({ ...note, cardsKnown: k })} />}
        {view === "quiz" && note.quiz && loading !== "quiz" && <Quiz key={note.quiz.length + note.quiz[0]?.question} questions={note.quiz} onRetry={() => makeQuiz(true)} onScore={(p) => p > (note.quizBest ?? -1) && onChange({ ...note, quizBest: p })} />}
      </div>
    </div>
  );
}

export function Spinner({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-accent/20 border-t-accent" />
      <div>{text}</div>
    </div>
  );
}

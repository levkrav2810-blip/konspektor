"use client";

import { useState } from "react";
import Markdown from "./Markdown";
import Flashcards from "./Flashcards";
import Quiz from "./Quiz";
import { downloadText, postJson, postStream, type Flashcard, type Note, type QuizQuestion } from "@/lib/client";

const LANGUAGES = ["English", "Русский", "Українська", "Deutsch", "Français", "Español", "Italiano", "Português", "Polski", "Türkçe", "中文", "日本語", "한국어", "العربية", "Қазақша", "O‘zbekcha"];

const ACTIONS = [
  { id: "simplify", label: "Объяснить проще" },
  { id: "short", label: "Шпаргалка" },
  { id: "mindmap", label: "Интеллект-карта" },
  { id: "plan", label: "План ответа" },
];

type View = "summary" | "cards" | "quiz" | "transcript" | string;

export default function NoteView({ note, onChange }: { note: Note; onChange: (n: Note) => void }) {
  const [view, setView] = useState<View>("summary");
  const [loading, setLoading] = useState<string | null>(null);
  const [streaming, setStreaming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [language, setLanguage] = useState("English");
  const [copied, setCopied] = useState(false);

  async function makeCards() {
    setView("cards");
    if (note.flashcards?.length) return;
    await run("cards", async () => {
      const { cards } = await postJson<{ cards: Flashcard[] }>("/api/flashcards", { summary: note.summary });
      onChange({ ...note, flashcards: cards });
    });
  }

  async function makeQuiz(force = false) {
    setView("quiz");
    if (note.quiz?.length && !force) return;
    await run("quiz", async () => {
      const { questions } = await postJson<{ questions: QuizQuestion[] }>("/api/quiz", { summary: note.summary });
      onChange({ ...note, quiz: questions });
    });
  }

  async function transform(kind: string, label: string) {
    const id = `${kind}-${crypto.randomUUID()}`;
    setView(id);
    await run(id, async () => {
      const content = await postStream("/api/transform", { summary: note.summary, kind, language }, setStreaming);
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
  const currentText = view === "summary" ? note.summary : view === "transcript" ? note.transcript || "" : extra?.content || "";

  async function copy() {
    await navigator.clipboard.writeText(currentText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const tabs: { id: View; label: string }[] = [
    { id: "summary", label: "📝 Конспект" },
    { id: "cards", label: "🃏 Карточки" },
    { id: "quiz", label: "✅ Тест" },
    ...(note.extras || []).map((x) => ({ id: x.id, label: x.label })),
    ...(note.transcript ? [{ id: "transcript", label: "🎧 Расшифровка" }] : []),
  ];
  if (loading && loading.includes("-") && !extra) tabs.push({ id: loading, label: "…" });

  return (
    <div className="flex flex-col gap-4">
      <div className="card flex flex-wrap items-center gap-2 p-3">
        <button type="button" onClick={makeCards} disabled={!!loading} className="btn-chip">🃏 Карточки</button>
        <button type="button" onClick={() => makeQuiz()} disabled={!!loading} className="btn-chip">✅ Тест</button>
        {ACTIONS.map((a) => (
          <button key={a.id} type="button" onClick={() => transform(a.id, a.label)} disabled={!!loading} className="btn-chip">{a.label}</button>
        ))}
        <div className="flex items-center gap-1.5">
          <select value={language} onChange={(e) => setLanguage(e.target.value)} className="input !w-auto !py-1.5 text-sm">
            {LANGUAGES.map((l) => <option key={l}>{l}</option>)}
          </select>
          <button type="button" onClick={() => transform("translate", `🌍 ${language}`)} disabled={!!loading} className="btn-chip">Перевести</button>
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-line">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setView(t.id)}
            className={`whitespace-nowrap px-3.5 py-2 text-sm font-medium transition ${view === t.id ? "border-b-2 border-accent text-accent" : "text-muted hover:text-foreground"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">{error}</div>}

      <div className="min-h-[300px]">
        {(view === "summary" || view === "transcript" || extra) && (
          <div className="card p-6 sm:p-8">
            <div className="mb-4 flex justify-end gap-2">
              <button type="button" onClick={copy} className="btn-ghost">{copied ? "Скопировано ✓" : "Копировать"}</button>
              <button type="button" onClick={() => downloadText(`${note.title}.md`, currentText)} className="btn-ghost">Скачать .md</button>
              <button type="button" onClick={() => window.print()} className="btn-ghost">PDF / печать</button>
            </div>
            {view === "transcript" ? <p className="whitespace-pre-wrap leading-relaxed">{currentText}</p> : <Markdown>{currentText}</Markdown>}
          </div>
        )}
        {loading === view && streaming !== null && !extra && (
          <div className="card p-6 sm:p-8"><Markdown>{streaming}</Markdown></div>
        )}
        {loading === view && streaming === null && <Spinner text={view === "cards" ? "Делаю карточки…" : view === "quiz" ? "Составляю тест…" : "Готовлю…"} />}
        {view === "cards" && note.flashcards && loading !== "cards" && <Flashcards cards={note.flashcards} />}
        {view === "quiz" && note.quiz && loading !== "quiz" && <Quiz key={note.quiz.length + note.quiz[0]?.question} questions={note.quiz} onRetry={() => makeQuiz(true)} />}
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

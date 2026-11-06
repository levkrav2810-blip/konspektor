"use client";

import { useState } from "react";
import Markdown from "./Markdown";
import Flashcards from "./Flashcards";
import Quiz from "./Quiz";
import ChatPanel from "./ChatPanel";
import Icon from "./Icon";
import { downloadText, noteColor, noteProgress, postJson, postStream, splitTitle, type Flashcard, type Note, type QuizQuestion, type Subject } from "@/lib/client";

const LANGUAGES = ["English", "Русский", "Українська", "Deutsch", "Français", "Español", "Italiano", "Português", "Polski", "Türkçe", "中文", "日本語", "한국어", "العربية", "Қазақша", "O‘zbekcha"];

/** Изменение конспекта: поля или функция от самой свежей версии (ответы нейросети приходят не сразу). */
export type NotePatch = Partial<Note> | ((n: Note) => Partial<Note>);

const TRANSFORMS = [
  { id: "simplify", label: "Объяснить проще", icon: "🧒" },
  { id: "short", label: "Шпаргалка", icon: "📋" },
  { id: "mindmap", label: "Интеллект-карта", icon: "🗺️" },
  { id: "plan", label: "План ответа", icon: "🎤" },
];

type View = "summary" | "cards" | "quiz" | "transcript" | string;

export default function NoteView({
  note,
  subjects,
  onPatch,
  onRemove,
  onHome,
  onSubject,
}: {
  note: Note;
  subjects: Subject[];
  onPatch: (p: NotePatch) => void;
  onRemove: () => void;
  onHome: () => void;
  onSubject: (id: string) => void;
}) {
  const [view, setView] = useState<View>("summary");
  const [loading, setLoading] = useState<string | null>(null);
  const [streaming, setStreaming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [translating, setTranslating] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  // Конспект на выбранном языке; карточки, тест и остальное делаются из него же.
  const lang = note.lang || "";
  const summary = (lang && note.translations?.[lang]) || note.summary;
  const subject = subjects.find((s) => s.id === note.subjectId);
  const { emoji, text: titleText } = splitTitle(note.title);
  const progress = noteProgress(note);

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

  /** Переключает язык конспекта: готовый перевод показывается мгновенно, новый пишется на глазах. */
  async function changeLanguage(next: string) {
    setView("summary");
    if (!next || note.translations?.[next]) {
      onPatch({ lang: next });
      return;
    }
    setTranslating(next);
    setStreaming("");
    await run("translate", async () => {
      const content = await postStream("/api/transform", { summary: note.summary, kind: "translate", language: next }, setStreaming);
      onPatch((n) => ({ lang: next, translations: { ...n.translations, [next]: content } }));
    });
    setStreaming(null);
    setTranslating(null);
  }

  async function makeCards() {
    setView("cards");
    if (note.flashcards?.length) return;
    await run("cards", async () => {
      const { cards } = await postJson<{ cards: Flashcard[] }>("/api/flashcards", { summary });
      onPatch({ flashcards: cards, cardsKnown: undefined });
    });
  }

  async function makeQuiz(force = false) {
    setView("quiz");
    if (note.quiz?.length && !force) return;
    await run("quiz", async () => {
      const { questions } = await postJson<{ questions: QuizQuestion[] }>("/api/quiz", { summary });
      onPatch({ quiz: questions, quizBest: undefined });
    });
  }

  /** Открывает готовую переработку (шпаргалку и т. п.) или делает новую. */
  async function transform(kind: string, label: string, force = false) {
    const existing = note.extras?.find((x) => x.id.startsWith(`${kind}-`));
    if (existing && !force) return setView(existing.id);
    const id = `${kind}-${crypto.randomUUID()}`;
    setView(id);
    setStreaming("");
    await run(id, async () => {
      const content = await postStream("/api/transform", { summary, kind }, setStreaming);
      onPatch((n) => ({ extras: [...(n.extras || []).filter((x) => !x.id.startsWith(`${kind}-`)), { id, label, content }] }));
    });
    setStreaming(null);
  }

  const extra = note.extras?.find((x) => x.id === view);
  const currentText = view === "summary" ? summary : view === "transcript" ? note.transcript || "" : extra?.content || "";

  async function copy() {
    await navigator.clipboard.writeText(currentText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const tiles: { key: string; icon: string; label: string; hint?: string; onClick: () => void; wide?: boolean }[] = [
    { key: "quiz", icon: "✅", label: "Пройти тест", hint: note.quizBest !== undefined ? `Лучший результат ${note.quizBest}%` : note.quiz?.length ? `${note.quiz.length} вопросов` : undefined, onClick: () => makeQuiz() },
    { key: "cards", icon: "🃏", label: "Учить флеш-карточки", hint: note.flashcards?.length ? `Выучено ${note.cardsKnown ?? 0} из ${note.flashcards.length}` : undefined, onClick: makeCards },
    ...TRANSFORMS.map((t) => ({
      key: t.id,
      icon: t.icon,
      label: t.label,
      hint: note.extras?.some((x) => x.id.startsWith(`${t.id}-`)) ? "Готово" : undefined,
      onClick: () => transform(t.id, t.label),
    })),
  ];

  const viewTitle =
    view === "cards" ? "🃏 Флеш-карточки" : view === "quiz" ? "✅ Тест" : view === "transcript" ? "📄 Расшифровка" : extra ? extra.label : TRANSFORMS.find((t) => view.startsWith(`${t.id}-`))?.label;

  return (
    <div className="flex gap-6">
      <div className="min-w-0 flex-1">
        <nav className="no-print mb-4 flex flex-wrap items-center gap-1.5 text-sm text-muted">
          <button type="button" onClick={onHome} className="hover:text-foreground">Главная</button>
          <Icon name="chevron" className="h-3.5 w-3.5" />
          {subject && (
            <>
              <button type="button" onClick={() => onSubject(subject.id)} className="hover:text-foreground">{subject.name}</button>
              <Icon name="chevron" className="h-3.5 w-3.5" />
            </>
          )}
          <span className="text-foreground">Конспект</span>
        </nav>

        <h1 className="flex items-start gap-3 text-2xl font-bold leading-tight sm:text-3xl">
          <span>{emoji}</span>
          <span className="min-w-0">{titleText}</span>
        </h1>

        <div className="no-print mt-4 flex flex-wrap items-center gap-2 text-sm">
          <label className="relative inline-flex cursor-pointer items-center gap-2 rounded-full border border-line bg-surface py-1.5 pl-3 pr-3 transition hover:border-accent/60">
            {subject ? <span className="h-2.5 w-2.5 rounded-full" style={{ background: subject.color }} /> : <Icon name="folder" className="h-4 w-4 text-muted" />}
            <span>{subject ? subject.name : "В предмет"}</span>
            <select
              value={note.subjectId ?? ""}
              onChange={(e) => onPatch({ subjectId: e.target.value || undefined })}
              className="absolute inset-0 cursor-pointer opacity-0"
              aria-label="Предмет"
            >
              <option value="">Без предмета</option>
              {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <span className="text-muted">{new Date(note.createdAt).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
          <label className="ml-auto inline-flex items-center gap-1.5 text-muted">
            🌍
            <select
              value={translating ?? lang}
              onChange={(e) => changeLanguage(e.target.value)}
              disabled={!!loading}
              aria-label="Язык конспекта"
              className="input !w-auto !rounded-full !py-1.5 text-sm text-foreground"
            >
              <option value="">Язык оригинала</option>
              {LANGUAGES.map((l) => <option key={l} value={l}>{l}{note.translations?.[l] ? " ✓" : ""}</option>)}
            </select>
          </label>
        </div>
        {subjects.length === 0 && !note.subjectId && (
          <p className="no-print mt-2 text-xs text-muted">Чтобы разложить конспекты по папкам, создайте предмет на главной во вкладке «Предметы».</p>
        )}

        {progress !== null && (
          <div className="no-print mt-4 flex items-center gap-3">
            <div className="progress flex-1" style={{ ["--accent" as string]: noteColor(note.id) }}><div style={{ width: `${progress}%` }} /></div>
            <span className="text-sm font-medium text-muted">Прогресс {progress}%</span>
          </div>
        )}

        {error && <div className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">{error}</div>}

        {view === "summary" ? (
          <>
            {note.transcript && (
              <button type="button" onClick={() => setView("transcript")} className="tile no-print mt-6 sm:w-1/2">
                <span className="tile-icon">📄</span>
                <span className="flex-1 font-semibold text-accent">Показать расшифровку</span>
                <Icon name="chevron" className="h-5 w-5 text-muted" />
              </button>
            )}
            <div className="no-print mt-6 border-t border-line pt-6">
              <div className="grid gap-3 sm:grid-cols-2">
                {tiles.map((t) => (
                  <button key={t.key} type="button" onClick={t.onClick} disabled={!!loading} className="tile">
                    <span className="tile-icon">{t.icon}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-accent">{t.label}</span>
                      {t.hint && <span className="block text-xs text-muted">{t.hint}</span>}
                    </span>
                    <Icon name="chevron" className="h-5 w-5 text-muted" />
                  </button>
                ))}
              </div>
            </div>

            <section className="mt-8">
              <div className="no-print mb-2 flex flex-wrap items-center justify-end gap-1">
                <button type="button" onClick={copy} className="btn-ghost">{copied ? "Скопировано ✓" : "Копировать"}</button>
                <button type="button" onClick={() => downloadText(`${note.title}.md`, currentText)} className="btn-ghost">Скачать .md</button>
                <button type="button" onClick={() => window.print()} className="btn-ghost">PDF / печать</button>
                <button type="button" onClick={onRemove} className="btn-ghost hover:!text-red-500">Удалить</button>
              </div>
              <div className="card p-4 sm:p-8">
                {translating ? (
                  <>
                    <div className="mb-4 flex items-center gap-2 text-sm text-accent"><span className="h-2 w-2 animate-pulse rounded-full bg-accent" />Перевожу на {translating}…</div>
                    {streaming ? <Markdown>{streaming}</Markdown> : <p className="text-muted">Начинаю перевод…</p>}
                  </>
                ) : (
                  <Markdown>{summary}</Markdown>
                )}
              </div>
            </section>
          </>
        ) : (
          <section className="mt-6">
            <div className="no-print mb-4 flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => setView("summary")} className="btn-secondary flex items-center gap-1 !py-2 text-sm">
                <Icon name="back" className="h-4 w-4" />К конспекту
              </button>
              <h2 className="text-lg font-semibold">{viewTitle}</h2>
              <div className="ml-auto flex gap-1">
                {(view === "transcript" || extra) && (
                  <>
                    <button type="button" onClick={copy} className="btn-ghost">{copied ? "Скопировано ✓" : "Копировать"}</button>
                    <button type="button" onClick={() => downloadText(`${note.title}.md`, currentText)} className="btn-ghost">Скачать .md</button>
                  </>
                )}
                {extra && (
                  <button type="button" onClick={() => transform(extra.id.split("-")[0], extra.label, true)} disabled={!!loading} className="btn-ghost">Сделать заново</button>
                )}
              </div>
            </div>

            {(view === "transcript" || extra) && (
              <div className="card p-4 sm:p-8">
                {view === "transcript" ? <p className="whitespace-pre-wrap leading-relaxed">{currentText}</p> : <Markdown>{currentText}</Markdown>}
              </div>
            )}
            {loading === view && streaming !== null && !extra && (
              <div className="card p-4 sm:p-8">{streaming ? <Markdown>{streaming}</Markdown> : <Spinner text="Готовлю…" />}</div>
            )}
            {loading === view && streaming === null && <Spinner text={view === "cards" ? "Делаю карточки…" : view === "quiz" ? "Составляю тест…" : "Готовлю…"} />}
            {view === "cards" && note.flashcards && loading !== "cards" && (
              <Flashcards cards={note.flashcards} best={note.cardsKnown} onKnown={(k) => onPatch((n) => (k > (n.cardsKnown ?? 0) ? { cardsKnown: k } : {}))} />
            )}
            {view === "quiz" && note.quiz && loading !== "quiz" && (
              <Quiz
                key={note.quiz.length + note.quiz[0]?.question}
                questions={note.quiz}
                onRetry={() => makeQuiz(true)}
                onScore={(p) => onPatch((n) => (p > (n.quizBest ?? -1) ? { quizBest: p } : {}))}
              />
            )}
          </section>
        )}
      </div>

      {/* Чат: колонка справа на широком экране, выезжающая панель на телефоне */}
      <aside className="no-print sticky top-20 hidden h-[calc(100vh-6.5rem)] w-[360px] shrink-0 overflow-hidden rounded-2xl border border-line bg-surface shadow-sm xl:block">
        <ChatPanel note={note} summary={summary} onPatch={onPatch} />
      </aside>
      <button
        type="button"
        onClick={() => setChatOpen(true)}
        className="no-print fixed bottom-5 right-5 z-20 flex items-center gap-2 rounded-full bg-gradient-to-r from-accent to-violet-500 px-5 py-3.5 font-semibold text-white shadow-xl transition hover:brightness-110 xl:hidden"
      >
        <Icon name="chat" className="h-5 w-5" />Спросить нейросеть
      </button>
      {chatOpen && (
        <div className="no-print fixed inset-0 z-40 flex flex-col bg-black/50 backdrop-blur-sm xl:hidden" onClick={() => setChatOpen(false)}>
          <div className="pop-in mt-auto h-[85vh] overflow-hidden rounded-t-3xl border-t border-line bg-surface sm:mx-auto sm:mb-6 sm:h-[75vh] sm:w-[480px] sm:rounded-3xl sm:border" onClick={(e) => e.stopPropagation()}>
            <ChatPanel note={note} summary={summary} onPatch={onPatch} onClose={() => setChatOpen(false)} />
          </div>
        </div>
      )}
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

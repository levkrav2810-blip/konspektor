"use client";

import { useEffect, useState } from "react";
import InputPanel, { type Material } from "@/components/InputPanel";
import NoteView, { Spinner } from "@/components/NoteView";
import Markdown from "@/components/Markdown";
import { fileToBase64, loadNotes, postForm, postJson, postStream, saveNotes, titleFromMarkdown, type Note } from "@/lib/client";
import { audioToChunks, transcribeChunks } from "@/lib/audio";

type SummarizeBody = { text?: string; file?: { base64: string; mediaType: string; name?: string } };

const TEXT_EXT = /\.(txt|md|srt|vtt|csv|json)$/i;
const MAX_MEDIA_MB = 300;

export default function Home() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [stage, setStage] = useState<string | null>(null);
  const [draft, setDraft] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  // История хранится в localStorage, поэтому читаем её только в браузере после гидрации.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setNotes(loadNotes()), []);

  function persist(next: Note[]) {
    setNotes(next);
    saveNotes(next);
  }

  function updateNote(n: Note) {
    persist(notes.map((x) => (x.id === n.id ? n : x)));
  }

  async function transcribe(blob: Blob) {
    if (blob.size > MAX_MEDIA_MB * 1024 * 1024) {
      throw new Error(`Файл больше ${MAX_MEDIA_MB} МБ. Сохраните из видео только звук (mp3 или m4a) и загрузите его.`);
    }
    setStage("Готовлю запись…");
    const chunks = await audioToChunks(blob);
    setStage("Распознаю речь…");
    const text = await transcribeChunks(chunks, (done, total) => setStage(`Распознаю речь… ${Math.round((done / total) * 100)}%`));
    if (!text) throw new Error("В записи не удалось распознать речь");
    return text;
  }

  async function prepare(m: Material): Promise<{ body: SummarizeBody; transcript?: string }> {
    if (m.kind === "text") return { body: { text: m.text } };
    if (m.kind === "audio") {
      const transcript = await transcribe(m.blob);
      return { body: { text: transcript }, transcript };
    }
    if (m.kind === "link") {
      setStage("Открываю ссылку…");
      const res = await postJson<SummarizeBody & { title?: string }>("/api/link", { url: m.url });
      return { body: { text: res.text, file: res.file }, transcript: res.text };
    }
    const f = m.file;
    if (f.type.startsWith("audio/") || f.type.startsWith("video/")) {
      const transcript = await transcribe(f);
      return { body: { text: transcript }, transcript };
    }
    if (f.type === "application/pdf" || f.type.startsWith("image/")) {
      setStage("Читаю файл…");
      return { body: { file: { base64: await fileToBase64(f), mediaType: f.type, name: f.name } } };
    }
    if (f.name.toLowerCase().endsWith(".docx")) {
      setStage("Читаю документ…");
      const { text } = await postForm<{ text: string }>("/api/extract", f, f.name);
      return { body: { text } };
    }
    if (f.type.startsWith("text/") || TEXT_EXT.test(f.name)) return { body: { text: await f.text() } };
    throw new Error("Этот формат пока не поддерживается. Попробуйте PDF, Word, TXT, аудио или видео.");
  }

  async function handle(m: Material, wishes: string) {
    setError(null);
    setDraft("");
    setCurrentId(null);
    try {
      const { body, transcript } = await prepare(m);
      setStage("Пишу конспект…");
      const summary = await postStream("/api/summarize", { ...body, source: m.source, wishes }, setDraft);
      const note: Note = {
        id: crypto.randomUUID(),
        title: titleFromMarkdown(summary, m.source),
        createdAt: Date.now(),
        source: m.source,
        summary,
        transcript,
      };
      persist([note, ...notes]);
      setCurrentId(note.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setStage(null);
    }
  }

  function remove(id: string) {
    persist(notes.filter((n) => n.id !== id));
    if (currentId === id) setCurrentId(null);
  }

  const current = notes.find((n) => n.id === currentId) || null;

  return (
    <div className="flex min-h-screen">
      <aside className={`no-print fixed inset-y-0 left-0 z-30 w-72 transform border-r border-line bg-surface p-4 transition md:static md:translate-x-0 ${menuOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <button type="button" onClick={() => { setCurrentId(null); setMenuOpen(false); }} className="btn-primary mb-5 w-full">+ Новый конспект</button>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Мои конспекты</div>
        {notes.length === 0 && <p className="text-sm text-muted">Здесь появятся ваши конспекты.</p>}
        <ul className="flex flex-col gap-1">
          {notes.map((n) => (
            <li key={n.id} className={`group flex items-center rounded-lg ${n.id === currentId ? "bg-accent/10" : "hover:bg-foreground/5"}`}>
              <button type="button" onClick={() => { setCurrentId(n.id); setMenuOpen(false); }} className="flex-1 truncate px-3 py-2 text-left text-sm">
                {n.title}
                <div className="text-xs text-muted">{new Date(n.createdAt).toLocaleDateString("ru-RU")}</div>
              </button>
              <button type="button" onClick={() => remove(n.id)} className="px-2 text-muted opacity-0 hover:text-red-500 group-hover:opacity-100" aria-label="Удалить">×</button>
            </li>
          ))}
        </ul>
      </aside>
      {menuOpen && <div className="fixed inset-0 z-20 bg-black/30 md:hidden" onClick={() => setMenuOpen(false)} />}

      <main className="min-w-0 flex-1">
        <header className="no-print sticky top-0 z-10 flex items-center gap-3 border-b border-line bg-background/80 px-4 py-3 backdrop-blur sm:px-8">
          <button type="button" onClick={() => setMenuOpen(true)} className="md:hidden" aria-label="Меню">☰</button>
          <div className="text-lg font-bold"><span className="text-accent">Конспект</span>ор</div>
          <div className="ml-auto text-sm text-muted">Нейросеть для учёбы</div>
        </header>

        <div className="mx-auto max-w-4xl px-4 py-8 sm:px-8">
          {!current && (
            <>
              {!stage && !draft && (
                <div className="mb-8 text-center">
                  <h1 className="text-3xl font-extrabold tracking-tight sm:text-5xl">
                    Готовься к экзаменам <span className="text-accent">в 10 раз быстрее</span>
                  </h1>
                  <p className="mx-auto mt-4 max-w-2xl text-muted sm:text-lg">
                    Запишите лекцию, загрузите файл или вставьте ссылку. Нейросеть сделает чёткий конспект, а из него карточки, тесты, шпаргалку и перевод на любой язык.
                  </p>
                </div>
              )}
              {!stage && <InputPanel busy={!!stage} onSubmit={handle} />}
              {error && <div className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-600 dark:text-red-400">{error}</div>}
              {stage && !draft && <Spinner text={stage} />}
              {draft && (
                <div className="card mt-2 p-6 sm:p-8">
                  {stage && <div className="mb-4 flex items-center gap-2 text-sm text-accent"><span className="h-2 w-2 animate-pulse rounded-full bg-accent" />{stage}</div>}
                  <Markdown>{draft}</Markdown>
                </div>
              )}
              {!stage && !draft && (
                <div className="mt-10 grid gap-4 sm:grid-cols-3">
                  {[
                    ["🎙️", "Любой источник", "Диктофон, аудио и видео, PDF, Word, фото, статьи и YouTube."],
                    ["🧠", "Умный конспект", "Структура, термины, определения и вопросы для самопроверки."],
                    ["🃏", "Учи, а не читай", "Флеш-карточки, тесты, шпаргалки, интеллект-карты и перевод."],
                  ].map(([icon, title, text]) => (
                    <div key={title} className="card p-5">
                      <div className="text-2xl">{icon}</div>
                      <div className="mt-2 font-semibold">{title}</div>
                      <div className="mt-1 text-sm text-muted">{text}</div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
          {current && <NoteView key={current.id} note={current} onChange={updateNote} />}
        </div>
      </main>
    </div>
  );
}

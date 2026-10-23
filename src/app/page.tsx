"use client";

import { useEffect, useState } from "react";
import InputPanel, { type Material } from "@/components/InputPanel";
import NoteView, { Spinner } from "@/components/NoteView";
import Markdown from "@/components/Markdown";
import NotesSearch from "@/components/NotesSearch";
import ProfileView from "@/components/ProfileView";
import SettingsView from "@/components/SettingsView";
import LoginView from "@/components/LoginView";
import { applyTheme, DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from "@/lib/settings";
import { fullName, loadSession, LOGOUT_EVENT, saveSession, type Session } from "@/lib/user";
import { fileToBase64, loadNotes, plural, postForm, postJson, postStream, saveNotes, titleFromMarkdown, type Note } from "@/lib/client";
import { audioToChunks, transcribeChunks } from "@/lib/audio";

type SummarizeBody = { text?: string; file?: { base64: string; mediaType: string; name?: string } };

const TEXT_EXT = /\.(txt|md|srt|vtt|csv|json)$/i;
const MAX_MEDIA_MB = 300;

type Page = "home" | "profile" | "settings";

const NAV: [Page, string, string][] = [
  ["home", "🏠", "Главная"],
  ["profile", "👤", "Личный кабинет"],
  ["settings", "⚙️", "Настройки"],
];

export default function Home() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [stage, setStage] = useState<string | null>(null);
  const [draft, setDraft] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [page, setPage] = useState<Page>("home");
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  // undefined — ещё не прочитали localStorage, null — нужно войти
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  // История и настройки хранятся в localStorage, поэтому читаем их только в браузере после гидрации.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setNotes(loadNotes());
    setSettings(loadSettings());
    setSession(loadSession());
    /* eslint-enable react-hooks/set-state-in-effect */
    const logout = () => setSession(null);
    window.addEventListener(LOGOUT_EVENT, logout);
    return () => window.removeEventListener(LOGOUT_EVENT, logout);
  }, []);

  function changeSettings(s: Settings) {
    setSettings(s);
    saveSettings(s);
    applyTheme(s.theme);
  }

  function login(s: Session | null) {
    saveSession(s);
    setSession(s);
    setPage("home");
    setCurrentId(null);
  }

  function go(p: Page) {
    setPage(p);
    setCurrentId(null);
    setMenuOpen(false);
  }

  function openNote(id: string) {
    setPage("home");
    setCurrentId(id);
    setMenuOpen(false);
  }

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
      const allWishes = [settings.defaultWishes.trim(), wishes.trim()].filter(Boolean).join(". ");
      const { language, detail, additions, answers } = settings;
      const summary = await postStream(
        "/api/summarize",
        { ...body, source: m.source, wishes: allWishes, settings: { language, detail, additions, answers } },
        setDraft,
      );
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

  if (session === undefined) return null;
  if (!session) return <LoginView onDone={login} />;
  const { user } = session;

  return (
    <div className="flex min-h-screen">
      <aside className={`no-print fixed inset-y-0 left-0 z-30 flex w-64 transform flex-col border-r border-line bg-surface p-4 transition md:sticky md:top-0 md:h-screen md:translate-x-0 ${menuOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <button type="button" onClick={() => go("home")} className="btn-primary mb-5 w-full">+ Новый конспект</button>
        <nav className="flex flex-col gap-1">
          {NAV.map(([id, icon, label]) => {
            const active = page === id && !(id === "home" && currentId);
            return (
              <button
                key={id}
                type="button"
                onClick={() => go(id)}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-left font-medium transition ${active ? "bg-accent/10 text-accent" : "hover:bg-foreground/5"}`}
              >
                <span>{icon}</span>
                {label}
              </button>
            );
          })}
        </nav>
        <button type="button" onClick={() => go("profile")} className="mt-auto flex items-center gap-3 rounded-lg border border-line p-3 text-left hover:border-accent/60">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent font-bold text-white">{user.firstName[0].toUpperCase()}</span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">{fullName(user)}</span>
            <span className="block truncate text-xs text-muted">{user.group} · {notes.length} {plural(notes.length, "конспект", "конспекта", "конспектов")}</span>
          </span>
        </button>
      </aside>
      {menuOpen && <div className="fixed inset-0 z-20 bg-black/30 md:hidden" onClick={() => setMenuOpen(false)} />}

      <main className="min-w-0 flex-1">
        <header className="no-print sticky top-0 z-10 flex items-center gap-3 border-b border-line bg-background/80 px-4 py-3 backdrop-blur sm:px-8">
          <button type="button" onClick={() => setMenuOpen(true)} className="md:hidden" aria-label="Меню">☰</button>
          <div className="text-lg font-bold"><span className="text-accent">Конспект</span>ор</div>
          <div className="ml-auto text-sm text-muted">Нейросеть для учёбы</div>
        </header>

        <div className="mx-auto max-w-4xl px-4 py-8 sm:px-8">
          {page === "settings" && <SettingsView settings={settings} onChange={changeSettings} />}
          {page === "profile" && <ProfileView user={user} notes={notes} onLogout={() => login(null)} onNotes={persist} onOpen={openNote} />}
          {page === "home" && !current && (
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
              {!stage && !draft && <NotesSearch notes={notes} onOpen={openNote} onRemove={remove} />}
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
          {page === "home" && current && <NoteView key={current.id} note={current} onChange={updateNote} />}
        </div>
      </main>
    </div>
  );
}

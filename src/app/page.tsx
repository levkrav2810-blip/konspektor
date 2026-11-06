"use client";

import { useEffect, useRef, useState } from "react";
import InputPanel, { type Material } from "@/components/InputPanel";
import NoteView, { Spinner } from "@/components/NoteView";
import Markdown from "@/components/Markdown";
import NotesSearch from "@/components/NotesSearch";
import ProfileView from "@/components/ProfileView";
import SettingsView from "@/components/SettingsView";
import LoginView from "@/components/LoginView";
import Icon from "@/components/Icon";
import { applyTheme, DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from "@/lib/settings";
import { fullName, loadSession, LOGOUT_EVENT, saveSession, type Session } from "@/lib/user";
import { deleteServerNotes, fetchServerNotes, noteColor, splitTitle, fileToBase64, loadNotes, mergeNotes, plural, postForm, postJson, postStream, pushNotes, saveNotes, titleFromMarkdown, type Note } from "@/lib/client";
import { audioToChunks, transcribeChunks } from "@/lib/audio";

type SummarizeBody = { text?: string; file?: { base64: string; mediaType: string; name?: string } };

const TEXT_EXT = /\.(txt|md|srt|vtt|csv|json)$/i;
const MAX_MEDIA_MB = 300;

type Page = "home" | "profile" | "settings";

/** Отмечает отправленные в аккаунт конспекты, если их не успели снова изменить. */
function withSynced(notes: Note[], pushed: Note[]) {
  const sent = new Map(pushed.map((n) => [n.id, n.updatedAt]));
  return notes.map((n) => (!n.synced && sent.has(n.id) && sent.get(n.id) === n.updatedAt ? { ...n, synced: true } : n));
}

const NAV: [Page, string, string][] = [
  ["home", "home", "Главная"],
  ["profile", "user", "Личный кабинет"],
  ["settings", "settings", "Настройки"],
];

export default function Home() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [stage, setStage] = useState<string | null>(null);
  const [draft, setDraft] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [page, setPage] = useState<Page>("home");
  const [sideQuery, setSideQuery] = useState("");
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  // undefined — ещё не прочитали localStorage, null — нужно войти
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  // true — конспекты хранятся в аккаунте; false — только в этом браузере; null — ещё не знаем
  const [cloud, setCloud] = useState<boolean | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  // свежий список для асинхронных обработчиков, которые иначе видят устаревший notes
  const notesRef = useRef<Note[]>([]);
  const userId = session?.user.id;

  // История и настройки хранятся в localStorage, поэтому читаем их только в браузере после гидрации.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setSettings(loadSettings());
    setSession(loadSession());
    /* eslint-enable react-hooks/set-state-in-effect */
    const logout = () => setSession(null);
    window.addEventListener(LOGOUT_EVENT, logout);
    return () => window.removeEventListener(LOGOUT_EVENT, logout);
  }, []);

  // Конспекты пользователя: сначала копия из браузера, затем объединяем с аккаунтом на сервере.
  useEffect(() => {
    if (!userId) return;
    const local = loadNotes(userId);
    notesRef.current = local;
    /* eslint-disable react-hooks/set-state-in-effect */
    setNotes(local);
    setCloud(null);
    setSyncError(null);
    /* eslint-enable react-hooks/set-state-in-effect */
    let cancelled = false;
    (async () => {
      try {
        const remote = await fetchServerNotes();
        if (cancelled) return;
        if (!remote) return setCloud(false);
        const onServer = new Set(remote.map((n) => n.id));
        // уже бывшие в аккаунте, но пропавшие оттуда конспекты удалили на другом устройстве
        const local = notesRef.current.filter((n) => !n.synced || onServer.has(n.id));
        const merged = mergeNotes(remote, local);
        notesRef.current = merged;
        setNotes(merged);
        saveNotes(userId, merged);
        setCloud(true);
        // то, чего нет в аккаунте или что в браузере свежее (старые конспекты, правки без интернета)
        const toPush = merged.filter((n) => !remote.includes(n));
        await pushNotes(toPush);
        if (cancelled || !toPush.length) return;
        const synced = withSynced(notesRef.current, toPush);
        notesRef.current = synced;
        setNotes(synced);
        saveNotes(userId, synced);
      } catch (e) {
        if (!cancelled) setSyncError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

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

  /** Отмечает конспекты, которые точно сохранены в аккаунте. */
  function markSynced(pushed: Note[]) {
    if (!userId || !pushed.length) return;
    const next = withSynced(notesRef.current, pushed);
    notesRef.current = next;
    setNotes(next);
    saveNotes(userId, next);
  }

  /** Сохраняет новый список: в браузер сразу, в аккаунт — только изменённые и удалённые конспекты. */
  function persist(next: Note[]) {
    if (!userId) return;
    const prev = notesRef.current;
    const changed = next.filter((n) => !prev.includes(n));
    const now = Date.now();
    const stamped = next.map((n) => (changed.includes(n) ? { ...n, updatedAt: now, synced: false } : n));
    notesRef.current = stamped;
    setNotes(stamped);
    saveNotes(userId, stamped);
    if (!cloud) return;
    const removed = prev.filter((p) => !next.some((n) => n.id === p.id)).map((p) => p.id);
    const toPush = stamped.filter((n, i) => changed.includes(next[i]));
    Promise.all([pushNotes(toPush), deleteServerNotes(removed)])
      .then(() => {
        markSynced(toPush);
        setSyncError(null);
      })
      .catch((e) => setSyncError(`Конспект сохранён в браузере, но не в аккаунте: ${e instanceof Error ? e.message : e}`));
  }

  function updateNote(n: Note) {
    persist(notesRef.current.map((x) => (x.id === n.id ? n : x)));
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
      persist([note, ...notesRef.current]);
      setCurrentId(note.id);
      setDraft("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setStage(null);
    }
  }

  function remove(id: string) {
    persist(notesRef.current.filter((n) => n.id !== id));
    if (currentId === id) setCurrentId(null);
  }

  const current = notes.find((n) => n.id === currentId) || null;

  if (session === undefined) return null;
  if (!session) return <LoginView onDone={login} />;
  const { user } = session;

  const hasNotes = notes.length > 0;
  const cardsKnown = notes.reduce((a, n) => a + (n.cardsKnown ?? 0), 0);
  const cardsTotal = notes.reduce((a, n) => a + (n.flashcards?.length ?? 0), 0);
  const scores = notes.flatMap((n) => (n.quizBest !== undefined ? [n.quizBest] : []));
  const stats: [string, string, string, string][] = [
    ["📚", String(notes.length), plural(notes.length, "конспект", "конспекта", "конспектов"), "#3b7bff"],
    ["🃏", cardsTotal ? `${cardsKnown}/${cardsTotal}` : "0", "карточек выучено", "#10b981"],
    ["🏆", scores.length ? `${Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)}%` : "—", "средний балл тестов", "#f97316"],
  ];
  const q = sideQuery.trim().toLowerCase();
  const sideNotes = (q ? notes.filter((n) => n.title.toLowerCase().includes(q)) : notes).slice(0, 30);
  const title = page === "settings" ? "Настройки" : page === "profile" ? "Личный кабинет" : current ? current.title : stage || draft ? "Новый конспект" : "Главная";

  return (
    <div className="flex min-h-screen">
      <aside className={`no-print fixed inset-y-0 left-0 z-30 flex w-72 transform flex-col border-r border-line bg-surface transition-transform md:sticky md:top-0 md:h-screen md:translate-x-0 ${menuOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex items-center justify-between px-5 pb-3 pt-5">
          <button type="button" onClick={() => go("home")} className="text-lg font-bold tracking-tight"><span className="text-accent">Конспект</span>ор</button>
          <button type="button" onClick={() => setMenuOpen(false)} className="btn-icon md:hidden" aria-label="Закрыть меню"><Icon name="close" /></button>
        </div>
        <div className="px-4">
          <button type="button" onClick={() => go("home")} className="btn-primary flex w-full items-center justify-center gap-2 !py-2.5"><Icon name="plus" className="h-4 w-4" />Новый конспект</button>
        </div>
        <nav className="mt-4 flex flex-col gap-0.5 px-3">
          {NAV.map(([id, icon, label]) => {
            const active = page === id && !(id === "home" && currentId);
            return (
              <button key={id} type="button" onClick={() => go(id)} className={`nav-item ${active ? "nav-item-active" : ""}`}>
                <Icon name={icon} className="h-[18px] w-[18px]" />
                {label}
              </button>
            );
          })}
        </nav>

        {hasNotes && (
          <div className="mt-5 flex min-h-0 flex-1 flex-col border-t border-line pt-4">
            <div className="flex items-center justify-between px-5 text-xs font-semibold uppercase tracking-wider text-muted">
              Мои конспекты <span className="font-normal normal-case tracking-normal">{notes.length}</span>
            </div>
            {notes.length > 5 && (
              <div className="relative mx-4 mt-2">
                <Icon name="search" className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <input value={sideQuery} onChange={(e) => setSideQuery(e.target.value)} placeholder="Найти…" className="input !rounded-lg !py-1.5 !pl-8 text-sm" />
              </div>
            )}
            <ul className="mt-2 min-h-0 flex-1 overflow-y-auto px-3 pb-2">
              {sideNotes.map((n) => (
                <li key={n.id}>
                  <button type="button" onClick={() => openNote(n.id)} className={`nav-item w-full !py-2 ${currentId === n.id && page === "home" ? "nav-item-active" : ""}`}>
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-base" style={{ background: `color-mix(in srgb, ${noteColor(n.id)} 20%, transparent)` }}>{splitTitle(n.title).emoji}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{splitTitle(n.title).text}</span>
                      <span className="block text-xs font-normal text-muted">{new Date(n.createdAt).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}</span>
                    </span>
                  </button>
                </li>
              ))}
              {sideNotes.length === 0 && <li className="px-3 py-2 text-sm text-muted">Ничего не найдено</li>}
            </ul>
          </div>
        )}

        <button type="button" onClick={() => go("profile")} className="m-3 mt-auto flex items-center gap-3 rounded-xl p-2.5 text-left transition hover:bg-foreground/5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent font-bold text-white">{user.firstName[0].toUpperCase()}</span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">{fullName(user)}</span>
            <span className="block truncate text-xs text-muted">{user.group} · {notes.length} {plural(notes.length, "конспект", "конспекта", "конспектов")}</span>
          </span>
        </button>
      </aside>
      {menuOpen && <div className="fixed inset-0 z-20 bg-black/50 backdrop-blur-sm md:hidden" onClick={() => setMenuOpen(false)} />}

      <main className="min-w-0 flex-1">
        <header className="no-print sticky top-0 z-10 flex h-14 items-center gap-2 border-b border-line bg-background/80 px-3 backdrop-blur sm:px-6">
          <button type="button" onClick={() => setMenuOpen(true)} className="btn-icon md:hidden" aria-label="Меню"><Icon name="menu" /></button>
          {(current || page !== "home") && (
            <button type="button" onClick={() => go("home")} className="btn-icon" aria-label="На главную"><Icon name="back" /></button>
          )}
          <div className="min-w-0 flex-1 truncate font-semibold">{title}</div>
          {(current || page !== "home") && (
            <button type="button" onClick={() => go("home")} className="btn-secondary hidden items-center gap-1.5 !py-1.5 text-sm sm:flex"><Icon name="plus" className="h-4 w-4" />Новый</button>
          )}
        </header>

        <div className="mx-auto max-w-4xl px-4 py-6 sm:px-8 sm:py-10">
          {page === "settings" && <SettingsView settings={settings} onChange={changeSettings} />}
          {page === "profile" && <ProfileView user={user} notes={notes} cloud={cloud} syncError={syncError} onLogout={() => login(null)} onNotes={persist} onOpen={openNote} />}
          {page === "home" && !current && (
            <>
              {!stage && !draft && (hasNotes ? (
                <div className="fade-up mb-6">
                  <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Привет, {user.firstName}! 👋</h1>
                  <p className="mt-1 text-muted">Запишите лекцию, загрузите файл или вставьте ссылку — конспект будет готов через минуту.</p>
                  <div className="mt-5 grid grid-cols-3 gap-2 sm:gap-3">
                    {stats.map(([icon, value, label, color]) => (
                      <div key={label} className="card p-3 sm:p-4" style={{ background: `linear-gradient(135deg, color-mix(in srgb, ${color} 22%, var(--surface)), var(--surface))` }}>
                        <div className="text-xl sm:text-2xl">{icon}</div>
                        <div className="mt-1 text-xl font-bold sm:text-2xl">{value}</div>
                        <div className="text-xs text-muted sm:text-sm">{label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="mb-8 text-center">
                  <h1 className="text-3xl font-extrabold tracking-tight sm:text-5xl">
                    Готовься к экзаменам <span className="bg-gradient-to-r from-accent via-violet-500 to-pink-500 bg-clip-text text-transparent">в 10 раз быстрее</span>
                  </h1>
                  <p className="mx-auto mt-4 max-w-2xl text-muted sm:text-lg">
                    Запишите лекцию, загрузите файл или вставьте ссылку. Нейросеть сделает чёткий конспект, а из него карточки, тесты, шпаргалку и перевод на любой язык.
                  </p>
                </div>
              ))}
              {!stage && <InputPanel busy={!!stage} onSubmit={handle} />}
              {error && <div className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-600 dark:text-red-400">{error}</div>}
              {!stage && !draft && <NotesSearch notes={notes} onOpen={openNote} onRemove={remove} />}
              {stage && !draft && <Spinner text={stage} />}
              {draft && (
                <div className="card mt-2 p-4 sm:p-8">
                  {stage && <div className="mb-4 flex items-center gap-2 text-sm text-accent"><span className="h-2 w-2 animate-pulse rounded-full bg-accent" />{stage}</div>}
                  <Markdown>{draft}</Markdown>
                </div>
              )}
              {!stage && !draft && !hasNotes && (
                <div className="mt-10 grid gap-4 sm:grid-cols-3">
                  {[
                    ["🎙️", "Любой источник", "Диктофон, аудио и видео, PDF, Word, фото, статьи и YouTube."],
                    ["🧠", "Умный конспект", "Структура, термины, определения и вопросы для самопроверки."],
                    ["🃏", "Учи, а не читай", "Флеш-карточки, тесты, шпаргалки, интеллект-карты и перевод."],
                  ].map(([icon, title, text]) => (
                    <div key={title} className="card lift p-5">
                      <div className="text-2xl">{icon}</div>
                      <div className="mt-2 font-semibold">{title}</div>
                      <div className="mt-1 text-sm text-muted">{text}</div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
          {page === "home" && current && <NoteView key={current.id} note={current} onChange={updateNote} onRemove={() => window.confirm(`Удалить конспект «${current.title}»?`) && remove(current.id)} />}
        </div>
      </main>
    </div>
  );
}

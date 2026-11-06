"use client";

import { useEffect, useRef, useState } from "react";
import InputPanel, { type Material, type Tab } from "@/components/InputPanel";
import NoteView, { Spinner, type NotePatch } from "@/components/NoteView";
import Markdown from "@/components/Markdown";
import NotesList from "@/components/NotesList";
import Subjects from "@/components/Subjects";
import ProfileView from "@/components/ProfileView";
import SettingsView from "@/components/SettingsView";
import LoginView from "@/components/LoginView";
import Icon from "@/components/Icon";
import { applyTheme, DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from "@/lib/settings";
import { fullName, loadSession, LOGOUT_EVENT, saveSession, type Session } from "@/lib/user";
import { deleteServerNotes, fetchServerNotes, fetchServerSubjects, loadSubjects, pushSubjects, saveSubjects, type Subject, fileToBase64, loadNotes, mergeNotes, plural, postForm, postJson, postStream, pushNotes, saveNotes, titleFromMarkdown, type Note } from "@/lib/client";
import { audioToChunks, transcribeChunks } from "@/lib/audio";

type SummarizeBody = { text?: string; file?: { base64: string; mediaType: string; name?: string } };

const TEXT_EXT = /\.(txt|md|srt|vtt|csv|json)$/i;
const MAX_MEDIA_MB = 300;

type Page = "home" | "subject" | "profile" | "settings";

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
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [homeTab, setHomeTab] = useState<"notes" | "subjects">("notes");
  const [createTab, setCreateTab] = useState<Tab | null>(null);
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

  // Предметы: копия из браузера, затем список из аккаунта (если база подключена).
  useEffect(() => {
    if (!userId) return;
    const local = loadSubjects(userId);
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    setSubjects(local);
    let cancelled = false;
    fetchServerSubjects()
      .then(async (remote) => {
        if (cancelled || !remote) return;
        if (!remote.length && local.length) return pushSubjects(local);
        setSubjects(remote);
        saveSubjects(userId, remote);
      })
      .catch(() => {
        // без аккаунта предметы остаются в браузере
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  function changeSubjects(next: Subject[]) {
    if (!userId) return;
    setSubjects(next);
    saveSubjects(userId, next);
    if (cloud) pushSubjects(next).catch((e) => setSyncError(`Предметы сохранены в браузере, но не в аккаунте: ${e instanceof Error ? e.message : e}`));
  }

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
    setSubjectId(null);
    setMenuOpen(false);
    window.scrollTo(0, 0);
  }

  function openNote(id: string) {
    setPage((p) => (p === "subject" ? p : "home"));
    setCurrentId(id);
    setMenuOpen(false);
    window.scrollTo(0, 0);
  }

  function openSubject(id: string) {
    setPage("subject");
    setSubjectId(id);
    setCurrentId(null);
    setMenuOpen(false);
    window.scrollTo(0, 0);
  }

  function newNote() {
    go("home");
    setCreateTab((t) => t ?? "voice");
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

  /** Меняет конспект, опираясь на самую свежую его версию. */
  function patchNote(id: string, patch: NotePatch) {
    persist(notesRef.current.map((x) => (x.id === id ? { ...x, ...(typeof patch === "function" ? patch(x) : patch) } : x)));
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
    const subjectForNew = page === "subject" ? subjectId : null;
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
        subjectId: subjectForNew ?? undefined,
      };
      persist([note, ...notesRef.current]);
      setCurrentId(note.id);
      setCreateTab(null);
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
  const openedSubject = subjects.find((s) => s.id === subjectId) || null;

  if (session === undefined) return null;
  if (!session) return <LoginView onDone={login} />;
  const { user } = session;

  const showNote = current && (page === "home" || page === "subject");
  const title = page === "settings" ? "Настройки" : page === "profile" ? "Личный кабинет" : showNote ? "Конспект" : openedSubject ? openedSubject.name : "Главная";

  const SOURCES: [Tab, string, string, string][] = [
    ["voice", "mic", "Записать аудио", "#ef4444"],
    ["file", "upload", "Загрузить файл", "#3b7bff"],
    ["link", "link", "Вставить ссылку", "#10b981"],
    ["text", "text", "Вставить текст", "#f59e0b"],
  ];

  const createBlock = (
    <>
      {!stage && !draft && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {SOURCES.map(([id, icon, label, color]) => (
            <button
              key={id}
              type="button"
              onClick={() => setCreateTab(createTab === id ? null : id)}
              className={`card lift flex flex-col items-center justify-center gap-2.5 px-3 py-5 text-center sm:gap-3 sm:py-8 ${createTab === id ? "!border-accent ring-2 ring-accent/30" : ""}`}
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-full" style={{ background: `color-mix(in srgb, ${color} 16%, transparent)`, color }}>
                <Icon name={icon} className="h-6 w-6" />
              </span>
              <span className="text-sm font-medium sm:text-base">{label}</span>
            </button>
          ))}
        </div>
      )}
      {!stage && createTab && (
        <div className="pop-in mt-3">
          <InputPanel key={createTab} tab={createTab} busy={!!stage} onSubmit={handle} />
        </div>
      )}
      {error && <div className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-600 dark:text-red-400">{error}</div>}
      {stage && !draft && <div className="card mt-2"><Spinner text={stage} /></div>}
      {draft && (
        <div className="card mt-2 p-4 sm:p-8">
          {stage && <div className="mb-4 flex items-center gap-2 text-sm text-accent"><span className="h-2 w-2 animate-pulse rounded-full bg-accent" />{stage}</div>}
          <Markdown>{draft}</Markdown>
        </div>
      )}
    </>
  );

  const homeTabs = (
    <div className="inline-flex rounded-2xl border border-line bg-surface p-1">
      {([["notes", "📝", "Конспекты"], ["subjects", "📁", "Предметы"]] as const).map(([id, icon, label]) => (
        <button key={id} type="button" onClick={() => setHomeTab(id)} className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition sm:px-4 ${homeTab === id ? "bg-accent/15 text-accent" : "text-muted hover:text-foreground"}`}>
          <span>{icon}</span>{label}
        </button>
      ))}
    </div>
  );

  const railItem = (id: Page, icon: string, label: string) => {
    const active = page === id && !showNote;
    return (
      <button key={id} type="button" onClick={() => go(id)} title={label} aria-label={label} className={`flex h-12 w-12 items-center justify-center rounded-2xl transition ${active ? "bg-accent text-white shadow-lg shadow-accent/30" : "text-muted hover:bg-foreground/5 hover:text-foreground"}`}>
        <Icon name={icon} />
      </button>
    );
  };

  return (
    <div className="flex min-h-screen">
      {/* Узкая панель слева на компьютере */}
      <aside className="no-print sticky top-0 hidden h-screen w-20 shrink-0 flex-col items-center gap-2 border-r border-line bg-surface py-5 md:flex">
        <button type="button" onClick={() => go("home")} className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-violet-500 text-xl font-black text-white" title="Конспектор">К</button>
        <button type="button" onClick={newNote} title="Новый конспект" aria-label="Новый конспект" className="mb-2 flex h-12 w-12 items-center justify-center rounded-2xl border border-dashed border-line text-muted transition hover:border-accent hover:text-accent">
          <Icon name="plus" />
        </button>
        {NAV.map(([id, icon, label]) => railItem(id, icon, label))}
        <button type="button" onClick={() => go("profile")} title={fullName(user)} className="mt-auto flex h-11 w-11 items-center justify-center rounded-full bg-accent font-bold text-white">
          {user.firstName[0].toUpperCase()}
        </button>
      </aside>

      {/* Меню на телефоне */}
      <aside className={`no-print fixed inset-y-0 left-0 z-40 flex w-72 transform flex-col border-r border-line bg-surface p-4 transition-transform md:hidden ${menuOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="mb-4 flex items-center justify-between">
          <div className="text-lg font-bold"><span className="text-accent">Конспект</span>ор</div>
          <button type="button" onClick={() => setMenuOpen(false)} className="btn-icon" aria-label="Закрыть меню"><Icon name="close" /></button>
        </div>
        <button type="button" onClick={newNote} className="btn-primary mb-4 flex items-center justify-center gap-2 !py-2.5"><Icon name="plus" className="h-4 w-4" />Новый конспект</button>
        {NAV.map(([id, icon, label]) => (
          <button key={id} type="button" onClick={() => go(id)} className={`nav-item ${page === id && !showNote ? "nav-item-active" : ""}`}>
            <Icon name={icon} className="h-[18px] w-[18px]" />{label}
          </button>
        ))}
        {subjects.length > 0 && (
          <>
            <div className="mt-5 px-3 text-xs font-semibold uppercase tracking-wider text-muted">Предметы</div>
            <div className="mt-1 flex min-h-0 flex-col overflow-y-auto">
              {subjects.map((s) => (
                <button key={s.id} type="button" onClick={() => openSubject(s.id)} className={`nav-item ${subjectId === s.id && !showNote ? "nav-item-active" : ""}`}>
                  <span className="h-3 w-3 rounded-full" style={{ background: s.color }} />{s.name}
                </button>
              ))}
            </div>
          </>
        )}
        <div className="mt-auto flex items-center gap-3 rounded-xl p-2 text-sm">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent font-bold text-white">{user.firstName[0].toUpperCase()}</span>
          <span className="min-w-0">
            <span className="block truncate font-medium">{fullName(user)}</span>
            <span className="block truncate text-xs text-muted">{user.group} · {notes.length} {plural(notes.length, "конспект", "конспекта", "конспектов")}</span>
          </span>
        </div>
      </aside>
      {menuOpen && <div className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm md:hidden" onClick={() => setMenuOpen(false)} />}

      <main className="min-w-0 flex-1">
        <header className="no-print sticky top-0 z-10 flex h-14 items-center gap-2 border-b border-line bg-background/80 px-3 backdrop-blur md:hidden">
          <button type="button" onClick={() => setMenuOpen(true)} className="btn-icon" aria-label="Меню"><Icon name="menu" /></button>
          <div className="min-w-0 flex-1 truncate font-semibold">{title}</div>
          <button type="button" onClick={newNote} className="btn-icon" aria-label="Новый конспект"><Icon name="plus" /></button>
        </header>

        <div className={`mx-auto px-4 py-6 sm:px-8 sm:py-10 ${showNote ? "max-w-[1400px] pb-28 xl:pb-10" : "max-w-4xl"}`}>
          {page === "settings" && <SettingsView settings={settings} onChange={changeSettings} />}
          {page === "profile" && <ProfileView user={user} notes={notes} cloud={cloud} syncError={syncError} onLogout={() => login(null)} onNotes={persist} onOpen={openNote} />}

          {page === "home" && !showNote && (
            <>
              <div className="fade-up mb-6">
                <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Создать конспект</h1>
                <p className="mt-1 text-muted">Запиши лекцию, загрузи файл, вставь ссылку или текст — нейросеть сделает чёткий конспект.</p>
              </div>
              {createBlock}
              {!stage && !draft && (
                <>
                  <hr className="my-8 border-line" />
                  {homeTab === "notes" ? (
                    <NotesList toolbar={homeTabs} notes={notes} subjects={subjects} onOpen={openNote} onRemove={remove} emptyText="Здесь появятся ваши конспекты. Начните с записи лекции или файла." />
                  ) : (
                    <Subjects toolbar={homeTabs} subjects={subjects} notes={notes} onOpen={openSubject} onChange={changeSubjects} />
                  )}
                </>
              )}
            </>
          )}

          {page === "subject" && !showNote && (
            openedSubject ? (
              <>
                <nav className="mb-4 flex items-center gap-1.5 text-sm text-muted">
                  <button type="button" onClick={() => { go("home"); setHomeTab("subjects"); }} className="hover:text-foreground">Предметы</button>
                  <Icon name="chevron" className="h-3.5 w-3.5" />
                  <span className="text-foreground">{openedSubject.name}</span>
                </nav>
                <div className="fade-up mb-6 flex items-center gap-4">
                  <span className="flex h-14 w-14 items-center justify-center rounded-2xl text-white" style={{ background: openedSubject.color }}><Icon name="folder" className="h-7 w-7" /></span>
                  <div>
                    <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{openedSubject.name}</h1>
                    <p className="text-muted">{notes.filter((n) => n.subjectId === openedSubject.id).length} {plural(notes.filter((n) => n.subjectId === openedSubject.id).length, "конспект", "конспекта", "конспектов")}</p>
                  </div>
                </div>
                <div className="mb-8">{createBlock}</div>
                {!stage && !draft && (
                  <NotesList
                    notes={notes.filter((n) => n.subjectId === openedSubject.id)}
                    subjects={subjects}
                    onOpen={openNote}
                    onRemove={remove}
                    emptyText="В этом предмете пока нет конспектов. Создайте новый выше или откройте готовый конспект и нажмите «В предмет»."
                  />
                )}
              </>
            ) : (
              <p className="text-muted">Предмет не найден.</p>
            )
          )}

          {showNote && current && (
            <NoteView
              key={current.id}
              note={current}
              subjects={subjects}
              onPatch={(p) => patchNote(current.id, p)}
              onRemove={() => window.confirm(`Удалить конспект «${current.title}»?`) && remove(current.id)}
              onHome={() => go("home")}
              onSubject={openSubject}
            />
          )}
        </div>
      </main>
    </div>
  );
}

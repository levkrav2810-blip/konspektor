"use client";

import { useRef, useState } from "react";
import { downloadText, plural, type Note } from "@/lib/client";
import type { Profile } from "@/lib/settings";

export default function ProfileView({
  profile,
  notes,
  onProfile,
  onNotes,
  onOpen,
}: {
  profile: Profile;
  notes: Note[];
  onProfile: (p: Profile) => void;
  onNotes: (n: Note[]) => void;
  onOpen: (id: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [now] = useState(() => Date.now());
  const set = (key: keyof Profile, value: string) => onProfile({ ...profile, [key]: value });

  const cards = notes.reduce((s, n) => s + (n.flashcards?.length ?? 0), 0);
  const tests = notes.filter((n) => n.quiz?.length).length;
  const weekAgo = now - 7 * 864e5;
  const thisWeek = notes.filter((n) => n.createdAt > weekAgo).length;
  const initial = (profile.name.trim()[0] || "🙂").toUpperCase();

  const stats: [number, string][] = [
    [notes.length, plural(notes.length, "конспект", "конспекта", "конспектов")],
    [thisWeek, "за неделю"],
    [cards, plural(cards, "карточка", "карточки", "карточек")],
    [tests, plural(tests, "тест", "теста", "тестов")],
  ];

  function exportAll() {
    downloadText(`konspektor-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ profile, notes }, null, 2), "application/json");
  }

  async function importFile(file: File) {
    try {
      const data = JSON.parse(await file.text());
      const incoming: Note[] = Array.isArray(data) ? data : data.notes;
      if (!Array.isArray(incoming)) throw new Error();
      const known = new Set(notes.map((n) => n.id));
      const added = incoming.filter((n) => n?.id && n.summary && !known.has(n.id));
      onNotes([...added, ...notes].sort((a, b) => b.createdAt - a.createdAt));
      setMessage(`Добавлено конспектов: ${added.length}`);
    } catch {
      setMessage("Не получилось прочитать файл. Нужен файл, сохранённый кнопкой «Скачать все конспекты».");
    }
  }

  function clearAll() {
    if (notes.length && window.confirm(`Удалить все ${notes.length} ${plural(notes.length, "конспект", "конспекта", "конспектов")}? Это нельзя отменить.`)) {
      onNotes([]);
      setMessage("Все конспекты удалены");
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold sm:text-3xl">👤 Личный кабинет</h1>

      <section className="card mt-6 flex flex-col gap-5 p-5 sm:flex-row sm:items-start sm:p-6">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-accent text-2xl font-bold text-white">{initial}</div>
        <div className="grid flex-1 gap-3 sm:grid-cols-3">
          <label className="text-sm">
            <span className="text-muted">Имя</span>
            <input value={profile.name} onChange={(e) => set("name", e.target.value)} placeholder="Как к вам обращаться" className="input mt-1 py-2.5" />
          </label>
          <label className="text-sm">
            <span className="text-muted">Где учитесь</span>
            <input value={profile.study} onChange={(e) => set("study", e.target.value)} placeholder="Например, МГУ, юрфак" className="input mt-1 py-2.5" />
          </label>
          <label className="text-sm">
            <span className="text-muted">Курс или класс</span>
            <input value={profile.course} onChange={(e) => set("course", e.target.value)} placeholder="1 курс" className="input mt-1 py-2.5" />
          </label>
        </div>
      </section>

      <section className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map(([value, label]) => (
          <div key={label} className="card p-4 text-center">
            <div className="text-3xl font-extrabold text-accent">{value}</div>
            <div className="mt-1 text-sm text-muted">{label}</div>
          </div>
        ))}
      </section>

      {notes.length > 0 && (
        <section className="card mt-4 p-5 sm:p-6">
          <h2 className="font-semibold">Последние конспекты</h2>
          <ul className="mt-3 divide-y divide-line">
            {notes.slice(0, 5).map((n) => (
              <li key={n.id}>
                <button type="button" onClick={() => onOpen(n.id)} className="flex w-full items-center justify-between gap-3 py-2.5 text-left hover:text-accent">
                  <span className="truncate">{n.title}</span>
                  <span className="shrink-0 text-xs text-muted">{new Date(n.createdAt).toLocaleDateString("ru-RU")}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card mt-4 p-5 sm:p-6">
        <h2 className="font-semibold">Мои данные</h2>
        <p className="mt-1 text-sm text-muted">
          Конспекты хранятся в этом браузере. Чтобы перенести их на другое устройство, скачайте файл и загрузите его там.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={exportAll} disabled={!notes.length} className="btn-secondary">⬇️ Скачать все конспекты</button>
          <button type="button" onClick={() => fileRef.current?.click()} className="btn-secondary">⬆️ Загрузить из файла</button>
          <button type="button" onClick={clearAll} disabled={!notes.length} className="btn-secondary text-red-600 dark:text-red-400">🗑️ Удалить все</button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importFile(f);
              e.target.value = "";
            }}
          />
        </div>
        {message && <p className="mt-3 text-sm text-accent">{message}</p>}
      </section>
    </div>
  );
}

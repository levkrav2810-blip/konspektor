"use client";

import { useEffect, useRef, useState } from "react";
import { downloadText, plural, type Note } from "@/lib/client";
import { authFetch, fullName, type User } from "@/lib/user";

type Member = Pick<User, "id" | "firstName" | "lastName">;

export default function ProfileView({
  user,
  notes,
  onLogout,
  onNotes,
  onOpen,
}: {
  user: User;
  notes: Note[];
  onLogout: () => void;
  onNotes: (n: Note[]) => void;
  onOpen: (id: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [now] = useState(() => Date.now());
  // null — список не хранится на сервере, тогда блок группы не показываем
  const [members, setMembers] = useState<Member[] | null>(null);

  useEffect(() => {
    authFetch("/api/group")
      .then((r) => r.json())
      .then((d) => setMembers(d.shared ? d.members : null))
      .catch(() => setMembers(null));
  }, []);

  const cards = notes.reduce((s, n) => s + (n.flashcards?.length ?? 0), 0);
  const tests = notes.filter((n) => n.quiz?.length).length;
  const weekAgo = now - 7 * 864e5;
  const thisWeek = notes.filter((n) => n.createdAt > weekAgo).length;
  const initial = (user.firstName[0] + user.lastName[0]).toUpperCase();

  const stats: [number, string][] = [
    [notes.length, plural(notes.length, "конспект", "конспекта", "конспектов")],
    [thisWeek, "за неделю"],
    [cards, plural(cards, "карточка", "карточки", "карточек")],
    [tests, plural(tests, "тест", "теста", "тестов")],
  ];

  function exportAll() {
    downloadText(`konspektor-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ user: { firstName: user.firstName, lastName: user.lastName, group: user.group }, notes }, null, 2), "application/json");
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

      <section className="card mt-6 flex flex-wrap items-center gap-4 p-5 sm:p-6">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-accent text-2xl font-bold text-white">{initial}</div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xl font-semibold">{fullName(user)}</div>
          <div className="mt-0.5 text-muted">Группа {user.group}</div>
        </div>
        <button type="button" onClick={() => window.confirm("Выйти? Конспекты останутся в этом браузере.") && onLogout()} className="btn-secondary">Выйти</button>
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

      {members && (
        <section className="card mt-4 p-5 sm:p-6">
          <h2 className="font-semibold">
            Моя группа {user.group} <span className="text-muted">· {members.length} {plural(members.length, "участник", "участника", "участников")}</span>
          </h2>
          <ul className="mt-3 grid gap-x-6 gap-y-1 sm:grid-cols-2">
            {members.map((m, i) => (
              <li key={m.id} className={`flex items-center gap-3 py-1.5 ${m.id === user.id ? "font-medium text-accent" : ""}`}>
                <span className="w-6 text-right text-sm text-muted">{i + 1}.</span>
                {m.lastName} {m.firstName}
                {m.id === user.id && <span className="text-xs text-muted">это вы</span>}
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

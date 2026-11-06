"use client";

import { useState } from "react";
import Icon from "./Icon";
import { dayLabel, noteColor, noteProgress, sourceLabel, splitTitle, type Note, type Subject } from "@/lib/client";

const PAGE = 20;

/** Убирает разметку Markdown, чтобы искать по чистому тексту. */
function plain(md: string) {
  return md.replace(/[#>*_`|[\]]/g, " ").replace(/\s+/g, " ").trim();
}

/** Список конспектов, сгруппированный по дням, с поиском. */
export default function NotesList({
  notes,
  subjects,
  onOpen,
  onRemove,
  emptyText = "Здесь появятся ваши конспекты.",
  toolbar,
}: {
  notes: Note[];
  subjects: Subject[];
  onOpen: (id: string) => void;
  onRemove: (id: string) => void;
  emptyText?: string;
  /** Что показать слева от кнопки поиска (например, переключатель вкладок). */
  toolbar?: React.ReactNode;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE);

  const q = query.trim().toLowerCase();
  const found = q
    ? notes.filter((n) => n.title.toLowerCase().includes(q) || plain(n.summary).toLowerCase().includes(q) || n.source.toLowerCase().includes(q))
    : notes;
  const shown = [...found].sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
  const groups: [string, Note[]][] = [];
  for (const n of shown) {
    const label = dayLabel(n.createdAt);
    const last = groups.at(-1);
    if (last && last[0] === label) last[1].push(n);
    else groups.push([label, [n]]);
  }
  const subjectOf = (n: Note) => subjects.find((s) => s.id === n.subjectId);

  return (
    <div>
      {(notes.length > 0 || toolbar) && (
        <div className="mb-2 flex items-center gap-2">
          {searchOpen ? (
            <div className="relative flex-1">
              <Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input
                type="search"
                autoFocus
                value={query}
                onChange={(e) => { setQuery(e.target.value); setLimit(PAGE); }}
                placeholder="Поиск: тема, термин, имя…"
                className="input !py-2.5 pl-10"
              />
            </div>
          ) : (
            <div className="min-w-0 flex-1">{toolbar}</div>
          )}
          {notes.length > 0 && <button
            type="button"
            onClick={() => { setSearchOpen(!searchOpen); setQuery(""); }}
            className="btn-icon h-11 w-11 rounded-full border border-line bg-surface"
            aria-label={searchOpen ? "Закрыть поиск" : "Поиск по конспектам"}
          >
            <Icon name={searchOpen ? "close" : "search"} className="h-[18px] w-[18px]" />
          </button>}
        </div>
      )}

      {notes.length === 0 && <p className="card p-8 text-center text-muted">{emptyText}</p>}
      {notes.length > 0 && found.length === 0 && <p className="py-6 text-center text-sm text-muted">Ничего не найдено по запросу «{query.trim()}».</p>}

      {groups.map(([label, items]) => (
        <section key={label} className="mt-5">
          <h3 className="mb-2 text-sm text-muted">{label}</h3>
          <ul className="flex flex-col gap-2.5">
            {items.map((n) => {
              const { emoji, text } = splitTitle(n.title);
              const subject = subjectOf(n);
              const progress = noteProgress(n);
              return (
                <li key={n.id} className="fade-up group relative">
                  <button
                    type="button"
                    onClick={() => onOpen(n.id)}
                    className="card lift flex w-full items-center gap-4 p-4 text-left sm:p-5"
                  >
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-2xl" style={{ background: `color-mix(in srgb, ${noteColor(n.id)} 18%, transparent)` }}>
                      {emoji}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-base font-semibold sm:text-lg">{text}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
                        <span>{sourceLabel(n.source)}</span>
                        {subject && (
                          <span className="inline-flex items-center gap-1.5">
                            <span className="h-2.5 w-2.5 rounded-full" style={{ background: subject.color }} />
                            {subject.name}
                          </span>
                        )}
                        {n.flashcards?.length ? <span>🃏 {n.flashcards.length}</span> : null}
                        {n.quizBest !== undefined && <span>✅ {n.quizBest}%</span>}
                      </span>
                      {progress !== null && (
                        <span className="progress mt-2 block w-32" style={{ ["--accent" as string]: noteColor(n.id) }}><span className="block" style={{ width: `${progress}%` }} /></span>
                      )}
                    </span>
                    <Icon name="chevron" className="h-5 w-5 shrink-0 text-muted" />
                  </button>
                  <button
                    type="button"
                    onClick={() => window.confirm(`Удалить конспект «${n.title}»?`) && onRemove(n.id)}
                    className="absolute right-12 top-1/2 -translate-y-1/2 rounded-md px-2 text-lg text-muted opacity-0 transition hover:text-red-500 group-hover:opacity-100"
                    aria-label="Удалить конспект"
                  >
                    ×
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {found.length > limit && (
        <button type="button" onClick={() => setLimit(limit + PAGE)} className="mt-4 w-full rounded-xl border border-line py-2.5 text-sm text-muted hover:text-foreground">
          Показать ещё ({found.length - limit})
        </button>
      )}
    </div>
  );
}

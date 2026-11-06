"use client";

import { useState } from "react";
import { noteColor, noteProgress, splitTitle, type Note } from "@/lib/client";

const PAGE = 6;

/** Убирает разметку Markdown, чтобы показывать и искать по чистому тексту. */
function plain(md: string) {
  return md
    .replace(/[#>*_`|[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function snippet(note: Note, q: string) {
  // первый заголовок повторяет название конспекта
  const text = plain(note.summary.replace(/^\s*#\s[^\n]*\n/, ""));
  if (!q) return text.slice(0, 140);
  const i = text.toLowerCase().indexOf(q);
  if (i < 0) return text.slice(0, 140);
  const start = Math.max(0, i - 50);
  return (start > 0 ? "…" : "") + text.slice(start, i + q.length + 90);
}

export default function NotesSearch({ notes, onOpen, onRemove }: { notes: Note[]; onOpen: (id: string) => void; onRemove: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE);
  if (notes.length === 0) return null;

  const q = query.trim().toLowerCase();
  const found = q
    ? notes.filter((n) => n.title.toLowerCase().includes(q) || plain(n.summary).toLowerCase().includes(q) || n.source.toLowerCase().includes(q))
    : notes;
  const shown = found.slice(0, limit);

  return (
    <section className="mt-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-semibold">Мои конспекты <span className="text-muted">({notes.length})</span></h2>
      </div>
      <div className="relative">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted">🔍</span>
        <input
          type="search"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setLimit(PAGE); }}
          placeholder="Поиск по конспектам: тема, термин, имя…"
          className="input pl-10"
        />
      </div>

      {found.length === 0 ? (
        <p className="mt-4 text-sm text-muted">Ничего не найдено по запросу «{query.trim()}».</p>
      ) : (
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {shown.map((n, i) => {
            const { emoji, text } = splitTitle(n.title);
            const progress = noteProgress(n);
            return (
            <li key={n.id} className="fade-up group relative" style={{ animationDelay: `${Math.min(i, 8) * 40}ms`, ["--c" as string]: noteColor(n.id) }}>
              <button type="button" onClick={() => onOpen(n.id)} className="card lift block h-full w-full overflow-hidden text-left hover:border-[var(--c)]">
                <div className="h-1.5" style={{ background: "linear-gradient(90deg, var(--c), color-mix(in srgb, var(--c) 40%, transparent))" }} />
                <div className="p-4">
                  <div className="flex items-start gap-3 pr-6">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-2xl" style={{ background: "color-mix(in srgb, var(--c) 18%, transparent)" }}>{emoji}</div>
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{text}</div>
                      <div className="mt-0.5 truncate text-xs text-muted">{new Date(n.createdAt).toLocaleDateString("ru-RU")} · {n.source}</div>
                    </div>
                  </div>
                  <div className="mt-3 line-clamp-2 text-sm text-muted">{snippet(n, q)}</div>
                  <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
                    {n.flashcards?.length ? <span className="badge">🃏 {n.flashcards.length}</span> : null}
                    {n.quiz?.length ? <span className="badge">✅ {n.quizBest !== undefined ? `${n.quizBest}%` : "тест"}</span> : null}
                    {progress !== null && (
                      <div className="progress ml-auto w-20" style={{ ["--accent" as string]: "var(--c)" }}><div style={{ width: `${progress}%` }} /></div>
                    )}
                  </div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => window.confirm(`Удалить конспект «${n.title}»?`) && onRemove(n.id)}
                className="absolute right-2 top-3.5 rounded-md px-2 text-lg text-muted opacity-60 hover:text-red-500 group-hover:opacity-100 sm:opacity-0"
                aria-label="Удалить конспект"
              >
                ×
              </button>
            </li>
            );
          })}
        </ul>
      )}
      {found.length > limit && (
        <button type="button" onClick={() => setLimit(limit + PAGE)} className="mt-3 w-full rounded-xl border border-line py-2 text-sm text-muted hover:text-foreground">
          Показать ещё ({found.length - limit})
        </button>
      )}
    </section>
  );
}

"use client";

import { useState } from "react";
import type { Note } from "@/lib/client";

const PAGE = 6;

/** Убирает разметку Markdown, чтобы показывать и искать по чистому тексту. */
function plain(md: string) {
  return md
    .replace(/[#>*_`|[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function snippet(note: Note, q: string) {
  const text = plain(note.summary);
  if (!q) return text.slice(0, 140);
  const i = text.toLowerCase().indexOf(q);
  if (i < 0) return text.slice(0, 140);
  const start = Math.max(0, i - 50);
  return (start > 0 ? "…" : "") + text.slice(start, i + q.length + 90);
}

export default function NotesSearch({ notes, onOpen }: { notes: Note[]; onOpen: (id: string) => void }) {
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
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">🔍</span>
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
          {shown.map((n) => (
            <li key={n.id}>
              <button type="button" onClick={() => onOpen(n.id)} className="card block h-full w-full p-4 text-left transition hover:border-accent">
                <div className="truncate font-medium">{n.title}</div>
                <div className="mt-0.5 text-xs text-muted">{new Date(n.createdAt).toLocaleDateString("ru-RU")} · {n.source}</div>
                <div className="mt-2 line-clamp-2 text-sm text-muted">{snippet(n, q)}</div>
              </button>
            </li>
          ))}
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

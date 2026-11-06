"use client";

import { useState } from "react";
import Icon from "./Icon";
import { plural, SUBJECT_COLORS, type Note, type Subject } from "@/lib/client";

/** Форма названия и цвета предмета: для создания и переименования. */
export function SubjectForm({ initial, onSave, onCancel }: { initial?: Subject; onSave: (name: string, color: string) => void; onCancel: () => void }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [color, setColor] = useState(initial?.color ?? SUBJECT_COLORS[0]);
  return (
    <form
      className="card pop-in flex flex-col gap-4 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) onSave(name.trim().slice(0, 80), color);
      }}
    >
      <div className="font-semibold">{initial ? "Изменить предмет" : "Новый предмет"}</div>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Название, например «Римское право»" className="input" autoFocus maxLength={80} />
      <div className="flex flex-wrap gap-2">
        {SUBJECT_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setColor(c)}
            className={`h-9 w-9 rounded-full transition ${color === c ? "scale-110 ring-2 ring-foreground ring-offset-2 ring-offset-surface" : "hover:scale-105"}`}
            style={{ background: c }}
            aria-label={`Цвет ${c}`}
          />
        ))}
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={!name.trim()} className="btn-primary !py-2.5">{initial ? "Сохранить" : "Создать"}</button>
        <button type="button" onClick={onCancel} className="btn-secondary">Отмена</button>
      </div>
    </form>
  );
}

/** Папка предмета. */
function Folder({ subject, count, onOpen, onEdit, onDelete }: { subject: Subject; count: number; onOpen: () => void; onEdit: () => void; onDelete: () => void }) {
  const [menu, setMenu] = useState(false);
  const c = subject.color;
  return (
    <div className="fade-up group relative">
      <button type="button" onClick={onOpen} className="lift relative block w-full text-left" aria-label={`Открыть предмет ${subject.name}`}>
        {/* вкладка папки */}
        <div className="ml-auto h-5 w-1/2 rounded-t-2xl" style={{ background: `color-mix(in srgb, ${c} 55%, var(--surface))` }} />
        <div
          className="relative flex h-32 flex-col justify-end overflow-hidden rounded-2xl rounded-tr-none p-4 shadow-sm sm:h-36"
          style={{ background: `linear-gradient(160deg, color-mix(in srgb, ${c} 70%, var(--surface)), color-mix(in srgb, ${c} 45%, var(--surface)))` }}
        >
          <div className="absolute inset-x-4 top-3 h-3 rounded-md bg-white/50" />
          <div className="truncate pr-10 text-lg font-semibold text-white drop-shadow-sm">{subject.name}</div>
          <div className="text-sm text-white/80">{count} {plural(count, "конспект", "конспекта", "конспектов")}</div>
        </div>
      </button>
      <button
        type="button"
        onClick={() => setMenu(!menu)}
        className="absolute bottom-4 right-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/25 text-white backdrop-blur transition hover:bg-white/40"
        aria-label="Действия с предметом"
      >
        •••
      </button>
      {menu && (
        <div className="card pop-in absolute bottom-14 right-2 z-10 flex w-44 flex-col p-1 text-sm shadow-lg">
          <button type="button" className="rounded-lg px-3 py-2 text-left hover:bg-foreground/5" onClick={() => { setMenu(false); onEdit(); }}>✏️ Переименовать</button>
          <button type="button" className="rounded-lg px-3 py-2 text-left text-red-500 hover:bg-red-500/10" onClick={() => { setMenu(false); onDelete(); }}>🗑️ Удалить</button>
        </div>
      )}
    </div>
  );
}

/** Сетка предметов с созданием, переименованием и удалением. */
export default function Subjects({
  subjects,
  notes,
  onOpen,
  onChange,
  toolbar,
}: {
  toolbar?: React.ReactNode;
  subjects: Subject[];
  notes: Note[];
  onOpen: (id: string) => void;
  onChange: (subjects: Subject[]) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Subject | null>(null);

  return (
    <div>
      <div className="mb-5 flex items-center gap-2">
        <div className="min-w-0 flex-1">{toolbar}</div>
        <button type="button" onClick={() => { setCreating(true); setEditing(null); }} className="btn-secondary flex shrink-0 items-center gap-2 rounded-full">
          <Icon name="plus" className="h-4 w-4" /><span className="hidden sm:inline">Создать предмет</span><span className="sm:hidden">Предмет</span>
        </button>
      </div>

      {(creating || editing) && (
        <div className="mb-5">
          <SubjectForm
            key={editing?.id ?? "new"}
            initial={editing ?? undefined}
            onCancel={() => { setCreating(false); setEditing(null); }}
            onSave={(name, color) => {
              if (editing) onChange(subjects.map((s) => (s.id === editing.id ? { ...s, name, color } : s)));
              else onChange([...subjects, { id: crypto.randomUUID(), name, color, createdAt: Date.now() }]);
              setCreating(false);
              setEditing(null);
            }}
          />
        </div>
      )}

      {subjects.length === 0 && !creating && (
        <div className="card p-8 text-center">
          <div className="text-4xl">📂</div>
          <div className="mt-2 font-semibold">Пока нет предметов</div>
          <p className="mt-1 text-sm text-muted">Создайте папку для каждого предмета и раскладывайте в неё конспекты.</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-6">
        {subjects.map((s) => (
          <Folder
            key={s.id}
            subject={s}
            count={notes.filter((n) => n.subjectId === s.id).length}
            onOpen={() => onOpen(s.id)}
            onEdit={() => { setEditing(s); setCreating(false); }}
            onDelete={() => window.confirm(`Удалить предмет «${s.name}»? Конспекты останутся, просто без папки.`) && onChange(subjects.filter((x) => x.id !== s.id))}
          />
        ))}
      </div>
    </div>
  );
}

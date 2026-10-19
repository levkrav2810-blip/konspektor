"use client";

import { useRef, useState } from "react";
import Recorder from "./Recorder";

export type Material =
  | { kind: "audio"; blob: Blob; name: string; source: string }
  | { kind: "text"; text: string; source: string }
  | { kind: "file"; file: File; source: string }
  | { kind: "link"; url: string; source: string };

const TABS = [
  { id: "voice", label: "Диктофон", icon: "🎙️" },
  { id: "file", label: "Файл", icon: "📄" },
  { id: "link", label: "Ссылка", icon: "🔗" },
  { id: "text", label: "Текст", icon: "✍️" },
] as const;

type Tab = (typeof TABS)[number]["id"];

export default function InputPanel({ busy, onSubmit }: { busy: boolean; onSubmit: (m: Material, wishes: string) => void }) {
  const [tab, setTab] = useState<Tab>("voice");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [wishes, setWishes] = useState("");
  const [drag, setDrag] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  function submit() {
    if (tab === "text" && text.trim()) onSubmit({ kind: "text", text, source: "текст" }, wishes);
    if (tab === "link" && url.trim()) onSubmit({ kind: "link", url: url.trim(), source: url.trim() }, wishes);
    if (tab === "file" && file) onSubmit({ kind: "file", file, source: file.name }, wishes);
  }

  const canSubmit = !busy && ((tab === "text" && text.trim().length > 20) || (tab === "link" && url.trim()) || (tab === "file" && file));

  return (
    <div className="card overflow-hidden">
      <div className="flex border-b border-line">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`flex-1 px-2 py-3.5 text-sm font-medium transition sm:text-base ${tab === t.id ? "border-b-2 border-accent text-accent" : "text-muted hover:text-foreground"}`}
          >
            <span className="mr-1.5">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      <div className="p-5 sm:p-6">
        {tab === "voice" && (
          <Recorder disabled={busy} onDone={(blob) => onSubmit({ kind: "audio", blob, name: "recording.webm", source: "запись диктофона" }, wishes)} />
        )}

        {tab === "file" && (
          <div
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]); }}
            onClick={() => fileInput.current?.click()}
            className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 py-12 text-center transition ${drag ? "border-accent bg-accent/5" : "border-line hover:border-accent/60"}`}
          >
            <input
              ref={fileInput}
              type="file"
              hidden
              accept="audio/*,video/*,.pdf,.docx,.txt,.md,.srt,.vtt,image/*"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
            <div className="text-4xl">📂</div>
            {file ? (
              <div className="font-medium">{file.name} <span className="text-muted">({(file.size / 1024 / 1024).toFixed(1)} МБ)</span></div>
            ) : (
              <div className="font-medium">Перетащите файл сюда или нажмите, чтобы выбрать</div>
            )}
            <div className="text-sm text-muted">Аудио и видео (mp3, m4a, wav, mp4…), PDF, Word, TXT, фото слайда или страницы</div>
          </div>
        )}

        {tab === "link" && (
          <div className="flex flex-col gap-2">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://… статья, YouTube-видео, PDF"
              className="input"
              onKeyDown={(e) => e.key === "Enter" && canSubmit && submit()}
            />
            <p className="text-sm text-muted">Подойдёт статья, страница Википедии, видео с YouTube (по субтитрам) или ссылка на PDF.</p>
          </div>
        )}

        {tab === "text" && (
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Вставьте текст лекции, расшифровку или главу учебника…"
            rows={10}
            className="input resize-y"
          />
        )}

        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <input
            value={wishes}
            onChange={(e) => setWishes(e.target.value)}
            placeholder="Пожелания (необязательно): например, «подробнее про формулы» или «на английском»"
            className="input flex-1 text-sm"
          />
          {tab !== "voice" && (
            <button type="button" disabled={!canSubmit} onClick={submit} className="btn-primary whitespace-nowrap">
              ✨ Сделать конспект
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

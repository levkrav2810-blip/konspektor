"use client";

import { useEffect, useRef, useState } from "react";
import Icon from "./Icon";
import Markdown from "./Markdown";
import { postStream, type ChatMessage } from "@/lib/client";

const NOTE_SUGGESTIONS = ["Объясни главное простыми словами", "Какие вопросы могут быть на экзамене?", "Приведи пример из практики", "Что здесь самое сложное?"];
const FREE_SUGGESTIONS = ["Объясни, что такое правоспособность", "Составь план подготовки к экзамену", "Помоги написать эссе", "Переведи текст на английский"];

/**
 * Чат с нейросетью. С summary — по конспекту (переписка хранится в нём), без него — на любые вопросы.
 * update получает функцию от самой свежей переписки, потому что ответ приходит не сразу.
 */
export default function ChatPanel({
  messages,
  update,
  summary,
  onClose,
}: {
  messages: ChatMessage[];
  update: (fn: (m: ChatMessage[]) => ChatMessage[]) => void;
  summary?: string;
  onClose?: () => void;
}) {
  const SUGGESTIONS = summary ? NOTE_SUGGESTIONS : FREE_SUGGESTIONS;
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages.length, streaming]);

  async function ask(text: string) {
    const q = text.trim();
    if (!q || streaming !== null) return;
    setInput("");
    setError(null);
    const next: ChatMessage[] = [...messages, { role: "user", content: q }];
    update(() => next);
    setStreaming("");
    try {
      const answer = await postStream("/api/chat", { summary, messages: next }, setStreaming);
      update((m) => [...m, { role: "assistant", content: answer }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setStreaming(null);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-line p-4">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-accent to-violet-500 text-xl">🦉</span>
        <div className="min-w-0 flex-1">
          <div className="font-semibold leading-tight">{summary ? "Спроси по теме" : "Чат с нейросетью"}</div>
          <div className="text-xs text-muted">{summary ? "Нейросеть знает этот конспект" : "Отвечает на любые вопросы"}</div>
        </div>
        {messages.length > 0 && (
          <button type="button" onClick={() => window.confirm("Очистить переписку?") && update(() => [])} className="btn-ghost text-xs" disabled={streaming !== null}>
            Очистить
          </button>
        )}
        {onClose && <button type="button" onClick={onClose} className="btn-icon" aria-label="Закрыть чат"><Icon name="close" /></button>}
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <div className="flex gap-2.5">
          <span className="mt-0.5 text-lg">🦉</span>
          <div className="rounded-2xl rounded-tl-sm bg-background px-3.5 py-2.5 text-sm leading-relaxed">
            {summary
              ? "Привет! Спрашивай что угодно по этому конспекту: объясню сложные места, приведу примеры и помогу подготовиться к экзамену."
              : "Привет! Я помогу с учёбой: объясню тему, составлю план ответа, проверю текст или переведу. Спрашивай что угодно."}
          </div>
        </div>
        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="ml-8 flex justify-end">
              <div className="rounded-2xl rounded-tr-sm bg-accent px-3.5 py-2.5 text-sm text-white">{m.content}</div>
            </div>
          ) : (
            <div key={i} className="flex gap-2.5">
              <span className="mt-0.5 text-lg">🦉</span>
              <div className="chat-md min-w-0 rounded-2xl rounded-tl-sm bg-background px-3.5 py-2.5 text-sm"><Markdown>{m.content}</Markdown></div>
            </div>
          ),
        )}
        {streaming !== null && (
          <div className="flex gap-2.5">
            <span className="mt-0.5 text-lg">🦉</span>
            <div className="chat-md min-w-0 rounded-2xl rounded-tl-sm bg-background px-3.5 py-2.5 text-sm">
              {streaming ? <Markdown>{streaming}</Markdown> : <span className="inline-flex gap-1"><span className="h-2 w-2 animate-bounce rounded-full bg-muted" /><span className="h-2 w-2 animate-bounce rounded-full bg-muted [animation-delay:150ms]" /><span className="h-2 w-2 animate-bounce rounded-full bg-muted [animation-delay:300ms]" /></span>}
            </div>
          </div>
        )}
        {error && <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-500">{error}</div>}
        <div ref={bottom} />
      </div>

      {messages.length === 0 && (
        <div className="flex flex-wrap gap-2 px-4 pb-2">
          {SUGGESTIONS.map((s) => (
            <button key={s} type="button" onClick={() => ask(s)} className="btn-chip shrink-0 !text-xs">{s}</button>
          ))}
        </div>
      )}

      <form className="border-t border-line p-3" onSubmit={(e) => { e.preventDefault(); ask(input); }}>
        <div className="flex items-end gap-2 rounded-2xl border border-line bg-background p-2 focus-within:border-accent">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                ask(input);
              }
            }}
            rows={1}
            placeholder="Напиши вопрос…"
            className="max-h-32 min-h-[2.25rem] flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none"
          />
          <button type="submit" disabled={!input.trim() || streaming !== null} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-white transition hover:brightness-110 disabled:opacity-40" aria-label="Отправить">
            <Icon name="send" className="h-4 w-4" />
          </button>
        </div>
      </form>
    </div>
  );
}

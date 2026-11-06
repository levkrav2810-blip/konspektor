"use client";

import { useEffect, useState } from "react";
import type { Flashcard } from "@/lib/client";

export default function Flashcards({ cards, onKnown, best }: { cards: Flashcard[]; onKnown?: (count: number) => void; best?: number }) {
  const [order, setOrder] = useState(() => cards.map((_, i) => i));
  const [pos, setPos] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [known, setKnown] = useState<Set<number>>(new Set());

  const idx = order[pos];

  useEffect(() => {
    if (known.size) onKnown?.(known.size);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [known]);
  const card = cards[idx];

  function go(delta: number) {
    setFlipped(false);
    setPos((p) => (p + delta + order.length) % order.length);
  }

  function mark(isKnown: boolean) {
    setKnown((prev) => {
      const next = new Set(prev);
      if (isKnown) next.add(idx);
      else next.delete(idx);
      return next;
    });
    go(1);
  }

  function shuffle() {
    const next = [...order];
    for (let i = next.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [next[i], next[j]] = [next[j], next[i]];
    }
    setOrder(next);
    setPos(0);
    setFlipped(false);
  }

  return (
    <div className="flex flex-col items-center gap-5">
      <div className="flex w-full flex-col gap-2">
        <div className="flex items-center justify-between text-sm text-muted">
          <span>Карточка {pos + 1} из {cards.length}</span>
          <span className="font-medium text-emerald-500">✓ Выучено: {known.size} / {cards.length}{best ? <span className="font-normal text-muted"> · рекорд {best}</span> : null}</span>
          <button type="button" onClick={shuffle} className="link">🔀 Перемешать</button>
        </div>
        <div className="progress progress-green"><div style={{ width: `${(known.size / cards.length) * 100}%` }} /></div>
      </div>
      <button
        type="button"
        onClick={() => setFlipped((f) => !f)}
        className="flip w-full max-w-xl"
        aria-label="Перевернуть карточку"
      >
        <div className={`flip-inner relative h-64 ${flipped ? "flipped" : ""}`}>
          <div className="flip-face card flex items-center justify-center p-8 text-center text-xl font-semibold" style={{ background: "linear-gradient(160deg, color-mix(in srgb, var(--accent) 14%, var(--surface)), var(--surface))" }}>
            {card.front}
          </div>
          <div className="flip-face flip-back card flex items-center justify-center bg-emerald-500/5 p-8 text-center text-lg">
            {card.back}
          </div>
        </div>
      </button>
      <p className="text-xs text-muted">Нажмите на карточку, чтобы перевернуть</p>
      <div className="flex flex-wrap justify-center gap-3">
        <button type="button" onClick={() => go(-1)} className="btn-secondary">← Назад</button>
        <button type="button" onClick={() => mark(false)} className="btn-secondary hover:!border-orange-500/60">🤔 Не помню</button>
        <button type="button" onClick={() => mark(true)} className="btn-primary !bg-emerald-600">✓ Знаю</button>
        <button type="button" onClick={() => go(1)} className="btn-secondary">Далее →</button>
      </div>
    </div>
  );
}

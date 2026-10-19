"use client";

import { useState } from "react";
import type { Flashcard } from "@/lib/client";

export default function Flashcards({ cards }: { cards: Flashcard[] }) {
  const [order, setOrder] = useState(() => cards.map((_, i) => i));
  const [pos, setPos] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [known, setKnown] = useState<Set<number>>(new Set());

  const idx = order[pos];
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
      <div className="flex w-full items-center justify-between text-sm text-muted">
        <span>Карточка {pos + 1} из {cards.length}</span>
        <span>Выучено: {known.size} / {cards.length}</span>
        <button type="button" onClick={shuffle} className="link">Перемешать</button>
      </div>
      <button
        type="button"
        onClick={() => setFlipped((f) => !f)}
        className="flip w-full max-w-xl"
        aria-label="Перевернуть карточку"
      >
        <div className={`flip-inner relative h-64 ${flipped ? "flipped" : ""}`}>
          <div className="flip-face card flex items-center justify-center p-8 text-center text-xl font-semibold">
            {card.front}
          </div>
          <div className="flip-face flip-back card flex items-center justify-center bg-accent/5 p-8 text-center text-lg">
            {card.back}
          </div>
        </div>
      </button>
      <p className="text-xs text-muted">Нажмите на карточку, чтобы перевернуть</p>
      <div className="flex flex-wrap justify-center gap-3">
        <button type="button" onClick={() => go(-1)} className="btn-secondary">← Назад</button>
        <button type="button" onClick={() => mark(false)} className="btn-secondary">Не помню</button>
        <button type="button" onClick={() => mark(true)} className="btn-primary">Знаю</button>
        <button type="button" onClick={() => go(1)} className="btn-secondary">Далее →</button>
      </div>
    </div>
  );
}

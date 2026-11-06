"use client";

import { useState } from "react";
import type { GameItem } from "@/lib/client";

type Tile = { id: string; pair: number; text: string; kind: "q" | "a" };

function deal(items: GameItem[]): Tile[] {
  const picked = [...items].sort(() => Math.random() - 0.5).slice(0, 6);
  const tiles = picked.flatMap((it, i) => [
    { id: `q${i}`, pair: i, text: it.question, kind: "q" as const },
    { id: `a${i}`, pair: i, text: it.correct, kind: "a" as const },
  ]);
  return tiles.sort(() => Math.random() - 0.5);
}

/** «Найди пару»: соединить вопрос с ответом. */
export default function MatchGame({ items }: { items: GameItem[] }) {
  const [tiles, setTiles] = useState(() => deal(items));
  const [picked, setPicked] = useState<Tile | null>(null);
  const [done, setDone] = useState<Set<number>>(new Set());
  const [wrong, setWrong] = useState<string[]>([]);
  const [moves, setMoves] = useState(0);
  const pairs = tiles.length / 2;

  function click(t: Tile) {
    if (done.has(t.pair) || wrong.length) return;
    if (!picked) return setPicked(t);
    if (picked.id === t.id) return setPicked(null);
    setMoves((m) => m + 1);
    if (picked.pair === t.pair && picked.kind !== t.kind) {
      setDone(new Set(done).add(t.pair));
      setPicked(null);
    } else {
      setWrong([picked.id, t.id]);
      setTimeout(() => { setWrong([]); setPicked(null); }, 700);
    }
  }

  const finished = done.size === pairs;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between text-sm text-muted">
        <span>Соедините вопрос с ответом</span>
        <span>Пар: {done.size}/{pairs} · ходов: {moves}</span>
      </div>
      {finished ? (
        <div className="card pop-in flex flex-col items-center gap-3 p-8 text-center">
          <div className="text-5xl">🎯</div>
          <div className="text-xl font-bold">Все пары найдены за {moves} {moves === pairs ? "ходов — идеально!" : "ходов"}</div>
          <button type="button" onClick={() => { setTiles(deal(items)); setDone(new Set()); setMoves(0); }} className="btn-primary">Сыграть ещё</button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {tiles.map((t) => {
            const isDone = done.has(t.pair);
            const isPicked = picked?.id === t.id;
            const isWrong = wrong.includes(t.id);
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => click(t)}
                className={`min-h-24 rounded-2xl border-2 p-3 text-sm font-medium transition ${
                  isDone ? "scale-95 border-emerald-500/50 bg-emerald-500/10 opacity-50" : isWrong ? "border-red-500 bg-red-500/10" : isPicked ? "border-accent bg-accent/10" : t.kind === "a" ? "border-line bg-violet-500/10 hover:border-accent/60" : "border-line bg-surface hover:border-accent/60"
                }`}
              >
                {t.text}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

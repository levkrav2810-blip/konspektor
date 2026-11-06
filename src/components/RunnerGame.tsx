"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GameItem } from "@/lib/client";

/** Подготовленный раунд: вопрос и три ответа по дорожкам. */
type Round = { question: string; answers: string[]; correct: number };

function shuffle<T>(a: T[]) {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

function makeRounds(items: GameItem[]): Round[] {
  return shuffle(items).map((it) => {
    const answers = shuffle([it.correct, ...it.wrong.slice(0, 2)]);
    return { question: it.question, answers, correct: answers.indexOf(it.correct) };
  });
}

const LANES = [-1, 0, 1];
const START_MS = 6500; // за сколько ворота доезжают до игрока на первом вопросе
const MIN_MS = 3200;

/**
 * «Забег знаний»: игрок бежит по трём дорожкам, навстречу едут ворота с ответами.
 * Нужно перестроиться на дорожку с правильным ответом. Управление: ← → / A D, свайп или кнопки.
 */
export default function RunnerGame({ items, best, onScore, onRedo }: { items: GameItem[]; best?: number; onScore: (score: number) => void; onRedo: () => void }) {
  const [state, setState] = useState<"intro" | "run" | "result" | "over">("intro");
  const [rounds, setRounds] = useState<Round[]>(() => makeRounds(items));
  const [idx, setIdx] = useState(0);
  const [lane, setLane] = useState(1);
  const [t, setT] = useState(0);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [lives, setLives] = useState(3);
  const [flash, setFlash] = useState<"ok" | "bad" | null>(null);
  const laneRef = useRef(1);
  const raf = useRef(0);
  const touchX = useRef<number | null>(null);

  const round = rounds[idx % rounds.length];
  const duration = Math.max(MIN_MS, START_MS - idx * 250);

  const move = useCallback((d: number) => {
    setLane((l) => {
      const n = Math.min(2, Math.max(0, l + d));
      laneRef.current = n;
      return n;
    });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (state !== "run") return;
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "ф") { e.preventDefault(); move(-1); }
      if (e.key === "ArrowRight" || e.key === "d" || e.key === "в") { e.preventDefault(); move(1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, move]);

  // движение ворот к игроку
  useEffect(() => {
    if (state !== "run") return;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      setT(p);
      if (p < 1) {
        raf.current = requestAnimationFrame(tick);
        return;
      }
      const ok = laneRef.current === round.correct;
      setFlash(ok ? "ok" : "bad");
      if (ok) {
        setCombo((c) => c + 1);
        setScore((s) => s + 10 + combo * 5);
      } else {
        setCombo(0);
        setLives((l) => l - 1);
      }
      setState("result");
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, idx]);

  // пауза после ворот: показываем правильный ответ, потом следующий вопрос
  useEffect(() => {
    if (state !== "result") return;
    const timer = setTimeout(() => {
      setFlash(null);
      setT(0);
      if (lives <= 0 || idx + 1 >= rounds.length) {
        setState("over");
        onScore(score);
      } else {
        setIdx((i) => i + 1);
        setState("run");
      }
    }, flash === "ok" ? 700 : 1600);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  function restart() {
    setRounds(makeRounds(items));
    setIdx(0);
    setScore(0);
    setCombo(0);
    setLives(3);
    setLane(1);
    laneRef.current = 1;
    setT(0);
    setFlash(null);
    setState("run");
  }

  // ложная перспектива: чем ближе ворота (t → 1), тем ниже и крупнее
  const ease = t * t;
  const gateY = 8 + ease * 64; // % от высоты сцены
  const gateScale = 0.38 + ease * 0.72;

  return (
    <div className="flex flex-col items-center gap-4">
      <div
        className="relative h-[440px] w-full max-w-2xl select-none overflow-hidden rounded-3xl border border-line sm:h-[520px]"
        style={{ background: "linear-gradient(180deg, #0b1b4a 0%, #312e81 38%, #1e1b4b 39%, #0f172a 100%)" }}
        onTouchStart={(e) => { touchX.current = e.touches[0].clientX; }}
        onTouchEnd={(e) => {
          if (touchX.current === null || state !== "run") return;
          const dx = e.changedTouches[0].clientX - touchX.current;
          if (Math.abs(dx) > 30) move(dx > 0 ? 1 : -1);
          touchX.current = null;
        }}
      >
        {/* звёзды и дорога */}
        <div className="absolute inset-x-0 top-0 h-[38%] opacity-60" style={{ backgroundImage: "radial-gradient(1px 1px at 20% 30%, white, transparent), radial-gradient(1px 1px at 70% 20%, white, transparent), radial-gradient(1.5px 1.5px at 45% 60%, white, transparent), radial-gradient(1px 1px at 85% 70%, white, transparent)" }} />
        <div
          className={`runner-road absolute inset-x-0 bottom-0 top-[38%] ${state === "run" ? "running" : ""}`}
          style={{ clipPath: "polygon(42% 0, 58% 0, 100% 100%, 0 100%)" }}
        />
        {/* разделители дорожек */}
        {[1, 2].map((k) => (
          <div key={k} className="absolute bottom-0 top-[38%] w-full" style={{ clipPath: `polygon(${42 + (16 / 3) * k - 0.25}% 0, ${42 + (16 / 3) * k + 0.25}% 0, ${(100 / 3) * k + 0.6}% 100%, ${(100 / 3) * k - 0.6}% 100%)`, background: "rgba(255,255,255,.35)" }} />
        ))}

        {/* табло */}
        <div className="absolute inset-x-0 top-0 flex items-center justify-between p-3 text-white">
          <span className="rounded-full bg-black/30 px-3 py-1 text-sm font-bold">⭐ {score}</span>
          {combo > 1 && <span className="pop-in rounded-full bg-amber-400 px-3 py-1 text-sm font-bold text-black">Комбо ×{combo}</span>}
          <span className="rounded-full bg-black/30 px-3 py-1 text-sm">{"❤️".repeat(Math.max(0, lives))}{"🖤".repeat(Math.max(0, 3 - lives))}</span>
        </div>

        {(state === "run" || state === "result") && (
          <>
            <div className="absolute inset-x-4 top-14 rounded-2xl bg-white/95 px-4 py-3 text-center font-semibold leading-snug text-slate-900 shadow-lg">
              {round.question}
            </div>
            {/* ворота с ответами */}
            {round.answers.map((a, k) => {
              const x = 50 + LANES[k] * (10 + ease * 23);
              const reveal = state === "result";
              const isCorrect = k === round.correct;
              return (
                <div
                  key={k}
                  className="absolute"
                  style={{ left: `${x}%`, top: `${gateY + 12}%`, transform: `translateX(-50%) scale(${gateScale})`, transformOrigin: "top center", width: "26%" }}
                >
                  <div className={`rounded-xl border-4 px-1.5 py-3 text-center text-sm font-bold leading-tight [overflow-wrap:anywhere] shadow-xl sm:text-base ${reveal ? (isCorrect ? "border-emerald-300 bg-emerald-500 text-white" : "border-red-300 bg-red-500/80 text-white") : "border-white/80 bg-violet-600 text-white"}`}>
                    {a}
                  </div>
                </div>
              );
            })}
          </>
        )}

        {/* игрок */}
        {state !== "intro" && state !== "over" && (
          <div className="absolute bottom-[6%] transition-all duration-150" style={{ left: `${50 + LANES[lane] * 33}%`, transform: "translateX(-50%)" }}>
            <div className={`text-5xl drop-shadow-lg sm:text-6xl ${state === "run" ? "runner-bob" : ""}`}>🦉</div>
          </div>
        )}
        {flash && <div className={`pointer-events-none absolute inset-0 ${flash === "ok" ? "bg-emerald-400/20" : "bg-red-500/25"}`} />}

        {state === "intro" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/40 p-6 text-center text-white">
            <div className="text-6xl">🏃‍♂️🦉</div>
            <div className="text-2xl font-extrabold">Забег знаний</div>
            <p className="max-w-sm text-white/80">Навстречу едут ворота с ответами. Перебеги на дорожку с правильным ответом: стрелки ← →, свайп или кнопки внизу. Три ошибки — конец забега.</p>
            <button type="button" onClick={restart} className="btn-primary !px-8 !py-3.5 text-lg">Старт</button>
            {best ? <div className="text-sm text-white/70">Рекорд: {best}</div> : null}
          </div>
        )}
        {state === "over" && (
          <div className="pop-in absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/55 p-6 text-center text-white">
            <div className="text-6xl">{lives > 0 ? "🏆" : "💥"}</div>
            <div className="text-2xl font-extrabold">{lives > 0 ? "Финиш!" : "Забег окончен"}</div>
            <div className="text-lg">Очки: <b>{score}</b></div>
            <div className="text-sm text-white/70">{score > (best ?? 0) ? "Новый рекорд! 🎉" : `Рекорд: ${best ?? 0}`}</div>
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={restart} className="btn-primary">Ещё раз</button>
              <button type="button" onClick={onRedo} className="btn-secondary !text-foreground">Новые вопросы</button>
            </div>
          </div>
        )}
      </div>

      {state === "run" && (
        <div className="flex gap-3">
          <button type="button" onClick={() => move(-1)} className="btn-secondary !px-8 text-xl" aria-label="Влево">←</button>
          <button type="button" onClick={() => move(1)} className="btn-secondary !px-8 text-xl" aria-label="Вправо">→</button>
        </div>
      )}
      <p className="text-xs text-muted">Вопрос {Math.min(idx + 1, rounds.length)} из {rounds.length}</p>
    </div>
  );
}

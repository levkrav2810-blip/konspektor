"use client";

import { useEffect, useRef, useState } from "react";
import type { Slide } from "@/lib/client";

const THEMES = [
  "linear-gradient(135deg, #1e3a8a, #6d28d9)",
  "linear-gradient(135deg, #0f766e, #1d4ed8)",
  "linear-gradient(135deg, #9d174d, #7c3aed)",
  "linear-gradient(135deg, #b45309, #be123c)",
];

function SlideCard({ slide, index, total }: { slide: Slide; index: number; total: number }) {
  const first = index === 0;
  return (
    <div className="relative flex aspect-video w-full flex-col overflow-hidden rounded-2xl p-[5%] text-white shadow-xl" style={{ background: THEMES[index % THEMES.length] }}>
      <div className="pointer-events-none absolute -right-[10%] -top-[20%] h-[70%] w-[45%] rounded-full bg-white/10 blur-2xl" />
      {first ? (
        <div className="m-auto text-center">
          <div className="text-[clamp(2rem,7vw,5rem)]">{slide.emoji}</div>
          <h2 className="mt-2 text-[clamp(1.3rem,3.6vw,2.8rem)] font-extrabold leading-tight">{slide.title}</h2>
          {slide.bullets[0] && <p className="mt-3 text-[clamp(0.8rem,1.6vw,1.2rem)] text-white/80">{slide.bullets[0]}</p>}
        </div>
      ) : (
        <>
          <h2 className="flex items-center gap-3 text-[clamp(1.1rem,2.8vw,2.2rem)] font-bold leading-tight">
            <span>{slide.emoji}</span>
            {slide.title}
          </h2>
          <ul className="mt-[4%] flex flex-col gap-[2.5%] text-[clamp(0.75rem,1.7vw,1.3rem)] leading-snug">
            {slide.bullets.map((b, i) => (
              <li key={i} className="flex gap-3">
                <span className="mt-[0.45em] h-2 w-2 shrink-0 rounded-full bg-white/80" />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="absolute bottom-[4%] right-[4%] text-[clamp(0.6rem,1.1vw,0.85rem)] text-white/60">{index + 1} / {total}</div>
    </div>
  );
}

/** Просмотр презентации: листание, полный экран, печать в PDF. */
export default function Slides({ slides, onRedo }: { slides: Slide[]; onRedo: () => void }) {
  const [i, setI] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const go = (d: number) => setI((x) => Math.min(slides.length - 1, Math.max(0, x + d)));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowRight" || e.key === " ") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div>
      <div className="no-print">
        <div ref={box} className="flex items-center justify-center bg-background [&:fullscreen]:p-8">
          <div className="w-full max-w-5xl">
            <SlideCard slide={slides[i]} index={i} total={slides.length} />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <button type="button" onClick={() => go(-1)} disabled={i === 0} className="btn-secondary">← Назад</button>
          <span className="w-16 text-center text-sm text-muted">{i + 1} / {slides.length}</span>
          <button type="button" onClick={() => go(1)} disabled={i === slides.length - 1} className="btn-primary">Далее →</button>
        </div>
        <div className="mt-3 flex flex-wrap justify-center gap-1">
          <button type="button" onClick={() => box.current?.requestFullscreen?.()} className="btn-ghost">⛶ На весь экран</button>
          <button type="button" onClick={() => window.print()} className="btn-ghost">PDF / печать</button>
          <button type="button" onClick={onRedo} className="btn-ghost">Сделать заново</button>
        </div>
        <div className="mt-5 flex gap-2 overflow-x-auto pb-2">
          {slides.map((s, k) => (
            <button key={k} type="button" onClick={() => setI(k)} className={`w-36 shrink-0 rounded-xl transition ${k === i ? "ring-2 ring-accent ring-offset-2 ring-offset-background" : "opacity-70 hover:opacity-100"}`}>
              <div className="pointer-events-none">
                <div className="flex aspect-video flex-col justify-center rounded-xl p-2 text-left text-[10px] font-semibold leading-tight text-white" style={{ background: THEMES[k % THEMES.length] }}>
                  <span className="text-base">{s.emoji}</span>
                  <span className="line-clamp-2">{s.title}</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
      {/* для печати: все слайды подряд, по одному на страницу */}
      <div className="print-only">
        {slides.map((s, k) => (
          <div key={k} className="print-page">
            <SlideCard slide={s} index={k} total={slides.length} />
          </div>
        ))}
      </div>
    </div>
  );
}

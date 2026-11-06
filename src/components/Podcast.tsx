"use client";

import { useEffect, useRef, useState } from "react";
import type { PodcastLine } from "@/lib/client";

const HOSTS = { A: { name: "Аня", emoji: "👩‍🎤", color: "#ec4899" }, B: { name: "Борис", emoji: "👨‍🏫", color: "#3b7bff" } };

/** Подкаст: сценарий двух ведущих, озвученный голосами браузера. */
export default function Podcast({ lines, onRedo }: { lines: PodcastLine[]; onRedo: () => void }) {
  const [current, setCurrent] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const [rate, setRate] = useState(1.1);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const playing = useRef(false);
  // язык озвучки по самому тексту: кириллица — русский, иначе английский
  const lang = /[а-яё]/i.test(lines.map((l) => l.text).join(" ")) ? "ru" : "en";
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;

  useEffect(() => {
    if (!supported) return;
    const load = () => setVoices(speechSynthesis.getVoices());
    load();
    speechSynthesis.addEventListener("voiceschanged", load);
    return () => {
      speechSynthesis.removeEventListener("voiceschanged", load);
      speechSynthesis.cancel();
    };
  }, [supported]);

  // два разных голоса нужного языка, если они есть в системе
  const local = voices.filter((v) => v.lang.toLowerCase().startsWith(lang));
  const voiceFor = (s: "A" | "B") => {
    if (!local.length) return undefined;
    const female = local.find((v) => /milena|alena|female|женск|irina|anna|kat/i.test(v.name));
    const male = local.find((v) => v !== female && /yuri|male|муж|pavel|dmitr|maxim/i.test(v.name)) || local.find((v) => v !== female);
    return s === "A" ? female || local[0] : male || local[local.length - 1];
  };

  function speakFrom(i: number) {
    if (!supported) return;
    speechSynthesis.cancel();
    playing.current = true;
    setPaused(false);
    const say = (k: number) => {
      if (!playing.current || k >= lines.length) {
        playing.current = false;
        setCurrent(null);
        return;
      }
      setCurrent(k);
      const u = new SpeechSynthesisUtterance(lines[k].text);
      const v = voiceFor(lines[k].speaker);
      if (v) u.voice = v;
      u.lang = v?.lang || (lang === "ru" ? "ru-RU" : "en-US");
      u.rate = rate;
      u.pitch = lines[k].speaker === "A" ? 1.15 : 0.9;
      u.onend = () => say(k + 1);
      speechSynthesis.speak(u);
    };
    say(i);
  }

  function stop() {
    playing.current = false;
    speechSynthesis.cancel();
    setCurrent(null);
    setPaused(false);
  }

  function togglePause() {
    if (paused) speechSynthesis.resume();
    else speechSynthesis.pause();
    setPaused(!paused);
  }

  const progress = current === null ? 0 : ((current + 1) / lines.length) * 100;

  return (
    <div className="flex flex-col gap-4">
      <div className="card overflow-hidden p-5" style={{ background: "linear-gradient(135deg, color-mix(in srgb, #8b5cf6 25%, var(--surface)), var(--surface))" }}>
        <div className="flex items-center gap-4">
          <div className="flex -space-x-3 text-3xl">
            <span className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-surface bg-pink-500/30">{HOSTS.A.emoji}</span>
            <span className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-surface bg-blue-500/30">{HOSTS.B.emoji}</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-semibold">Подкаст по конспекту</div>
            <div className="text-sm text-muted">{lines.length} реплик · {HOSTS.A.name} и {HOSTS.B.name}</div>
          </div>
        </div>
        <div className="progress mt-4"><div style={{ width: `${progress}%` }} /></div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {current === null ? (
            <button type="button" onClick={() => speakFrom(0)} disabled={!supported} className="btn-primary">▶ Слушать</button>
          ) : (
            <>
              <button type="button" onClick={togglePause} className="btn-primary">{paused ? "▶ Продолжить" : "⏸ Пауза"}</button>
              <button type="button" onClick={stop} className="btn-secondary">⏹ Стоп</button>
            </>
          )}
          <label className="ml-auto flex items-center gap-2 text-sm text-muted">
            Скорость
            <select value={rate} onChange={(e) => setRate(Number(e.target.value))} className="input !w-auto !rounded-full !py-1.5 text-sm text-foreground">
              {[0.9, 1, 1.1, 1.25, 1.5].map((r) => <option key={r} value={r}>{r}×</option>)}
            </select>
          </label>
          <button type="button" onClick={onRedo} className="btn-ghost">Сделать заново</button>
        </div>
        {!supported && <p className="mt-3 text-sm text-muted">Этот браузер не умеет озвучивать текст. Откройте сайт в Safari или Chrome.</p>}
        {supported && voices.length > 0 && !local.length && <p className="mt-3 text-sm text-muted">В системе нет русского голоса, озвучка может звучать с акцентом.</p>}
      </div>

      <div className="flex flex-col gap-2.5">
        {lines.map((l, i) => {
          const h = HOSTS[l.speaker];
          return (
            <button
              key={i}
              type="button"
              onClick={() => speakFrom(i)}
              className={`flex gap-3 rounded-2xl border p-3.5 text-left transition ${current === i ? "border-accent bg-accent/10" : "border-line bg-surface hover:border-accent/50"}`}
            >
              <span className="text-2xl">{h.emoji}</span>
              <span className="min-w-0">
                <span className="block text-xs font-semibold" style={{ color: h.color }}>{h.name}</span>
                <span className="block leading-relaxed">{l.text}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

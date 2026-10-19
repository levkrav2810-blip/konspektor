"use client";

import { useEffect, useRef, useState } from "react";

function fmt(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function Recorder({ onDone, disabled }: { onDone: (blob: Blob) => void; disabled?: boolean }) {
  const [state, setState] = useState<"idle" | "recording" | "paused">("idle");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

  useEffect(() => {
    if (state !== "recording") return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [state]);

  async function start() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunks.current = [];
      rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        onDone(new Blob(chunks.current, { type: rec.mimeType || "audio/webm" }));
      };
      rec.start(1000);
      recorder.current = rec;
      setSeconds(0);
      setState("recording");
    } catch {
      setError("Нет доступа к микрофону. Разрешите его в настройках браузера.");
    }
  }

  function togglePause() {
    const rec = recorder.current;
    if (!rec) return;
    if (state === "recording") {
      rec.pause();
      setState("paused");
    } else {
      rec.resume();
      setState("recording");
    }
  }

  function stop() {
    recorder.current?.stop();
    recorder.current = null;
    setState("idle");
  }

  return (
    <div className="flex flex-col items-center gap-5 py-6">
      <div className={`relative flex h-28 w-28 items-center justify-center rounded-full ${state === "recording" ? "bg-red-500/15" : "bg-accent/10"}`}>
        {state === "recording" && <span className="absolute inset-0 animate-ping rounded-full bg-red-500/20" />}
        <button
          type="button"
          disabled={disabled}
          onClick={state === "idle" ? start : stop}
          className={`relative h-20 w-20 rounded-full text-white shadow-lg transition disabled:opacity-50 ${state === "idle" ? "bg-accent hover:brightness-110" : "bg-red-500 hover:bg-red-600"}`}
          aria-label={state === "idle" ? "Начать запись" : "Остановить запись"}
        >
          {state === "idle" ? (
            <svg viewBox="0 0 24 24" className="mx-auto h-9 w-9" fill="currentColor"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2Z"/></svg>
          ) : (
            <span className="mx-auto block h-7 w-7 rounded-md bg-white" />
          )}
        </button>
      </div>
      <div className="font-mono text-2xl tabular-nums">{fmt(seconds)}</div>
      {state !== "idle" ? (
        <div className="flex gap-3">
          <button type="button" onClick={togglePause} className="btn-secondary">{state === "paused" ? "Продолжить" : "Пауза"}</button>
          <button type="button" onClick={stop} className="btn-primary">Готово, сделать конспект</button>
        </div>
      ) : (
        <p className="text-center text-sm text-muted">Нажмите на микрофон и записывайте лекцию. Когда закончите, нажмите стоп.</p>
      )}
      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  );
}

"use client";

import { useState } from "react";
import type { QuizQuestion } from "@/lib/client";

export default function Quiz({ questions, onRetry, onScore }: { questions: QuizQuestion[]; onRetry: () => void; onScore?: (percent: number) => void }) {
  const [answers, setAnswers] = useState<(number | null)[]>(() => questions.map(() => null));
  const [checked, setChecked] = useState(false);

  const score = answers.filter((a, i) => a === questions[i].correctIndex).length;
  const allAnswered = answers.every((a) => a !== null);
  const percent = Math.round((score / questions.length) * 100);
  const answered = answers.filter((a) => a !== null).length;
  const mood = percent >= 90 ? ["🏆", "Отлично!"] : percent >= 70 ? ["🎉", "Хороший результат"] : percent >= 40 ? ["💪", "Неплохо, повтори конспект"] : ["📚", "Стоит перечитать конспект"];

  function check() {
    setChecked(true);
    onScore?.(percent);
  }

  return (
    <div className="flex flex-col gap-6">
      {checked ? (
        <div className="card pop-in flex flex-col gap-4 overflow-hidden p-5 sm:flex-row sm:items-center sm:justify-between" style={{ background: "linear-gradient(135deg, color-mix(in srgb, var(--accent) 18%, var(--surface)), var(--surface))" }}>
          <div className="flex items-center gap-4">
            <div className="text-5xl">{mood[0]}</div>
            <div>
              <div className="text-2xl font-bold">{score} из {questions.length} · {percent}%</div>
              <div className="text-sm text-muted">{mood[1]}</div>
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn-secondary" onClick={() => { setAnswers(questions.map(() => null)); setChecked(false); }}>Пройти снова</button>
            <button type="button" className="btn-secondary" onClick={onRetry}>Новый тест</button>
          </div>
        </div>
      ) : (
        <div className="sticky top-16 z-[5] rounded-full bg-background/80 p-1 backdrop-blur">
          <div className="progress"><div style={{ width: `${(answered / questions.length) * 100}%` }} /></div>
        </div>
      )}
      {questions.map((q, qi) => (
        <div key={qi} className="card p-5">
          <div className="mb-3 flex gap-3 font-semibold"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/15 text-sm text-accent">{qi + 1}</span><span className="pt-0.5">{q.question}</span></div>
          <div className="flex flex-col gap-2">
            {q.options.map((opt, oi) => {
              const selected = answers[qi] === oi;
              const correct = q.correctIndex === oi;
              let cls = "border-line hover:border-accent/60";
              if (checked && correct) cls = "border-green-500 bg-green-500/10";
              else if (checked && selected) cls = "border-red-500 bg-red-500/10";
              else if (selected) cls = "border-accent bg-accent/10";
              return (
                <button
                  key={oi}
                  type="button"
                  disabled={checked}
                  onClick={() => setAnswers((a) => a.map((v, i) => (i === qi ? oi : v)))}
                  className={`rounded-xl border px-4 py-2.5 text-left transition ${cls}`}
                >
                  {opt}
                </button>
              );
            })}
          </div>
          {checked && <p className="mt-3 text-sm text-muted">💡 {q.explanation}</p>}
        </div>
      ))}
      {!checked && (
        <button type="button" disabled={!allAnswered} onClick={check} className="btn-primary self-center">
          {allAnswered ? "Проверить ответы" : `Ответьте на все вопросы (${answers.filter((a) => a !== null).length}/${questions.length})`}
        </button>
      )}
    </div>
  );
}

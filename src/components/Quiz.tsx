"use client";

import { useState } from "react";
import type { QuizQuestion } from "@/lib/client";

export default function Quiz({ questions, onRetry }: { questions: QuizQuestion[]; onRetry: () => void }) {
  const [answers, setAnswers] = useState<(number | null)[]>(() => questions.map(() => null));
  const [checked, setChecked] = useState(false);

  const score = answers.filter((a, i) => a === questions[i].correctIndex).length;
  const allAnswered = answers.every((a) => a !== null);

  return (
    <div className="flex flex-col gap-6">
      {checked && (
        <div className="card flex items-center justify-between p-5">
          <div>
            <div className="text-2xl font-bold">{score} из {questions.length}</div>
            <div className="text-sm text-muted">{Math.round((score / questions.length) * 100)}% правильных ответов</div>
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn-secondary" onClick={() => { setAnswers(questions.map(() => null)); setChecked(false); }}>Пройти снова</button>
            <button type="button" className="btn-secondary" onClick={onRetry}>Новый тест</button>
          </div>
        </div>
      )}
      {questions.map((q, qi) => (
        <div key={qi} className="card p-5">
          <div className="mb-3 font-semibold">{qi + 1}. {q.question}</div>
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
        <button type="button" disabled={!allAnswered} onClick={() => setChecked(true)} className="btn-primary self-center">
          {allAnswered ? "Проверить ответы" : `Ответьте на все вопросы (${answers.filter((a) => a !== null).length}/${questions.length})`}
        </button>
      )}
    </div>
  );
}

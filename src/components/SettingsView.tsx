"use client";

import type { ReactNode } from "react";
import type { Detail, Settings, Theme } from "@/lib/settings";

const LANGUAGES = ["", "русский", "английский", "казахский", "узбекский", "украинский", "немецкий", "французский", "испанский", "китайский"];

const DETAILS: [Detail, string, string][] = [
  ["short", "Кратко", "Главное в 3–5 разделах"],
  ["normal", "Стандартно", "Подробно, как в Зачёте"],
  ["deep", "Максимально", "Больше примеров и пояснений"],
];

const THEMES: [Theme, string][] = [
  ["system", "Как в системе"],
  ["light", "Светлая"],
  ["dark", "Тёмная"],
];

function Row({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-b border-line py-5 last:border-0 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="font-medium">{title}</div>
        {hint && <div className="mt-0.5 text-sm text-muted">{hint}</div>}
      </div>
      <div className="sm:max-w-[60%]">{children}</div>
    </div>
  );
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition ${on ? "bg-accent" : "bg-foreground/20"}`}
    >
      <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "left-6" : "left-1"}`} />
    </button>
  );
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-xl border border-line bg-background p-1">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${v === value ? "bg-accent text-white" : "text-muted hover:text-foreground"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export default function SettingsView({ settings, onChange }: { settings: Settings; onChange: (s: Settings) => void }) {
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => onChange({ ...settings, [key]: value });

  return (
    <div>
      <h1 className="text-2xl font-bold sm:text-3xl">⚙️ Настройки</h1>
      <p className="mt-1 text-muted">Сохраняются автоматически и действуют для всех новых конспектов.</p>

      <section className="card mt-6 px-5 sm:px-6">
        <h2 className="pt-5 text-sm font-semibold uppercase tracking-wide text-muted">Конспекты</h2>
        <Row title="Подробность" hint={DETAILS.find(([d]) => d === settings.detail)?.[2]}>
          <Segmented value={settings.detail} options={DETAILS.map(([d, l]) => [d, l])} onChange={(v) => set("detail", v)} />
        </Row>
        <Row title="Язык конспекта" hint="Можно, например, слушать лекцию на английском, а читать конспект на русском">
          <select value={settings.language} onChange={(e) => set("language", e.target.value)} className="input py-2.5">
            {LANGUAGES.map((l) => (
              <option key={l} value={l}>{l ? l[0].toUpperCase() + l.slice(1) : "Как в материале"}</option>
            ))}
          </select>
        </Row>
        <Row title="Дополнения от нейросети" hint="Короткие пометки «💡 Дополнение», когда в материале не хватает важного">
          <Toggle label="Дополнения от нейросети" on={settings.additions} onChange={(v) => set("additions", v)} />
        </Row>
        <Row title="Ответы на вопросы для самопроверки" hint="Выключите, если хотите проверять себя без подсказок">
          <Toggle label="Ответы на вопросы" on={settings.answers} onChange={(v) => set("answers", v)} />
        </Row>
        <Row title="Пожелания по умолчанию" hint="Подставляются в каждый новый конспект">
          <input
            value={settings.defaultWishes}
            onChange={(e) => set("defaultWishes", e.target.value)}
            placeholder="Например: больше примеров из судебной практики"
            className="input py-2.5 sm:w-80"
          />
        </Row>
      </section>

      <section className="card mt-4 px-5 sm:px-6">
        <h2 className="pt-5 text-sm font-semibold uppercase tracking-wide text-muted">Оформление</h2>
        <Row title="Тема">
          <Segmented value={settings.theme} options={THEMES} onChange={(v) => set("theme", v)} />
        </Row>
      </section>
    </div>
  );
}

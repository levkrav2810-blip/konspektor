"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { Session } from "@/lib/user";

export default function RegisterView({ onDone }: { onDone: (s: Session) => void }) {
  const [form, setForm] = useState({ firstName: "", lastName: "", group: "", code: "" });
  const [needCode, setNeedCode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/register")
      .then((r) => r.json())
      .then((d) => setNeedCode(Boolean(d.needCode)))
      .catch(() => {});
  }, []);

  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Ошибка ${res.status}`);
      onDone(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <form onSubmit={submit} className="card w-full max-w-md p-6 sm:p-8">
        <div className="text-center text-2xl font-bold"><span className="text-accent">Конспект</span>ор</div>
        <h1 className="mt-6 text-xl font-semibold">Регистрация</h1>
        <p className="mt-1 text-sm text-muted">Укажите, как вас зовут и в какой вы группе. Если вы уже регистрировались, введите те же данные.</p>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="text-muted">Имя</span>
            <input required autoFocus autoComplete="given-name" value={form.firstName} onChange={set("firstName")} placeholder="Иван" className="input mt-1 py-2.5" />
          </label>
          <label className="text-sm">
            <span className="text-muted">Фамилия</span>
            <input required autoComplete="family-name" value={form.lastName} onChange={set("lastName")} placeholder="Петров" className="input mt-1 py-2.5" />
          </label>
        </div>
        <label className="mt-3 block text-sm">
          <span className="text-muted">Группа</span>
          <input required value={form.group} onChange={set("group")} placeholder="Например, ЮР-21" className="input mt-1 py-2.5" />
        </label>
        {needCode && (
          <label className="mt-3 block text-sm">
            <span className="text-muted">Код группы</span>
            <input required value={form.code} onChange={set("code")} placeholder="Спросите у старосты" className="input mt-1 py-2.5" />
          </label>
        )}

        {error && <div className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">{error}</div>}
        <button type="submit" disabled={busy} className="btn-primary mt-5 w-full">{busy ? "Вхожу…" : "Войти"}</button>
      </form>
    </div>
  );
}

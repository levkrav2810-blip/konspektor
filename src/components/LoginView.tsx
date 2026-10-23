"use client";

import { useState, type FormEvent } from "react";
import type { Session } from "@/lib/user";

export default function LoginView({ onDone }: { onDone: (s: Session) => void }) {
  const [form, setForm] = useState({ login: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
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
      <form onSubmit={submit} className="card w-full max-w-sm p-6 sm:p-8">
        <div className="text-center text-2xl font-bold"><span className="text-accent">Конспект</span>ор</div>
        <h1 className="mt-6 text-xl font-semibold">Вход</h1>
        <p className="mt-1 text-sm text-muted">Для группы ЮФ МГУ-120. Логин и пароль выдаёт администратор сайта.</p>

        <label className="mt-5 block text-sm">
          <span className="text-muted">Логин</span>
          <input
            required
            autoFocus
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            value={form.login}
            onChange={set("login")}
            placeholder="ivan.petrov"
            className="input mt-1 py-2.5"
          />
        </label>
        <label className="mt-3 block text-sm">
          <span className="text-muted">Пароль</span>
          <input
            required
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            value={form.password}
            onChange={set("password")}
            placeholder="6 цифр"
            className="input mt-1 py-2.5"
          />
        </label>

        {error && <div className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">{error}</div>}
        <button type="submit" disabled={busy} className="btn-primary mt-5 w-full">{busy ? "Вхожу…" : "Войти"}</button>
      </form>
    </div>
  );
}

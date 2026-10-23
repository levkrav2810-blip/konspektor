"use client";

import { useEffect, useState } from "react";
import { plural } from "@/lib/client";
import { authFetch, type User } from "@/lib/user";

type Member = Pick<User, "id" | "firstName" | "lastName"> & { lastLogin?: number; lastSeen?: number; logins?: number; actions?: number };
type Group = { group: string; tracking: boolean; members: Member[] };

const when = (t: number) =>
  new Date(t).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Список группы с отметками, кто заходил. Сервер отдаёт его только администратору, остальным блок не показывается. */
export default function GroupPanel({ me }: { me: string }) {
  const [data, setData] = useState<Group | null>(null);

  useEffect(() => {
    authFetch("/api/group")
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => setData(null));
  }, []);

  if (!data) return null;
  const { members, tracking } = data;
  const came = members.filter((m) => m.lastLogin);
  // сначала те, кто был на сайте недавно, потом остальные по списку
  const sorted = tracking ? [...members].sort((a, b) => (b.lastSeen ?? 0) - (a.lastSeen ?? 0)) : members;

  return (
    <section className="card mt-4 p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold">
          Группа {data.group} <span className="text-muted">· видите только вы</span>
        </h2>
        {tracking && (
          <span className="text-sm text-muted">
            Заходили {came.length} из {members.length}
          </span>
        )}
      </div>
      {!tracking && (
        <p className="mt-2 rounded-xl border border-line bg-background p-3 text-sm text-muted">
          Чтобы видеть, кто заходил, подключите бесплатную базу: Vercel → Storage → Upstash Redis → Connect, затем Redeploy.
        </p>
      )}
      <ul className="mt-3 divide-y divide-line">
        {sorted.map((m) => (
          <li key={m.id} className="flex items-center gap-3 py-2">
            {tracking && <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${m.lastLogin ? "bg-green-500" : "bg-foreground/20"}`} />}
            <span className={`min-w-0 flex-1 truncate ${m.id === me ? "font-medium text-accent" : ""}`}>
              {m.lastName} {m.firstName}
            </span>
            {tracking && (
              <span className="shrink-0 text-right text-xs text-muted">
                {m.lastSeen ? (
                  <>
                    был(а) {when(m.lastSeen)}
                    <span className="hidden sm:inline">
                      {" · "}
                      {m.logins ?? 0} {plural(m.logins ?? 0, "вход", "входа", "входов")}, {m.actions ?? 0} {plural(m.actions ?? 0, "запрос", "запроса", "запросов")} к нейросети
                    </span>
                  </>
                ) : (
                  "ещё не заходил(а)"
                )}
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

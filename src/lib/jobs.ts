"use client";

/**
 * Незаконченная работа, которая должна пережить закрытие страницы. Хранится в IndexedDB браузера
 * (там помещается полуторачасовая запись, в отличие от localStorage):
 *  - jobs: запись, которую сейчас распознаём (сам звук и пожелания), по одной на пользователя;
 *  - progress: уже распознанные фрагменты этой записи, чтобы продолжить с того же места;
 *  - recparts: куски записи с диктофона, пока она ещё идёт.
 * Все функции молча ничего не делают, если IndexedDB недоступен (частный режим и т.п.).
 */

export type AudioJob = {
  userId: string;
  blob: Blob;
  name: string;
  source: string;
  wishes: string;
  subjectId?: string;
  startedAt: number;
};

export type JobProgress = { userId: string; texts: (string | null)[] };

const DB = "konspektor";
let opening: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  if (!opening) {
    opening = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains("jobs")) d.createObjectStore("jobs", { keyPath: "userId" });
        if (!d.objectStoreNames.contains("progress")) d.createObjectStore("progress", { keyPath: "userId" });
        if (!d.objectStoreNames.contains("recparts")) d.createObjectStore("recparts", { keyPath: "k" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    opening.catch(() => (opening = null));
  }
  return opening;
}

async function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest | void): Promise<T | undefined> {
  try {
    const d = await db();
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = d.transaction(store, mode);
      const req = fn(tx.objectStore(store));
      tx.oncomplete = () => resolve(req ? (req.result as T) : undefined);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } catch {
    return undefined;
  }
}

export async function saveJob(job: AudioJob) {
  await run("progress", "readwrite", (s) => s.delete(job.userId));
  return (await run<IDBValidKey>("jobs", "readwrite", (s) => s.put(job))) !== undefined;
}

export const loadJob = (userId: string) => run<AudioJob>("jobs", "readonly", (s) => s.get(userId));
export const loadProgress = (userId: string) => run<JobProgress>("progress", "readonly", (s) => s.get(userId));
export const saveProgress = (p: JobProgress) => run("progress", "readwrite", (s) => s.put(p));

export async function deleteJob(userId: string) {
  await run("jobs", "readwrite", (s) => s.delete(userId));
  await run("progress", "readwrite", (s) => s.delete(userId));
}

// --- запись с диктофона, пока она идёт ---

const range = (userId: string) => IDBKeyRange.bound(`${userId}:`, `${userId}:￿`);

/** Дописывает очередной кусок записи; seq — порядковый номер куска. */
export const saveRecordingPart = (userId: string, seq: number, part: Blob, mimeType: string) =>
  run("recparts", "readwrite", (s) => s.put({ k: `${userId}:${String(seq).padStart(6, "0")}`, part, mimeType }));

/** Незаконченная запись с диктофона целиком (если страница закрылась во время записи). */
export async function loadRecording(userId: string): Promise<Blob | null> {
  const rows = await run<{ part: Blob; mimeType: string }[]>("recparts", "readonly", (s) => s.getAll(range(userId)));
  if (!rows?.length) return null;
  return new Blob(rows.map((r) => r.part), { type: rows[0].mimeType || "audio/webm" });
}

export const clearRecording = (userId: string) => run("recparts", "readwrite", (s) => s.delete(range(userId)));

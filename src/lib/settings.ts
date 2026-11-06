"use client";

export type Detail = "short" | "normal" | "deep";
export type Theme = "dark" | "light";

export type Settings = {
  /** Язык конспекта; пусто — как в материале. */
  language: string;
  detail: Detail;
  /** Разрешить нейросети короткие дополнения «💡 Дополнение». */
  additions: boolean;
  /** Писать ответы к вопросам для самопроверки. */
  answers: boolean;
  /** Пожелания, которые подставляются в каждый новый конспект. */
  defaultWishes: string;
  theme: Theme;
};

export const DEFAULT_SETTINGS: Settings = {
  language: "",
  detail: "normal",
  additions: true,
  answers: true,
  defaultWishes: "",
  theme: "dark",
};

const SETTINGS_KEY = "konspektor.settings.v1";

function load<T>(key: string, fallback: T): T {
  try {
    return { ...fallback, ...JSON.parse(localStorage.getItem(key) || "{}") };
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // хранилище недоступно — настройки действуют до перезагрузки
  }
}

export function loadSettings(): Settings {
  const s = load(SETTINGS_KEY, DEFAULT_SETTINGS);
  // раньше была тема «как в системе» — теперь по умолчанию сине-чёрная
  return s.theme === "light" ? s : { ...s, theme: "dark" };
}
export const saveSettings = (s: Settings) => save(SETTINGS_KEY, s);

export function applyTheme(theme: Theme) {
  if (theme === "light") document.documentElement.setAttribute("data-theme", "light");
  else document.documentElement.removeAttribute("data-theme");
}

/** Скрипт для <head>: ставит тему до первой отрисовки, чтобы не мигало. */
export const THEME_BOOT_SCRIPT = `try{var t=JSON.parse(localStorage.getItem("${SETTINGS_KEY}")||"{}").theme;if(t==="light")document.documentElement.setAttribute("data-theme","light")}catch(e){}`;

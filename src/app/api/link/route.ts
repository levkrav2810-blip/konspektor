import * as cheerio from "cheerio";
import { YoutubeTranscript } from "youtube-transcript";
import { errorResponse } from "@/lib/claude";

export const maxDuration = 60;

function youtubeId(url: URL): string | null {
  if (url.hostname === "youtu.be") return url.pathname.slice(1) || null;
  if (url.hostname.endsWith("youtube.com")) {
    if (url.searchParams.get("v")) return url.searchParams.get("v");
    const m = url.pathname.match(/\/(shorts|embed|live)\/([^/?]+)/);
    if (m) return m[2];
  }
  return null;
}

// Не даём серверу ходить во внутреннюю сеть по ссылке пользователя.
function isPrivateHost(host: string) {
  if (process.env.ALLOW_PRIVATE_URLS === "1") return false;
  return (
    host === "localhost" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.)/.test(host) ||
    host.startsWith("[")
  );
}

export async function POST(req: Request) {
  try {
    const { url: raw } = (await req.json()) as { url?: string };
    let url: URL;
    try {
      url = new URL(String(raw).trim());
      if (!["http:", "https:"].includes(url.protocol) || isPrivateHost(url.hostname)) throw new Error();
    } catch {
      return errorResponse(new Error("Некорректная ссылка"), 400);
    }

    const ytId = youtubeId(url);
    if (ytId) {
      const items = await YoutubeTranscript.fetchTranscript(ytId).catch(() => null);
      if (!items?.length) {
        return errorResponse(new Error("У этого видео нет доступных субтитров. Скачайте аудио и загрузите файлом."), 422);
      }
      return Response.json({ text: items.map((i) => i.text).join(" "), title: "Видео YouTube" });
    }

    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; KonspektBot/1.0)", Accept: "text/html,application/pdf,*/*" },
      redirect: "follow",
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return errorResponse(new Error(`Страница вернула ошибку ${res.status}`), 502);

    const type = res.headers.get("content-type") || "";
    if (type.includes("application/pdf")) {
      const base64 = Buffer.from(await res.arrayBuffer()).toString("base64");
      return Response.json({ file: { base64, mediaType: "application/pdf" }, title: url.hostname });
    }
    if (type.startsWith("text/plain")) {
      return Response.json({ text: await res.text(), title: url.hostname });
    }

    const $ = cheerio.load(await res.text());
    $("script, style, noscript, nav, footer, header, aside, form, iframe, svg").remove();
    const title = $("title").first().text().trim() || url.hostname;
    const root = $("article").first().length ? $("article").first() : $("main").first().length ? $("main").first() : $("body");
    const parts: string[] = [];
    root.find("h1, h2, h3, h4, p, li, td, pre, blockquote").each((_, el) => {
      const t = $(el).text().replace(/\s+/g, " ").trim();
      if (t) parts.push(/^h\d$/.test(el.tagName) ? `\n## ${t}` : t);
    });
    const text = parts.join("\n").trim() || root.text().replace(/\s+/g, " ").trim();
    if (text.length < 200) {
      return errorResponse(new Error("Не удалось достать текст со страницы. Скопируйте его и вставьте во вкладку «Текст»."), 422);
    }
    return Response.json({ text, title });
  } catch (err) {
    return errorResponse(err);
  }
}

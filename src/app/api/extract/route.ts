import { requireUser } from "@/lib/auth";
import mammoth from "mammoth";
import { errorResponse } from "@/lib/ai";


// Достаёт текст из .docx (PDF и картинки модель читает сама, текстовые файлы читаются в браузере).
export async function POST(req: Request) {
  const denied = await requireUser(req);
  if (denied) return denied;
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return errorResponse(new Error("Файл не передан"), 400);
    const buffer = Buffer.from(await file.arrayBuffer());
    const { value } = await mammoth.extractRawText({ buffer });
    if (!value.trim()) return errorResponse(new Error("В документе не найден текст"), 422);
    return Response.json({ text: value });
  } catch (err) {
    return errorResponse(err);
  }
}

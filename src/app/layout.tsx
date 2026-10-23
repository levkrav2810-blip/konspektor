import type { Metadata } from "next";
import "./globals.css";
import { THEME_BOOT_SCRIPT } from "@/lib/settings";

export const metadata: Metadata = {
  title: "Конспектор — нейросеть для конспектов, карточек и тестов",
  description: "Конспект из записи диктофона, файла, текста или ссылки. Карточки, тесты и перевод на любой язык.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ru" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}

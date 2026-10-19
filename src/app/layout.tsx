import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Конспектор — нейросеть для конспектов, карточек и тестов",
  description: "Конспект из записи диктофона, файла, текста или ссылки. Карточки, тесты и перевод на любой язык.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ru" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}

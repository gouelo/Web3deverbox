import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "קשר | Everbox",
  description: "שולחן העבודה המשותף למכירות, שיווק ו־Web 3D. בקשות, אחריות ומעקב עד לסגירה.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he" dir="rtl">
      <body className="antialiased">{children}</body>
    </html>
  );
}

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "מרכז התפעול | GreekCloud", template: "%s | GreekCloud" },
  description: "סביבת העבודה הפנימית של צוות GreekCloud",
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="he" dir="rtl">
      <body>{children}</body>
    </html>
  );
}

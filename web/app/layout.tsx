import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VINTAGE PASSPORT",
  description:
    "AIが鑑定し、ブロックチェーンが記憶する。ヴィンテージ品の鑑定書をNFT化。",
};

// 検証ページは審査員がQRから開くためスマホ表示最優先
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}

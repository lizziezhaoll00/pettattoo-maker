import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PetTattoo Maker 🐾",
  description: "让每一位宠物主都能零门槛制作出属于自家主子的纹身贴素材",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;700;900&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}

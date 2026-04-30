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
      <body>{children}</body>
    </html>
  );
}

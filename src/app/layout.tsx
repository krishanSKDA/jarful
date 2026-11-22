import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Schibsted_Grotesk } from "next/font/google";
import "./globals.css";

const bricolage = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage", display: "swap" });
const schibsted = Schibsted_Grotesk({ subsets: ["latin"], variable: "--font-schibsted", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Jarful: invest toward the things you want", template: "%s · Jarful" },
  description:
    "Give every goal its own jar. Fill it with tokenized stocks, gold or crypto, one tap or on autopilot, and watch it rise.",
};

export const viewport: Viewport = { themeColor: "#eef1f6" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${bricolage.variable} ${schibsted.variable}`}>
      <body>{children}</body>
    </html>
  );
}

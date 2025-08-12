import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import IframeResizer from "@/components/IframeResizer";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "AI T-shirt Creator",
  description: "Generate & place AI artwork on tees, fast.",
};

// ✅ move viewport out of metadata
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Consider NOT forcing maximumScale for accessibility:
  // maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className={`${inter.className} min-h-screen bg-zinc-50 text-zinc-900`}>
        <main className="mx-auto w-full max-w-6xl px-3 sm:px-6 py-4 sm:py-8">{children}</main>
        <IframeResizer />
      </body>
    </html>
  );
}
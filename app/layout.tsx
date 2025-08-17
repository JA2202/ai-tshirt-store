import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import IframeResizer from "@/components/IframeResizer";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "AI T-shirt Creator",
  description: "Generate & place AI artwork on tees, fast.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full overflow-x-hidden">
      <body className={`${inter.className} min-h-screen overflow-x-hidden bg-zinc-50 text-zinc-900`}>
        <main className="mx-auto w-full max-w-6xl px-3 sm:px-6 py-4 sm:py-8">
          {children}
        </main>
        {/* Handles embed mode + postMessage height from a client-only component */}
        <IframeResizer />
      </body>
    </html>
  );
}
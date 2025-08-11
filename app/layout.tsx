import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "AI T-Shirt Customizer (Demo)",
  description: "Generate a design, place it on a tee, and preview the result.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen bg-gradient-to-b from-zinc-50 to-white text-zinc-900 antialiased">
        <header className="sticky top-0 z-40 border-b bg-white/70 backdrop-blur supports-[backdrop-filter]:bg-white/50">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-black text-xs font-bold tracking-tight text-white">
                AI
              </div>
              <span className="text-sm font-semibold tracking-tight">
                TeeLab · Demo
              </span>
            </div>
            <span className="text-xs text-zinc-500">
              MVP preview — not for production
            </span>
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}

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
        <IframeResizer />
      </body>
    </html>
  );
}

// app/layout.tsx (inside a client component effect or a small <Script>)
if (typeof window !== "undefined") {
  const isEmbedded = new URLSearchParams(window.location.search).get("embed") === "1";
  if (isEmbedded) document.documentElement.classList.add("embed");
}

// send height to parent
function postHeight() {
  const h = document.documentElement.scrollHeight || document.body.scrollHeight || 1200;
  window.parent?.postMessage({ type: "tstore:height", height: h }, "*");
}
window.addEventListener("load", postHeight);
window.addEventListener("resize", () => {
  // throttle a bit
  if ((window as any).__tstoreHTimer) clearTimeout((window as any).__tstoreHTimer);
  (window as any).__tstoreHTimer = setTimeout(postHeight, 100);
});
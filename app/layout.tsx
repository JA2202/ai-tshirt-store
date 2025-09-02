import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import IframeResizer from "@/components/IframeResizer";
import Script from "next/script";

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
      <head>
        {/* Google Tag Manager */}
        <Script id="gtm-base" strategy="afterInteractive">
          {`
            (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
            new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
            j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
            'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
            })(window,document,'script','dataLayer','GTM-KWQK28P8');
          `}
        </Script>
        {/* End Google Tag Manager */}

        {/* paypal pay in 3 messaging */}
        <Script
          src="https://www.paypal.com/sdk/js?client-id=BAA7Gi6toOQoR79J28WeX05OB7reEKEcKImrnWvQqOeLaw4ZN3vYPb-kcEx_dCPwlTV799KHAEzQxIabEI&currency=GBP&components=messages"
          data-namespace="PayPalSDK"
          strategy="afterInteractive"
        />

        {/* Lottie */}
        <Script defer src="https://unpkg.com/@lottiefiles/lottie-player@latest/dist/lottie-player.js" />

        {/* Cloudflare Turnstile (needed for the human-gate) */}
        <Script
          id="cf-turnstile"
          src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
          strategy="afterInteractive"
        />
      </head>
      <body className={`${inter.className} min-h-screen overflow-x-hidden bg-zinc-50 text-zinc-900`}>
        {/* Google Tag Manager (noscript) */}
        <noscript>
          <iframe
            src="https://www.googletagmanager.com/ns.html?id=GTM-KWQK28P8"
            height="0"
            width="0"
            style={{ display: "none", visibility: "hidden" }}
          />
        </noscript>
        {/* End Google Tag Manager (noscript) */}

        <main className="mx-auto w-full max-w-6xl px-3 sm:px-6 py-4 sm:py-8">
          {children}
        </main>

        {/* Handles embed mode + postMessage height from a client-only component */}
        <IframeResizer />
      </body>
    </html>
  );
}
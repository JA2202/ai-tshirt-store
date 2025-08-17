// next.config.ts
import type { NextConfig } from "next";

const config: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // Allow only your marketing site(s) to embed the app:
          {
            key: "Content-Security-Policy",
            value:
              "frame-ancestors 'self' http://threadlabs.app/;",
          },
          // Do NOT set X-Frame-Options: DENY; leave it unset (or SAMEORIGIN if needed).
        ],
      },
    ];
  },
};

export default config;
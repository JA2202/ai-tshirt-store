import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow this app to be embedded in your marketing site’s iframe
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            // ⚠️ Change to your real parent domains (space-separated)
            value: "frame-ancestors 'self' https://yourdomain.com https://staging.yourdomain.com",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
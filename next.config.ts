import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Increase body size limit for streaming uploads (Vercel Pro only)
  // Hobby plan is capped at 4.5MB regardless of this setting
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;

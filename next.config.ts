import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  poweredByHeader: false,
  turbopack: { root: process.cwd() },
  async redirects() {
    return [
      { source: "/v1", destination: "/", permanent: true },
    ];
  },
};

export default nextConfig;

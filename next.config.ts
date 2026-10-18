import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['@resvg/resvg-js'],
  outputFileTracingIncludes: {
    '/api/workforce/business-card/download': ['./public/logo.png', './public/fonts/NotoSansArabic-Variable.ttf'],
  },
};

export default nextConfig;

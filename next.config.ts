import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['@resvg/resvg-js'],
  outputFileTracingIncludes: {
    '/api/*': ['./public/brands/**/*', './public/fonts/almarai-bold.ttf'],
    '/api/workforce/business-card/download': ['./public/logo.png', './public/fonts/NotoSansArabic-Variable.ttf'],
  },
};

export default nextConfig;

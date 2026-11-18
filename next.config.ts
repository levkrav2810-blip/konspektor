import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Для Спринтхоста собираем самодостаточную папку (scripts/build-sprinthost.sh), на Vercel и в Docker — как обычно.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

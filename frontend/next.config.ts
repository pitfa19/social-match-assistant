import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The shared geography catalogue lives in ../shared, so Turbopack must see the repo root.
  turbopack: { root: path.join(import.meta.dirname, "..") },
};

export default nextConfig;

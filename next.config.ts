import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export: one bundle serves both Vercel (web) and Capacitor (iOS).
  // All routes are client-rendered; no server features are used.
  output: "export",
  // Emit each route as a folder with index.html so static servers
  // (including Capacitor's local server) resolve deep links like /leaderboard.
  trailingSlash: true,
};

export default nextConfig;

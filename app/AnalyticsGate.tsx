"use client";

import { Analytics } from "@vercel/analytics/next";
import { isNative } from "../lib/native";

// Vercel Analytics only makes sense (and is only disclosed) on the web;
// the native app must not phone home to a third-party tracker.
export function AnalyticsGate() {
  if (isNative()) return null;
  return <Analytics />;
}

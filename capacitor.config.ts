import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.caladay.app",
  appName: "Caladay",
  webDir: "out",
  ios: {
    // Match the app's parchment background so overscroll/edges blend in
    backgroundColor: "#f2ede7",
    contentInset: "never",
  },
  plugins: {
    SplashScreen: {
      // Keep the splash up until the web app has painted its settled UI
      // (hideSplash() in lib/native.ts), preventing the raw-WebView flicker
      // between splash dismissal and first paint.
      launchAutoHide: false,
      backgroundColor: "#f2ede7",
      showSpinner: false,
    },
  },
};

export default config;

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
};

export default config;

import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Android app (APK) built with Capacitor: the UI from dist/ is bundled in the APK and
 * served from https://localhost inside the WebView. AI coach calls go to the VoceViva
 * server set in the app ("Server VoceViva") or baked in with VITE_API_BASE_URL.
 */
const config: CapacitorConfig = {
  appId: "it.voceviva.app",
  appName: "VoceViva",
  webDir: "dist",
  android: {
    // The WebView must not use mixed content: the server URL should be https.
    allowMixedContent: false,
  },
};

export default config;

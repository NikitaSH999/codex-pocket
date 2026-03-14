import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "codex-pocket",
        short_name: "codex-pocket",
        description: "Remote companion for a local Codex session on your PC.",
        theme_color: "#131525",
        background_color: "#0a0c12",
        display: "standalone",
        start_url: "/",
        icons: [
          {
            src: "/icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any"
          }
        ]
      }
    })
  ],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:8787",
      "/events": {
        target: "ws://127.0.0.1:8787",
        ws: true
      }
    }
  }
});

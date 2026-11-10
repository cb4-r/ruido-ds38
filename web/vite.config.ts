import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icono.svg"],
      manifest: {
        name: "Ruido DS 38",
        short_name: "Ruido DS 38",
        description: "Informes de medición de ruido según el D.S. 38/2011 MMA",
        lang: "es",
        display: "standalone",
        theme_color: "#14405a",
        background_color: "#f4f6f8",
        icons: [{ src: "icono.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" }],
      },
      workbox: { navigateFallbackDenylist: [/^\/api\//] },
    }),
  ],
  server: { proxy: { "/api": "http://localhost:3000" } },
});

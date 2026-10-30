import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// In development the API runs separately (pnpm admin:api); Vite forwards /api to it.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  server: { proxy: { "/api": "http://127.0.0.1:3000" } },
  build: { chunkSizeWarningLimit: 1500 },
  test: { environment: "jsdom", setupFiles: ["./src/test/setup.ts"] }
});

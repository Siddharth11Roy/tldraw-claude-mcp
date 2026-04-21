import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: fileURLToPath(new URL("../server/public", import.meta.url)),
    emptyOutDir: true
  },
  server: {
    port: 5173,
    proxy: {
      "/ws": { target: "ws://localhost:3030", ws: true }
    }
  }
});

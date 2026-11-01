import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// dev proxy target: `scripts/tokenledger.sh serve`, or TOKENLEDGER_API (e.g. a preview of the cloud API)
const backend = process.env.TOKENLEDGER_API ?? "http://127.0.0.1:8765";

export default defineConfig({
  plugins: [react()],
  cacheDir: "../.build/vite-cache",
  server: { port: 5173, strictPort: true, proxy: { "/api": backend } },
  build: { outDir: "dist", emptyOutDir: true, chunkSizeWarningLimit: 1200 },
});

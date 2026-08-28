import path from "node:path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

const PORT = 43123;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: "0.0.0.0",
    port: PORT,
    strictPort: true,
    proxy: {
      "/ws": {
        target: "ws://127.0.0.1:43124",
        ws: true,
      },
    },
  },
  preview: {
    host: "0.0.0.0",
    port: PORT,
  },
});

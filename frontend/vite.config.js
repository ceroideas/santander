import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      // En desarrollo, las peticiones a /api se reenvían al backend
      "/api": { target: "http://192.168.1.155:8000", changeOrigin: true },
      "/docs": { target: "http://192.168.1.155:8000", changeOrigin: true },
      "/redoc": { target: "http://192.168.1.155:8000", changeOrigin: true },
    },
  },
});

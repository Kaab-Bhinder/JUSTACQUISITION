import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    /* Proxying keeps the browser on one origin, so /api calls are same-origin
       and no CORS preflight or cookie/SameSite juggling is involved in dev. */
    proxy: {
      "/api": {
        target: process.env.API_ORIGIN || "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
});

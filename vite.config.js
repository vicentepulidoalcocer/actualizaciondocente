import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// BASE_PATH se define en el workflow de GitHub Actions como "/<nombre-del-repo>/"
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: process.env.BASE_PATH || "/",
});

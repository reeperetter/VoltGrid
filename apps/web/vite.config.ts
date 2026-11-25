import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Відносні шляхи: збірка працює і з file:// (Electron), і з будь-якого підкаталогу.
  base: "./",
});

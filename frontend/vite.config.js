import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath, URL } from "node:url";
export default defineConfig({
  base: "/Solar-Atlas/",
  plugins: [vue()],
  resolve: { alias: { src: fileURLToPath(new URL("./src", import.meta.url)) } },
});

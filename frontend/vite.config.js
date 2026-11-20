import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { URL as NodeURL } from "node:url";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new NodeURL(".", import.meta.url));
const skyRoot = join(root, "sky-static");
const contentTypes = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json",
  ".wasm": "application/wasm", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".webp": "image/webp", ".bin": "application/octet-stream", ".glb": "model/gltf-binary", ".gltf": "model/gltf+json",
};
const skyStatic = {
  name: "sky-static-dev",
  configureServer(server) {
    server.middlewares.use("/sky", (request, response, next) => {
      const relative = normalize(decodeURIComponent((request.url || "/").split("?")[0])).replace(/^[/\\]+/, "");
      const path = join(skyRoot, relative);
      if (!path.startsWith(skyRoot) || !existsSync(path) || !statSync(path).isFile()) return next();
      response.setHeader("Content-Type", contentTypes[extname(path).toLowerCase()] || "application/octet-stream");
      createReadStream(path).pipe(response);
    });
  },
};

export default defineConfig({
  base: "/Solar-Atlas/",
  plugins: [vue(), skyStatic],
  resolve: { alias: { src: fileURLToPath(new NodeURL("./src", import.meta.url)) } },
});

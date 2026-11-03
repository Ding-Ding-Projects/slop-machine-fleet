import { defineConfig } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {publicIsolation} from './public-isolation.mjs';
const root = path.dirname(fileURLToPath(import.meta.url));
export default defineConfig({
  base: "/slop-machine-fleet/",
  plugins: [publicIsolation()],
  worker: {plugins:()=>[publicIsolation(true)]},
  server: { fs: { allow: [path.resolve(root, "..")] } },
  build: { outDir: "dist", emptyOutDir: true },
});

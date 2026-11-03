import { defineConfig } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.dirname(fileURLToPath(import.meta.url));
export default defineConfig({
  base: "/slop-machine-fleet/",
  plugins: [
    {
      name: "public-docs-preferences",
      enforce: "pre",
      resolveId(source, importer) {
        if (
          source === "./preferences" &&
          importer?.replaceAll("\\", "/").endsWith("/web/src/Search.tsx")
        )
          return path.join(root, "src/preferences.tsx");
      },
      generateBundle() {
        for (const id of this.getModuleIds()) {
          const normalized = id.replaceAll("\\", "/").split("?")[0];
          if (
            /\/web\/src\/(preferences\.tsx|wording\.mjs|api\.ts)$/.test(
              normalized,
            )
          ) {
            this.error(
              "Public documentation must not bundle private application state or controller clients.",
            );
          }
        }
      },
    },
  ],
  server: { fs: { allow: [path.resolve(root, "..")] } },
  build: { outDir: "dist", emptyOutDir: true },
});

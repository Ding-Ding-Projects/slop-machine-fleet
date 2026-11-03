import { open, realpath } from "node:fs/promises";
import { dirname, resolve, relative, isAbsolute, sep } from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requiredFeatureIds } from "./feature-identities.js";
const count = requiredFeatureIds.length;
const slug = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(160);
const surface = z.enum([
  "desktop",
  "browser",
  "onboarding",
  "settings",
  "documentation",
  "hosting-wizard",
  "build-companion",
]);
const feature = z
  .object({
    id: slug,
    title: z.string().min(1).max(256),
    category: z.string().min(1).max(256),
    applicable: z.boolean(),
    state: z.enum(["unfinished", "implemented", "verified", "not-applicable"]),
    reason: z.string().min(1).max(4000),
    surfaces: z.array(surface).max(7),
    implementation: z.array(z.string().max(2048)).max(100),
    verification: z.array(z.string().max(2048)).max(100),
    documentation: z.string().max(512),
  })
  .strict()
  .superRefine((entry, ctx) => {
    if (entry.documentation !== `docs/features/requirements/${entry.id}.md`)
      ctx.addIssue({
        code: "custom",
        message: "Feature article is outside the approved inventory",
      });
    if (entry.applicable === (entry.state === "not-applicable"))
      ctx.addIssue({
        code: "custom",
        message: "Applicability and delivery state are inconsistent",
      });
    if (new Set(entry.surfaces).size !== entry.surfaces.length)
      ctx.addIssue({ code: "custom", message: "Duplicate feature surface" });
  });
export const featureManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    generatedAt: z.iso.datetime({ offset: true }),
    sourceCount: z.literal(count),
    surfaces: z.array(surface).length(7),
    features: z.array(feature).length(count),
  })
  .strict()
  .superRefine((manifest, ctx) => {
    const actualIds = new Set(manifest.features.map((entry) => entry.id));
    if (requiredFeatureIds.some((id) => !actualIds.has(id)))
      ctx.addIssue({
        code: "custom",
        message: "Required feature identity is missing",
      });
    if (new Set(manifest.features.map((entry) => entry.id)).size !== count)
      ctx.addIssue({ code: "custom", message: "Duplicate feature identity" });
    if (new Set(manifest.surfaces).size !== 7)
      ctx.addIssue({ code: "custom", message: "Duplicate inventory surface" });
  });
export async function boundedFeatureText(file: string, maxBytes = 1048576) {
  const handle = await open(file, "r");
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size > maxBytes)
      throw new Error("Feature source is not a bounded regular file");
    const buffer = Buffer.alloc(maxBytes + 1);
    let length = 0;
    while (length < buffer.length) {
      const read = await handle.read(
        buffer,
        length,
        buffer.length - length,
        length,
      );
      if (!read.bytesRead) break;
      length += read.bytesRead;
    }
    if (length > maxBytes)
      throw new Error("Feature source grew beyond its bound");
    return new TextDecoder("utf-8", { fatal: true }).decode(
      buffer.subarray(0, length),
    );
  } finally {
    await handle.close();
  }
}
async function inventory(file?: string) {
  if (!file) throw new Error("Feature inventory is not configured");
  return featureManifestSchema.parse(
    JSON.parse(await boundedFeatureText(file)),
  );
}
function inside(root: string, file: string) {
  const path = relative(root, file);
  return (
    path !== "" &&
    path !== ".." &&
    !path.startsWith(".." + sep) &&
    !isAbsolute(path)
  );
}
export function registerFeatureRoutes(
  app: FastifyInstance,
  manifestFile?: string,
) {
  app.get("/api/features", async (_req, reply) => {
    try {
      return await inventory(manifestFile);
    } catch {
      return reply.code(503).send({
        error: {
          code: "FEATURE_INVENTORY_UNAVAILABLE",
          message:
            "The complete required feature inventory is unavailable or invalid.",
        },
      });
    }
  });
  app.get<{ Params: { id: string } }>(
    "/api/features/:id",
    async (req, reply) => {
      if (!slug.safeParse(req.params.id).success)
        return reply.code(400).send({
          error: {
            code: "INVALID_FEATURE_ID",
            message: "Feature identity is invalid.",
          },
        });
      let manifest: z.infer<typeof featureManifestSchema>;
      try {
        manifest = await inventory(manifestFile);
      } catch {
        return reply.code(503).send({
          error: {
            code: "FEATURE_INVENTORY_UNAVAILABLE",
            message:
              "The complete required feature inventory is unavailable or invalid.",
          },
        });
      }
      const feature = manifest.features.find(
        (entry) => entry.id === req.params.id,
      );
      if (!feature)
        return reply.code(404).send({
          error: {
            code: "FEATURE_NOT_FOUND",
            message: "Feature was not found in the required inventory.",
          },
        });
      try {
        const documentationRoot = await realpath(dirname(manifestFile!));
        const root = await realpath(
          resolve(documentationRoot, "features/requirements"),
        );
        if (!inside(documentationRoot, root))
          throw new Error("Article directory escaped the documentation tree");
        const file = await realpath(
          resolve(dirname(manifestFile!), "..", feature.documentation),
        );
        if (!inside(root, file) || !file.endsWith(".md"))
          throw new Error("Feature article escaped its approved directory");
        const article = await boundedFeatureText(file);
        return { feature, article };
      } catch {
        return reply.code(503).send({
          error: {
            code: "FEATURE_ARTICLE_UNAVAILABLE",
            message:
              "The required feature article is unavailable or outside its approved directory.",
          },
        });
      }
    },
  );
}

import type { FastifyInstance } from "fastify";
import staticPlugin from "@fastify/static";
import { resolve } from "node:path";
import { isApiRequest } from "./request-routing.js";
export async function registerWebAssets(app: FastifyInstance, root: string) {
  await app.register(staticPlugin, {
    root: resolve(root),
    list: false,
    wildcard: true,
    dotfiles: "deny",
  });
  app.setNotFoundHandler((req, reply) =>
    isApiRequest(req)
      ? reply
          .code(404)
          .send({
            error: { code: "NOT_FOUND", message: "Route was not found." },
          })
      : reply.sendFile("index.html"),
  );
}

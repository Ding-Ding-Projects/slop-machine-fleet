import type { FastifyRequest } from "fastify";
import { posix } from "node:path";
export function isApiRequest(
  request: Pick<FastifyRequest, "url" | "routeOptions">,
) {
  const route = request.routeOptions?.url;
  if (route === "/api" || route?.startsWith("/api/")) return true;
  let pathname = request.url.split("?")[0];
  try {
    pathname = decodeURIComponent(pathname);
  } catch {
    return false;
  }
  pathname = posix.normalize(
    pathname.replaceAll("\\", "/").replace(/\/{2,}/g, "/"),
  );
  return pathname === "/api" || pathname.startsWith("/api/");
}

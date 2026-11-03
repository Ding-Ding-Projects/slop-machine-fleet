import { createHash, randomUUID } from "node:crypto";
import type { Store } from "./db.js";
const opaqueId =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export function ownerScopeKey(
  controllerId: string,
  ownerId: string,
  configuredOrigin: string,
): string {
  if (!opaqueId.test(controllerId) || !opaqueId.test(ownerId))
    throw new Error("Stored owner scope identity is invalid");
  const origin = new URL(configuredOrigin);
  if (
    origin.username ||
    origin.password ||
    !["http:", "https:"].includes(origin.protocol)
  )
    throw new Error("Configured origin is invalid");
  return createHash("sha256")
    .update("slop-machine-fleet:platform-owner-scope:v1\0")
    .update(JSON.stringify([controllerId, ownerId, origin.origin]))
    .digest("hex");
}
export async function initializeOwnerIdentity(store: Store) {
  let controller = await store.get("state", "controller-identity");
  if (!controller) {
    controller = { id: randomUUID() };
    await store.put("state", "controller-identity", controller);
  }
  if (!opaqueId.test(controller.id))
    throw new Error("Stored controller identity is invalid");
  const owner = await store.get("state", "owner");
  if (!owner) return;
  const previous = await store.get("state", "active-owner-identity");
  if (!owner.id) {
    owner.id = randomUUID();
    await store.put("state", "owner", owner);
  }
  if (!opaqueId.test(owner.id))
    throw new Error("Stored owner identity is invalid");
  if (!previous) {
    for (const row of (
      await store.db.query("SELECT id,value FROM fleet_sessions")
    ).rows) {
      if (!row.value.ownerId) {
        row.value.ownerId = owner.id;
        await store.put("sessions", row.id, row.value);
      }
    }
  }
  await store.put("state", "active-owner-identity", { id: owner.id });
}
export async function currentOwnerScope(
  store: Store,
  configuredOrigin: string,
) {
  const controller = await store.get("state", "controller-identity"),
    owner = await store.get("state", "owner");
  if (!controller || !owner?.id)
    throw new Error("Owner scope identity is unavailable");
  return ownerScopeKey(controller.id, owner.id, configuredOrigin);
}

import { createCleanupQueue } from "../../../../packages/shared/local-base64/cleanup.mjs";
import { removeTemporary } from "../../../../packages/shared/local-base64/storage.mjs";
// Retained across panel remounts so pending cleanup cannot disappear with the UI.
export const temporaryCleanup = createCleanupQueue({
  remove: (claim) => removeTemporary(claim),
});

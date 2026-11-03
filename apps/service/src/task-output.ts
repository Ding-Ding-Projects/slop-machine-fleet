import { z } from "zod";
import type { TaskOutputPage } from "@fleet/shared";
export const outputQuerySchema = z
  .object({
    after: z.coerce
      .number()
      .int()
      .min(0)
      .max(Number.MAX_SAFE_INTEGER)
      .default(0),
    limit: z.coerce.number().int().min(1).max(200).default(100),
  })
  .strict();
const sequence = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const eventSchema = z
  .object({
    sequence: sequence.min(1),
    kind: z.enum([
      "assistant",
      "command",
      "command-output",
      "file-change",
      "progress",
      "state",
      "result",
    ]),
    content: z.string().max(2048),
    at: z.iso.datetime({ offset: true }),
    itemId: z.string().max(256).nullable().optional(),
    stream: z.enum(["combined", "stdout", "stderr"]).nullable().optional(),
    truncated: z.boolean(),
    redacted: z.boolean(),
  })
  .strict();
const pageSchema = z
  .object({
    taskId: z.string().uuid(),
    events: z.array(eventSchema).max(200),
    nextCursor: sequence,
    oldestSequence: sequence,
    latestSequence: sequence,
    gap: z.boolean(),
    truncated: z.boolean(),
    resetReason: z.string().max(160).nullable().optional(),
  })
  .strict();
export function validateTaskOutput(
  value: unknown,
  taskId: string,
  after: number,
  limit: number,
): TaskOutputPage {
  const page = pageSchema.parse(value);
  if (
    page.taskId !== taskId ||
    page.events.length > limit ||
    page.oldestSequence > page.latestSequence ||
    page.nextCursor > page.latestSequence
  )
    throw new Error("Worker output identity or cursor is invalid");
  let previous = page.gap && page.resetReason ? 0 : after;
  for (const event of page.events) {
    if (
      event.sequence <= previous ||
      event.sequence < page.oldestSequence ||
      event.sequence > page.latestSequence
    )
      throw new Error("Worker output ordering is invalid");
    previous = event.sequence;
  }
  if (page.events.length && page.nextCursor !== previous)
    throw new Error("Worker output replay cursor is inconsistent");
  if (!page.gap && page.nextCursor < after)
    throw new Error("Worker output moved backwards without a reset");
  return page;
}

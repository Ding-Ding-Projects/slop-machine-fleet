import { createContext, useContext, useLayoutEffect, useRef } from "react";
import { createSafetyRegistry } from "./safety.mjs";
export type ToolSafety = {
  known: boolean;
  dirty: boolean;
  pendingWrites: boolean;
};
export type ToolLifecycle = { canLeave: () => boolean; discard: () => void };
export const SafetyContext = createContext<ReturnType<
  typeof createSafetyRegistry
> | null>(null);
export function useToolSafety(
  key: string,
  state: ToolSafety,
  discard: () => void,
) {
  const registry = useContext(SafetyContext),
    discardRef = useRef(discard),
    registration = useRef<ReturnType<
      ReturnType<typeof createSafetyRegistry>["register"]
    > | null>(null);
  discardRef.current = discard;
  useLayoutEffect(() => {
    if (!registry) return;
    const current = registry.register(key, () => discardRef.current());
    registration.current = current;
    return () => {
      current.unregister();
      registration.current = null;
    };
  }, [registry, key]);
  useLayoutEffect(() => {
    registration.current?.update(state);
  }, [registry, key, state.known, state.dirty, state.pendingWrites]);
}

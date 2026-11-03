import React, { useLayoutEffect, useRef, useState } from "react";
import { Base64Tool } from "./Base64Tool";
import { SafetyContext, ToolSafety, ToolLifecycle } from "./ToolSafetyContext";
import { createSafetyRegistry } from "./safety.mjs";
import "./tools.css";
export function Base64Workspace({
  onSafety,
  onLifecycle,
}: {
  onSafety?: (value: ToolSafety) => void;
  onLifecycle?: (value: ToolLifecycle | null) => void;
} = {}) {
  const [registry] = useState(() => createSafetyRegistry(["base64"])),
    [epoch, setEpoch] = useState(0),
    callbacks = useRef({ onSafety, onLifecycle });
  callbacks.current = { onSafety, onLifecycle };
  useLayoutEffect(() => {
    const stop = registry.subscribe((value: ToolSafety) =>
      callbacks.current.onSafety?.(value),
    );
    callbacks.current.onLifecycle?.({
      canLeave: () => registry.canLeave(),
      discard: () => {
        registry.discard();
        setEpoch((value) => value + 1);
      },
    });
    return () => {
      stop();
      callbacks.current.onSafety?.({
        known: false,
        dirty: false,
        pendingWrites: false,
      });
      callbacks.current.onLifecycle?.(null);
    };
  }, [registry]);
  return (
    <SafetyContext.Provider value={registry}>
      <div className="local-tools" key={epoch}>
        <Base64Tool />
      </div>
    </SafetyContext.Provider>
  );
}

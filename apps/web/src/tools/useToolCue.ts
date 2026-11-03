import { useCallback, useEffect, useRef } from "react";
import { useUI } from "../preferences";
export function useToolCue() {
  const { prefs } = useUI(),
    current = useRef<AudioContext | null>(null),
    settings = useRef(prefs);
  settings.current = prefs;
  useEffect(
    () => () => {
      void current.current?.close();
    },
    [],
  );
  return useCallback((success: boolean) => {
    const value = settings.current;
    if (!value.sounds || value.lowStimulation || value.volume <= 0) return;
    try {
      void current.current?.close();
      const context = new AudioContext(),
        gain = context.createGain(),
        tone = context.createOscillator();
      current.current = context;
      gain.gain.value = Math.min(100, Math.max(0, value.volume)) / 700;
      tone.frequency.value = success ? 660 : 220;
      gain.connect(context.destination);
      tone.connect(gain);
      tone.start();
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.12);
      tone.stop(context.currentTime + 0.13);
      tone.onended = () => {
        void context.close();
        if (current.current === context) current.current = null;
      };
    } catch {
      /* Sound is supplementary and never changes the operation result. */
    }
  }, []);
}

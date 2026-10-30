import { useEffect, useState } from "react";

function prefersLessMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/** A number that counts up to its value once, after an optional delay; the value at once for less motion. */
export function useCountUp(target: number, { durationMs = 1400, delayMs = 0 } = {}): number {
  const [value, setValue] = useState(() => (prefersLessMotion() ? target : 0));

  useEffect(() => {
    if (prefersLessMotion()) {
      setValue(target);
      return;
    }
    let frame = 0;
    let start: number | null = null;
    const tick = (now: number) => {
      start ??= now + delayMs;
      const progress = Math.min(1, Math.max(0, (now - start) / durationMs));
      setValue(Math.round(target * (1 - Math.pow(1 - progress, 3))));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, durationMs, delayMs]);

  return value;
}

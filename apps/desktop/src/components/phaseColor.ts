import type { Pomodoro } from "@mousecomb/bindings";
import { isRunning } from "@mousecomb/data";

/** The timer's colour: accent while focusing, green on a break, grey while paused. */
export function phaseColor(timer: Pomodoro): string {
  if (!isRunning(timer) && !timer.fresh) return "var(--color-muted)";
  return timer.phase === "focus" ? "var(--color-accent)" : "var(--color-ok)";
}

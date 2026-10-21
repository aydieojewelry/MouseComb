import { events } from "@mousecomb/bindings";
import { formatClock, isRunning, PHASE_LABEL, remainingMs, useBackendEvent, usePomodoro } from "@mousecomb/data";
import { ClockFace, cx } from "@mousecomb/ui";
import { useRef, useState } from "react";

import { useClockLook } from "../components/useClockLook";
import { useNow } from "../components/useNow";

/** A short message from an action ("Copied"), shown for 1.8 s. */
function useFlash() {
  const [flash, setFlash] = useState<string | null>(null);
  const clear = useRef<ReturnType<typeof setTimeout>>(undefined);
  useBackendEvent(events.hudFlash, ({ text }) => {
    setFlash(text);
    clearTimeout(clear.current);
    clear.current = setTimeout(() => setFlash(null), 1800);
  });
  return flash;
}

/**
 * The window size for each clock style, as Rust sets it (`overlays::hud_size`).
 * The page draws in a box this size at the window's top-left: a window the
 * OS made bigger (Linux) then still shows the clock where Rust placed it.
 */
const HUD_WINDOW = { digital: { width: 160, height: 90 }, analog: { width: 128, height: 128 } } as const;

/**
 * The HUD window (FEAT-001): the clock face you picked, with a status line
 * above it for the Pomodoro countdown and action flashes. Click-through;
 * fades as the mouse comes near (DEC-015).
 */
export function HudPage() {
  const { look, showSeconds } = useClockLook();
  const { data: timer } = usePomodoro();
  const running = timer ? isRunning(timer) : false;
  const paused = Boolean(timer && !running && !timer.fresh);
  // Re-render each second only when something on screen changes that often.
  const now = useNow(showSeconds || running ? 1000 : 60_000);
  const [opacity, setOpacity] = useState(1);
  useBackendEvent(events.hudFade, (e) => setOpacity(e.opacity));
  const flash = useFlash();

  const pill = "flex h-5 max-w-full items-center gap-1.5 truncate rounded-full bg-idle/85 px-2 text-[11px] font-medium tabular-nums";
  return (
    <div
      className="flex flex-col items-end gap-1 p-1"
      style={{ ...HUD_WINDOW[look.style], opacity, transition: "opacity 120ms linear" }}
    >
      <div className="flex h-5 max-w-full justify-end">
        {flash ? (
          <span className={cx(pill, "text-accent")}>{flash}</span>
        ) : timer && (running || paused) ? (
          <span className={cx(pill, running ? "text-accent" : "text-muted")}>
            <span aria-hidden className={cx("size-1.5 shrink-0 rounded-full", running ? "bg-accent" : "bg-muted")} />
            {PHASE_LABEL[timer.phase]} {formatClock(remainingMs(timer, now))}
            {paused && " · paused"}
          </span>
        ) : null}
      </div>
      <div className="drop-shadow-[0_6px_14px_rgba(0,0,0,0.45)]">
        <ClockFace look={look} date={new Date(now)} showSeconds={showSeconds} />
      </div>
    </div>
  );
}

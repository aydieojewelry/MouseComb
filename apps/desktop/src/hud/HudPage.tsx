import { events } from "@mousecomb/bindings";
import { formatClock, isRunning, PHASE_LABEL, remainingMs, SETTINGS, useBackendEvent, usePomodoro, useSetting } from "@mousecomb/data";
import { cx } from "@mousecomb/ui";
import { useRef, useState } from "react";

import { useNow } from "../components/useNow";

const timeWithSeconds = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" });
const timeWithoutSeconds = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
const dateFormat = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short" });

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
 * The HUD window (FEAT-001): clock, date and the Pomodoro countdown in the
 * screen corner. Click-through; fades as the mouse comes near (DEC-015).
 * Drawn from the window's top edge: Rust places the window by its configured size.
 */
export function HudPage() {
  const [showSeconds] = useSetting(SETTINGS.hudShowSeconds);
  const { data: timer } = usePomodoro();
  const running = timer ? isRunning(timer) : false;
  const paused = Boolean(timer && !running && !timer.fresh);
  // Re-render each second only when something on screen changes that often.
  const now = useNow(showSeconds || running ? 1000 : 60_000);
  const [opacity, setOpacity] = useState(1);
  useBackendEvent(events.hudFade, (e) => setOpacity(e.opacity));
  const flash = useFlash();

  return (
    <div className="flex h-full items-start justify-end p-1" style={{ opacity, transition: "opacity 120ms linear" }}>
      <div className="flex min-w-36 flex-col items-end gap-0.5 rounded-hud bg-idle/90 px-4 py-2.5 shadow-lg">
        <div className="font-display text-[26px] font-semibold leading-none tabular-nums text-fg">
          {(showSeconds ? timeWithSeconds : timeWithoutSeconds).format(now)}
        </div>
        {flash ? (
          <div className="text-xs font-medium text-accent">{flash}</div>
        ) : timer && (running || paused) ? (
          <div className={cx("flex items-center gap-1.5 text-xs tabular-nums", running ? "text-accent" : "text-muted")}>
            <span aria-hidden className={cx("size-1.5 rounded-full", running ? "bg-accent" : "bg-muted")} />
            {PHASE_LABEL[timer.phase]} {formatClock(remainingMs(timer, now))}
            {paused && " · paused"}
          </div>
        ) : (
          <div className="text-xs text-muted">{dateFormat.format(now)}</div>
        )}
      </div>
    </div>
  );
}

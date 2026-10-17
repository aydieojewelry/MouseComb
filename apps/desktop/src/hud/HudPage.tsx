import { events } from "@mousecomb/bindings";
import { formatClock, PHASE_LABEL, remainingMs, SETTINGS, usePomodoro, useSetting } from "@mousecomb/data";
import { cx } from "@mousecomb/ui";
import { useEffect, useState } from "react";

/** Re-render on every new second (or minute), aligned to the wall clock. */
function useNow(everyMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      setNow(Date.now());
      timer = setTimeout(tick, everyMs - (Date.now() % everyMs) + 5);
    };
    timer = setTimeout(tick, everyMs - (Date.now() % everyMs) + 5);
    return () => clearTimeout(timer);
  }, [everyMs]);
  return now;
}

/** Latest value pushed by a Rust event. Subscribing isn't fetching: the value only arrives this way. */
function useHudSignals() {
  const [opacity, setOpacity] = useState(1);
  const [flash, setFlash] = useState<string | null>(null);
  useEffect(() => {
    let clear: ReturnType<typeof setTimeout> | undefined;
    const stops = [
      events.hudFade.listen((e) => setOpacity(e.payload.opacity)),
      events.hudFlash.listen((e) => {
        setFlash(e.payload.text);
        clearTimeout(clear);
        clear = setTimeout(() => setFlash(null), 1800);
      }),
    ];
    return () => {
      clearTimeout(clear);
      stops.forEach((p) => void p.then((stop) => stop()));
    };
  }, []);
  return { opacity, flash };
}

const timeFormat = (seconds: boolean) =>
  new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", second: seconds ? "2-digit" : undefined });
const dateFormat = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short" });

/**
 * The HUD window (FEAT-001): clock, date and the Pomodoro countdown in the
 * screen corner. Click-through; fades as the mouse comes near (DEC-015).
 */
export function HudPage() {
  const [showSeconds] = useSetting(SETTINGS.hudShowSeconds);
  const { data: timer } = usePomodoro();
  const counting = Boolean(timer && (timer.running || !timer.fresh));
  const now = useNow(showSeconds || counting ? 1000 : 60_000);
  const { opacity, flash } = useHudSignals();

  return (
    <div className="flex h-full items-end justify-end p-1" style={{ opacity, transition: "opacity 120ms linear" }}>
      <div className="flex min-w-36 flex-col items-end gap-0.5 rounded-hud bg-idle/90 px-4 py-2.5 shadow-lg">
        <div className="font-display text-[26px] font-semibold leading-none tabular-nums text-fg">
          {timeFormat(showSeconds).format(now)}
        </div>
        {flash ? (
          <div className="text-xs font-medium text-accent">{flash}</div>
        ) : timer && counting ? (
          <div className={cx("flex items-center gap-1.5 text-xs tabular-nums", timer.running ? "text-accent" : "text-muted")}>
            <span aria-hidden className={cx("size-1.5 rounded-full", timer.running ? "bg-accent" : "bg-muted")} />
            {PHASE_LABEL[timer.phase]} {formatClock(remainingMs(timer, now))}
            {!timer.running && " · paused"}
          </div>
        ) : (
          <div className="text-xs text-muted">{dateFormat.format(now)}</div>
        )}
      </div>
    </div>
  );
}

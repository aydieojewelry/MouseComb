import { useEffect, useState } from "react";

/**
 * The current time, updated at each wall-clock boundary of `everyMs`
 * (each new second or minute). Stops updating while `active` is false.
 */
export function useNow(everyMs: number, active = true) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      setNow(Date.now());
      timer = setTimeout(tick, everyMs - (Date.now() % everyMs) + 5);
    };
    tick();
    return () => clearTimeout(timer);
  }, [everyMs, active]);
  return now;
}

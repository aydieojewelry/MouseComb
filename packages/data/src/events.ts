import type { Webview } from "@tauri-apps/api/webview";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useEffect, useRef } from "react";

type Listen<T> = { listen: (cb: (e: { payload: T }) => void) => Promise<() => void> };

/** A typed event from `@mousecomb/bindings` (`events.pomodoroChanged`, …). */
export type BackendEvent<T> = Listen<T> & ((target: Webview) => Listen<T>);

/**
 * Run `handler` for each event while the component is mounted.
 * `"this-window"` hears only events Rust sent to this window (`emit_to`);
 * by default a listener hears every event of that name, whoever it was for.
 */
export function useBackendEvent<T>(
  event: BackendEvent<T>,
  handler: (payload: T) => void,
  scope: "any" | "this-window" = "any",
) {
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => {
    const source = scope === "this-window" ? event(getCurrentWebviewWindow()) : event;
    const stop = source.listen((e) => latest.current(e.payload));
    return () => void stop.then((unlisten) => unlisten());
  }, [event, scope]);
}

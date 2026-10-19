import { commands, type Phase, type Pomodoro } from "@mousecomb/bindings";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";

import { queryKeys } from "./account";
import { createItemCollection } from "./items";

/** The timer, kept current by the `pomodoro-changed` event (see `connectBackendEvents`). */
export function usePomodoro() {
  return useQuery({ queryKey: queryKeys.pomodoro, queryFn: () => commands.pomodoroGet(), staleTime: Infinity });
}

const sessionSchema = z.object({
  started_at: z.number(),
  ended_at: z.number(),
  minutes: z.number().int().min(0),
});

export type PomodoroSession = z.infer<typeof sessionSchema> & { id: string };

/** Finished focus sessions, synced across devices (FEAT-002 stats). */
export const pomodoroSessionsCollection = createItemCollection<PomodoroSession>({
  id: "pomodoro-sessions",
  kind: "pomodoro",
  getKey: (s) => s.id,
  fromItem: (item) => {
    const parsed = sessionSchema.safeParse(item.data);
    return parsed.success ? { id: item.key, ...parsed.data } : null;
  },
  toData: ({ started_at, ended_at, minutes }) => ({ started_at, ended_at, minutes }),
});

export const PHASE_LABEL: Record<Phase, string> = {
  focus: "Focus",
  short_break: "Short break",
  long_break: "Long break",
};

export function isRunning(p: Pomodoro): boolean {
  return p.ends_at !== null;
}

/** What the start/pause control does next. */
export function pomodoroVerb(p: Pomodoro): "Pause" | "Start" | "Resume" {
  return isRunning(p) ? "Pause" : p.fresh ? "Start" : "Resume";
}

/** Milliseconds left, counting down while the timer runs. */
export function remainingMs(p: Pomodoro, now = Date.now()): number {
  return p.ends_at !== null ? Math.max(0, p.ends_at - now) : p.remaining_ms;
}

/** `25:00`, `4:05`, `1:02:03`. Rounds up so the display never shows 0:00 early. */
export function formatClock(ms: number): string {
  const total = Math.ceil(Math.max(0, ms) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** Sessions and focus minutes since `from` (ms since the Unix epoch). */
export function sessionStats(sessions: PomodoroSession[], from: number): { count: number; minutes: number } {
  const recent = sessions.filter((s) => s.ended_at >= from);
  return { count: recent.length, minutes: recent.reduce((sum, s) => sum + s.minutes, 0) };
}

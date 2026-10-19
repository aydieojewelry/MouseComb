import {
  errorMessage,
  formatClock,
  isRunning,
  PHASE_LABEL,
  pomodoroRound,
  pomodoroVerb,
  remainingMs,
  SETTINGS,
  upcomingPhases,
  usePomodoro,
  useRunAction,
  useSetting,
} from "@mousecomb/data";
import { AddIcon, ChevronLeftIcon, cx, Kbd, PauseIcon, PlayIcon, RoundButton, SkipIcon, SyncIcon, TimerDial } from "@mousecomb/ui";
import type { KeyboardEvent } from "react";

import { phaseColor } from "../components/phaseColor";
import { useNow } from "../components/useNow";

const endsAt = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

/** Cards further ahead are blurred a little: they haven't started yet. */
const AHEAD = ["", "", "blur-[1.4px] opacity-70"];

/**
 * The Pomodoro timer inside the OmniBar (FEAT-002, FEAT-004): a dial with
 * the time left, what comes next, and +5 min / Skip / Reset. Space, S, R and
 * + work from anywhere in the view; Esc goes back to the results.
 */
export function PomodoroView(props: { onBack: () => void }) {
  const { data: timer } = usePomodoro();
  const [focusMin] = useSetting(SETTINGS.pomodoroFocusMin);
  const [shortBreakMin] = useSetting(SETTINGS.pomodoroShortBreakMin);
  const [longBreakMin] = useSetting(SETTINGS.pomodoroLongBreakMin);
  const [every] = useSetting(SETTINGS.pomodoroLongBreakEvery);
  const run = useRunAction();
  const running = timer ? isRunning(timer) : false;
  const now = useNow(1000, running);
  if (!timer) return null;

  const act = (action: string) => run.mutate({ action });
  const left = remainingMs(timer, now);
  const color = phaseColor(timer);
  const verb = pomodoroVerb(timer);
  const cards = upcomingPhases(timer, { focusMin, shortBreakMin, longBreakMin, longBreakEvery: every });
  const round = `Round ${pomodoroRound(timer, every)} of ${every}`;
  const status = running && timer.ends_at !== null ? `${round} · ends at ${endsAt.format(timer.ends_at)}` : timer.fresh ? `${round} · ready` : `${round} · paused`;
  const detail = timer.fresh
    ? `${PHASE_LABEL[timer.phase]} · ${Math.round(timer.total_ms / 60_000)} min`
    : `${PHASE_LABEL[timer.phase]} · ${formatClock(timer.total_ms - left)} done`;

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      props.onBack();
      return;
    }
    // Space and Enter on a focused button press that button.
    if (e.target instanceof HTMLButtonElement && (e.key === " " || e.key === "Enter")) return;
    const action = { " ": "toggle", s: "skip", r: "reset", "+": "extend", "=": "extend" }[e.key.toLowerCase()];
    if (action && !e.ctrlKey && !e.altKey && !e.metaKey) {
      e.preventDefault();
      act(`ext.mc.pomodoro.${action}`);
    }
  };

  return (
    <div className="flex h-full flex-col" onKeyDown={onKeyDown}>
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-line px-4">
        <button
          type="button"
          aria-label="Back to results"
          onClick={props.onBack}
          className="grid size-8 place-items-center rounded-lg border border-line bg-button text-fg hover:border-muted"
        >
          <ChevronLeftIcon width={16} height={16} />
        </button>
        <span className="text-base font-semibold">Pomodoro</span>
        <span className="ml-auto text-[13px] text-muted">{status}</span>
      </div>

      <div className="flex min-h-0 flex-1 items-center gap-6 px-6 py-3">
        <TimerDial minutesLeft={left / 60_000} size={260} color={color} label={`Dial: ${formatClock(left)} left`}>
          {/* Focused when the view opens, so Space starts or pauses straight away. */}
          <RoundButton label={verb} size={96} raised autoFocus onClick={() => act("ext.mc.pomodoro.toggle")}>
            {running ? <PauseIcon width={30} height={30} strokeWidth={2} /> : <PlayIcon width={30} height={30} fill="currentColor" />}
          </RoundButton>
        </TimerDial>

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="flex flex-col gap-0.5">
            <span
              role="timer"
              aria-live="off"
              className="font-display text-[60px] font-bold leading-none tracking-[-0.02em] tabular-nums"
              style={{ color }}
            >
              {formatClock(left)}
            </span>
            <span className="text-sm text-muted">{detail}</span>
          </div>

          <ol className="grid grid-cols-3 gap-2" aria-label="Coming up">
            {cards.map((c, i) => (
              <li
                key={c.label}
                className={cx(
                  "flex flex-col gap-1 rounded-[10px] border-[1.5px] bg-raised px-3 py-2.5",
                  i === 0 ? "border-accent" : "border-line",
                  AHEAD[i],
                )}
              >
                <span
                  className={cx(
                    "font-mono text-[10px] font-semibold uppercase tracking-[0.06em]",
                    i === 0 ? "text-accent" : "text-muted",
                  )}
                >
                  {c.label}
                </span>
                <span className="text-lg font-bold">{c.minutes}m</span>
                <span className="text-[11px] text-muted">{PHASE_LABEL[c.phase]}</span>
              </li>
            ))}
          </ol>

          <div className="flex gap-5">
            <RoundButton label="Add 5 minutes" caption="+5 min" onClick={() => act("ext.mc.pomodoro.extend")}>
              <AddIcon width={18} height={18} />
            </RoundButton>
            <RoundButton label="Skip to the next phase" caption="Skip" onClick={() => act("ext.mc.pomodoro.skip")}>
              <SkipIcon width={18} height={18} />
            </RoundButton>
            <RoundButton label="Reset" caption="Reset" onClick={() => act("ext.mc.pomodoro.reset")}>
              <SyncIcon width={18} height={18} />
            </RoundButton>
          </div>
        </div>
      </div>

      <div className="flex h-9 shrink-0 items-center gap-3.5 border-t border-line px-5 text-xs text-muted">
        <span>
          <Kbd>Space</Kbd> {verb.toLowerCase()}
        </span>
        <span>
          <Kbd>S</Kbd> skip
        </span>
        <span>
          <Kbd>R</Kbd> reset
        </span>
        <span>
          <Kbd>Esc</Kbd> back
        </span>
        {run.error && (
          <span role="alert" className="ml-auto truncate text-danger">
            {errorMessage(run.error)}
          </span>
        )}
      </div>
    </div>
  );
}

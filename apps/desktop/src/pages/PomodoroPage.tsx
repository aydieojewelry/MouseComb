import {
  errorMessage,
  formatClock,
  isRunning,
  PHASE_LABEL,
  pomodoroVerb,
  pomodoroSessionsCollection,
  remainingMs,
  sessionStats,
  SETTINGS,
  usePomodoro,
  useRunAction,
  useSetting,
} from "@mousecomb/data";
import { Button, PauseIcon, PlayIcon, Section, SkipIcon, Slider, Switch, SyncIcon, cx, toaster } from "@mousecomb/ui";
import { useLiveQuery } from "@tanstack/react-db";
import { PageHeader } from "../components/PageHeader";
import { useDraft } from "../components/useDraft";
import { useNow } from "../components/useNow";

function TimerSection() {
  const { data: timer } = usePomodoro();
  const [every] = useSetting(SETTINGS.pomodoroLongBreakEvery);
  const run = useRunAction();
  const running = timer ? isRunning(timer) : false;
  const now = useNow(1000, running);
  if (!timer) return null;

  const left = remainingMs(timer, now);
  const progress = timer.total_ms > 0 ? 1 - left / timer.total_ms : 0;
  const act = (action: string) =>
    run.mutate({ action }, { onError: (e) => toaster.error({ title: "Pomodoro", description: errorMessage(e) }) });
  const inCycle = timer.completed % every;

  return (
    <Section title="Timer" description="Also in the OmniBar and the tray. The countdown shows on the clock in the corner of your screen.">
      <div className="flex flex-wrap items-center gap-8">
        <div className="relative grid size-40 shrink-0 place-items-center">
          <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90" aria-hidden>
            <circle cx="50" cy="50" r="45" fill="none" stroke="var(--color-raised)" strokeWidth="6" />
            <circle
              cx="50"
              cy="50"
              r="45"
              fill="none"
              stroke={timer.phase === "focus" ? "var(--color-accent)" : "var(--color-ok)"}
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={`${progress * 282.7} 282.7`}
            />
          </svg>
          <div className="flex flex-col items-center">
            <span className="font-display text-3xl font-semibold tabular-nums" role="timer" aria-live="off">
              {formatClock(left)}
            </span>
            <span className="text-xs text-muted">{PHASE_LABEL[timer.phase]}</span>
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => act("ext.mc.pomodoro.toggle")}>
              {running ? <PauseIcon /> : <PlayIcon />}
              {pomodoroVerb(timer)}
            </Button>
            <Button onClick={() => act("ext.mc.pomodoro.skip")}>
              <SkipIcon />
              Skip
            </Button>
            <Button variant="ghost" onClick={() => act("ext.mc.pomodoro.reset")}>
              <SyncIcon />
              Reset
            </Button>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted" aria-label={`${inCycle} of ${every} focus sessions before a long break`}>
            {Array.from({ length: every }, (_, i) => (
              <span key={i} className={cx("size-2.5 rounded-full", i < inCycle ? "bg-accent" : "bg-raised")} />
            ))}
            <span className="ml-1">long break after {every}</span>
          </div>
        </div>
      </div>
    </Section>
  );
}

function StatsSection() {
  const { data: sessions = [] } = useLiveQuery({ query: (q) => q.from({ s: pomodoroSessionsCollection }) });
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const today = sessionStats(sessions, startOfDay.getTime());
  const week = sessionStats(sessions, startOfDay.getTime() - 6 * 86_400_000);
  const Stat = (p: { label: string; value: string }) => (
    <div className="flex flex-col gap-0.5 rounded-lg bg-raised px-4 py-3">
      <span className="font-display text-xl font-semibold tabular-nums">{p.value}</span>
      <span className="text-xs text-muted">{p.label}</span>
    </div>
  );
  return (
    <Section title="Your focus" description="Finished focus sessions, from all your devices.">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="sessions today" value={String(today.count)} />
        <Stat label="minutes today" value={String(today.minutes)} />
        <Stat label="sessions, last 7 days" value={String(week.count)} />
        <Stat label="minutes, last 7 days" value={String(week.minutes)} />
      </div>
    </Section>
  );
}

function DurationSlider(props: { def: typeof SETTINGS.pomodoroFocusMin; label: string; max: number; min?: number; unit?: string }) {
  const [saved, save] = useSetting(props.def);
  const [draft, change] = useDraft(saved, save);
  return (
    <Slider label={props.label} value={draft} min={props.min ?? 1} max={props.max} unit={props.unit ?? " min"} onValueChange={change} />
  );
}

function DurationsSection() {
  const [autoStart, setAutoStart] = useSetting(SETTINGS.pomodoroAutoStart);
  return (
    <Section title="Durations" description="New lengths apply from the next phase. They sync to your other devices.">
      <DurationSlider def={SETTINGS.pomodoroFocusMin} label="Focus" max={120} />
      <DurationSlider def={SETTINGS.pomodoroShortBreakMin} label="Short break" max={60} />
      <DurationSlider def={SETTINGS.pomodoroLongBreakMin} label="Long break" max={60} />
      <DurationSlider def={SETTINGS.pomodoroLongBreakEvery} label="Long break after" min={2} max={12} unit=" sessions" />
      <Switch
        label="Start the next phase by itself"
        description="Otherwise MouseComb waits for you after each focus session and break."
        checked={autoStart}
        onCheckedChange={setAutoStart}
      />
    </Section>
  );
}

export function PomodoroPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 px-8 py-8">
      <PageHeader title="Pomodoro" description="Focus in short blocks with breaks in between. A notification tells you when each one ends." />
      <TimerSection />
      <StatsSection />
      <DurationsSection />
    </div>
  );
}

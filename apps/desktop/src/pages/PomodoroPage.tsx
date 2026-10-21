import {
  errorMessage,
  formatClock,
  isRunning,
  PHASE_LABEL,
  pomodoroRound,
  pomodoroSessionsCollection,
  pomodoroVerb,
  remainingMs,
  sessionStats,
  SETTINGS,
  usePomodoro,
  useRunAction,
  useSetting,
  type SettingDef,
} from "@mousecomb/data";
import { ChoiceGroup, PauseIcon, PlayIcon, RoundButton, Section, SkipIcon, Stepper, Switch, SyncIcon, TimerDial, toaster } from "@mousecomb/ui";
import { useLiveQuery } from "@tanstack/react-db";

import { phaseColor } from "../components/phaseColor";
import { PageHeader } from "../components/PageHeader";
import { useDraft } from "../components/useDraft";
import { useNow } from "../components/useNow";

function Stats() {
  const { data: sessions = [] } = useLiveQuery({ query: (q) => q.from({ s: pomodoroSessionsCollection }) });
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const today = sessionStats(sessions, startOfDay.getTime());
  const week = sessionStats(sessions, startOfDay.getTime() - 6 * 86_400_000);
  const tile = (value: string, label: string) => (
    <div className="flex flex-col rounded-[10px] bg-raised px-3.5 py-2.5">
      <span className="font-display text-xl font-bold tabular-nums">{value}</span>
      <span className="text-xs text-muted">{label}</span>
    </div>
  );
  return (
    <div className="flex min-w-36 flex-col gap-2 sm:ml-auto" aria-label="Finished focus sessions, from all your devices">
      {tile(String(today.count), today.count === 1 ? "session today" : "sessions today")}
      {tile(`${week.minutes} min`, "focus, last 7 days")}
    </div>
  );
}

function TimerCard() {
  const { data: timer } = usePomodoro();
  const [every] = useSetting(SETTINGS.pomodoroLongBreakEvery);
  const run = useRunAction();
  const running = timer ? isRunning(timer) : false;
  const now = useNow(1000, running);
  if (!timer) return null;

  const left = remainingMs(timer, now);
  const color = phaseColor(timer);
  const verb = pomodoroVerb(timer);
  const state = running ? `round ${pomodoroRound(timer, every)} of ${every}` : timer.fresh ? "ready" : "paused";
  const act = (action: string) =>
    run.mutate({ action }, { onError: (e) => toaster.error({ title: "Pomodoro", description: errorMessage(e) }) });

  return (
    <Section label="Timer">
      <div className="flex flex-wrap items-center gap-7">
        <TimerDial minutesLeft={left / 60_000} size={200} color={color} label={`Dial: ${formatClock(left)} left`}>
          <RoundButton label={verb} size={72} raised onClick={() => act("ext.mc.pomodoro.toggle")}>
            {running ? <PauseIcon width={24} height={24} strokeWidth={2} /> : <PlayIcon width={24} height={24} fill="currentColor" />}
          </RoundButton>
        </TimerDial>
        <div className="flex flex-col gap-3.5">
          <div className="flex flex-col gap-0.5">
            <span role="timer" aria-live="off" className="font-display text-[52px] font-bold leading-none tracking-[-0.02em] tabular-nums" style={{ color }}>
              {formatClock(left)}
            </span>
            <span className="text-sm text-muted">
              {PHASE_LABEL[timer.phase]} · {state}
            </span>
          </div>
          <div className="flex gap-4">
            <RoundButton label="Skip to the next phase" caption="Skip" onClick={() => act("ext.mc.pomodoro.skip")}>
              <SkipIcon width={18} height={18} />
            </RoundButton>
            <RoundButton label="Reset" caption="Reset" onClick={() => act("ext.mc.pomodoro.reset")}>
              <SyncIcon width={18} height={18} />
            </RoundButton>
          </div>
        </div>
        <Stats />
      </div>
    </Section>
  );
}

function Length(props: { def: SettingDef<number>; label: string; step: number; max: number; active: boolean }) {
  const [saved, save] = useSetting(props.def);
  const [draft, change] = useDraft(saved, save, 400);
  return (
    <Stepper label={props.label} value={draft} min={1} max={props.max} step={props.step} unit="min" active={props.active} onValueChange={change} />
  );
}

const EVERY_CHOICES = [2, 3, 4, 5, 6];

function RhythmCard() {
  const { data: timer } = usePomodoro();
  const [every, setEvery] = useSetting(SETTINGS.pomodoroLongBreakEvery);
  const [autoStart, setAutoStart] = useSetting(SETTINGS.pomodoroAutoStart);
  const phase = timer?.phase;
  const choices = [...new Set([...EVERY_CHOICES, every])].sort((a, b) => a - b).map((n) => ({ value: String(n), label: String(n) }));
  return (
    <Section title="Your rhythm" description="New lengths apply from the next phase and sync to your other devices.">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2.5">
        <Length def={SETTINGS.pomodoroFocusMin} label="Focus" step={5} max={120} active={phase === "focus"} />
        <Length def={SETTINGS.pomodoroShortBreakMin} label="Short break" step={1} max={60} active={phase === "short_break"} />
        <Length def={SETTINGS.pomodoroLongBreakMin} label="Long break" step={5} max={60} active={phase === "long_break"} />
      </div>
      <div className="flex flex-wrap items-center gap-2.5">
        <ChoiceGroup
          label="Long break after"
          variant="circle"
          value={String(every)}
          choices={choices}
          onValueChange={(v) => setEvery(Number(v))}
          className="justify-start gap-2.5"
        />
        <span className="text-sm text-muted">sessions</span>
      </div>
      <div className="border-t border-line pt-3.5">
        <Switch
          label="Start the next one by itself"
          description="Otherwise MouseComb waits for you after each focus session and break."
          checked={autoStart}
          onCheckedChange={setAutoStart}
        />
      </div>
    </Section>
  );
}

export function PomodoroPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 px-6 py-7">
      <PageHeader title="Pomodoro" />
      <TimerCard />
      <RhythmCard />
    </div>
  );
}

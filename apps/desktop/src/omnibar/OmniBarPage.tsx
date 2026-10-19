import { commands, events } from "@mousecomb/bindings";
import {
  errorMessage,
  formatClock,
  LOCAL_SETTINGS,
  PHASE_LABEL,
  pomodoroVerb,
  remainingMs,
  runAction,
  SETTINGS,
  snippetsCollection,
  useApps,
  useBackendEvent,
  useCommands,
  useHotkeyStatus,
  useLocalSetting,
  usePomodoro,
  useSetting,
  useUpdateStatus,
} from "@mousecomb/data";
import {
  AppsIcon,
  BoltIcon,
  CalculatorIcon,
  CommandPalette,
  GearIcon,
  GlobeIcon,
  Kbd,
  PowerIcon,
  SnippetIcon,
  TimerIcon,
  type Icon,
} from "@mousecomb/ui";
import { useLiveQuery } from "@tanstack/react-db";
import { useMutation } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";

import { PomodoroView } from "./PomodoroView";
import { rememberRecent, search, type Result } from "./search";

function iconFor(r: Result): Icon {
  if (r.kind === "app") return AppsIcon;
  if (r.kind === "snippet") return SnippetIcon;
  if (r.kind === "calc") return CalculatorIcon;
  if (r.kind === "url" || r.kind === "search") return GlobeIcon;
  if (r.action.startsWith("core.os.power.")) return PowerIcon;
  if (r.group === "windows") return GearIcon;
  if (r.group === "pomodoro") return TimerIcon;
  return BoltIcon;
}

/** The OmniBar window (FEAT-004): type, pick, Enter. Esc clears, then closes. */
export function OmniBarPage() {
  const [view, setView] = useState<"results" | "pomodoro">("results");
  const [query, setQuery] = useState("");
  const [armed, setArmed] = useState<string | null>(null);
  const [openId, setOpenId] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: catalog = [] } = useCommands();
  const { data: apps = [] } = useApps();
  const { data: snippets = [] } = useLiveQuery({ query: (q) => q.from({ s: snippetsCollection }) });
  const { data: timer } = usePomodoro();
  const { data: update } = useUpdateStatus();
  const { data: hotkey } = useHotkeyStatus();
  const [searchUrl] = useSetting(SETTINGS.omnibarSearchUrl);
  const [recents, setRecents] = useLocalSetting(LOCAL_SETTINGS.omnibarRecents);

  const run = useMutation({
    mutationFn: (r: Result) => runAction({ action: r.action, args: r.args, confirmed: r.confirm }),
    onSuccess: (_, r) => {
      setArmed(null);
      setQuery("");
      void setRecents(rememberRecent(recents, r.key));
      // A view (the Pomodoro timer) opens in place; anything else is done.
      if (r.action !== "mc.omnibar.open") void commands.omnibarHide();
    },
  });

  // Fresh every time the window opens, on the view Rust asked for.
  useBackendEvent(events.omniBarOpened, ({ view: next }) => {
    setView(next === "pomodoro" ? "pomodoro" : "results");
    setOpenId((n) => n + 1);
    setQuery("");
    setArmed(null);
    run.reset();
    inputRef.current?.focus();
  });

  const backToResults = () => {
    setView("results");
    setOpenId((n) => n + 1);
    // The input mounts again on the next render.
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const pomodoroTitle =
    timer &&
    `${pomodoroVerb(timer)} Pomodoro · ${PHASE_LABEL[timer.phase]} ${formatClock(remainingMs(timer))}${timer.fresh ? "" : " left"}`;

  const items = useMemo(() => {
    const extra =
      update?.state === "ready"
        ? [
            {
              key: "mc.update.install",
              action: "mc.update.install",
              with: null,
              title: `Restart to update to ${update.version ?? "the new version"}`,
              hint: "MouseComb",
              keywords: ["update", "upgrade", "restart"],
              group: "mouse_comb" as const,
              confirm: false,
            },
          ]
        : [];
    return search(query, { commands: [...extra, ...catalog], apps, snippets, recents, searchUrl, pomodoroTitle });
  }, [query, catalog, apps, snippets, recents, searchUrl, pomodoroTitle, update]);

  const select = (r: Result) => {
    if (r.confirm && armed !== r.key) {
      setArmed(r.key);
      return;
    }
    run.mutate(r);
  };

  const status = run.error ? (
    <span role="alert" className="text-danger">
      {errorMessage(run.error)}
    </span>
  ) : armed ? (
    <span className="text-warn">Press Enter again to {items.find((i) => i.key === armed)?.title.toLowerCase() ?? "confirm"}.</span>
  ) : null;

  return (
    <div className="h-full p-2">
      <div className="h-full overflow-hidden rounded-modal border border-line bg-surface/95 shadow-2xl backdrop-blur-xl">
        {view === "pomodoro" ? (
          <PomodoroView onBack={backToResults} />
        ) : (
          <CommandPalette
            items={items}
            openId={openId}
            inputRef={inputRef}
            inputValue={query}
            onInputValueChange={(v) => {
              setQuery(v);
              setArmed(null);
              if (run.error) run.reset();
            }}
            onSelect={select}
            onEscape={() => {
              if (query) {
                setQuery("");
                setArmed(null);
              } else {
                void commands.omnibarHide();
              }
            }}
            placeholder="Search apps, commands, snippets, or type a sum…"
            status={status}
            emptyText="Nothing matches. Try fewer letters."
            renderItem={(r, highlighted) => {
              const ItemIcon = iconFor(r);
              return (
                <div className="flex w-full min-w-0 items-center gap-3">
                  <ItemIcon className={highlighted ? "shrink-0 text-accent" : "shrink-0 text-muted"} />
                  <span className="min-w-0 flex-1 truncate text-sm text-fg">{r.title}</span>
                  <span className="max-w-[45%] shrink-0 truncate text-xs text-muted">{r.hint}</span>
                  {r.confirm && <span className="shrink-0 rounded bg-danger/15 px-1.5 text-[11px] text-danger">confirm</span>}
                </div>
              );
            }}
            footer={
              <div className="flex items-center justify-between gap-4">
                <span className="flex items-center gap-3">
                  <span>
                    <Kbd>↵</Kbd> run
                  </span>
                  <span>
                    <Kbd>↑</Kbd> <Kbd>↓</Kbd> move
                  </span>
                  <span>
                    <Kbd>Esc</Kbd> {query ? "clear" : "close"}
                  </span>
                </span>
                <span className="truncate">{hotkey?.registered ? `${hotkey.hotkey} opens this anywhere` : "MouseComb"}</span>
              </div>
            }
          />
        )}
      </div>
    </div>
  );
}

import { LOCAL_SETTINGS, errorMessage, useHotkeyStatus, useLocalSetting } from "@mousecomb/data";
import { Button, Kbd, Switch, TimerIcon, toaster, type Icon, BoltIcon, CloudSyncIcon } from "@mousecomb/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { enable } from "@tauri-apps/plugin-autostart";
import { useState } from "react";

import { CredentialsForm } from "../components/CredentialsForm";

function Point(props: { icon: Icon; title: string; children: React.ReactNode }) {
  const PointIcon = props.icon;
  return (
    <li className="flex gap-3">
      <PointIcon className="mt-0.5 shrink-0 text-accent" />
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-semibold">{props.title}</span>
        <span className="text-sm text-muted">{props.children}</span>
      </div>
    </li>
  );
}

/** First launch (FEAT-021): sign in to sync, or use MouseComb offline (DEC-017). */
export function WelcomePage() {
  const navigate = useNavigate();
  const client = useQueryClient();
  const { data: hotkey } = useHotkeyStatus();
  const [, setDone] = useLocalSetting(LOCAL_SETTINGS.onboardingDone);
  const [telemetry, setTelemetry] = useLocalSetting(LOCAL_SETTINGS.telemetryEnabled);
  const [startWithWindows, setStartWithWindows] = useState(true);
  const keys = (hotkey?.hotkey ?? "Alt+Space").split("+");

  const finish = async () => {
    try {
      if (startWithWindows) await enable();
      await client.invalidateQueries({ queryKey: ["autostart"] });
    } catch (e) {
      toaster.error({ title: "Couldn't turn on start with Windows", description: errorMessage(e) });
    }
    await setDone(true);
    await navigate({ to: "/general" });
    toaster.success({ title: "You're set", description: `Press ${keys.join("+")} anywhere to open the OmniBar.` });
  };

  return (
    <div className="flex h-full overflow-y-auto bg-idle">
      <div className="m-auto grid w-full max-w-4xl gap-10 px-10 py-10 md:grid-cols-[1fr_minmax(0,24rem)]">
        <section className="flex flex-col gap-6">
          <div className="flex items-center gap-3">
            <img src="/logo.svg" alt="" className="size-10" />
            <h1 className="m-0 font-display text-3xl font-semibold tracking-tight">Welcome to MouseComb</h1>
          </div>
          <ul className="m-0 flex list-none flex-col gap-4 p-0">
            <Point icon={BoltIcon} title="The OmniBar">
              Press{" "}
              {keys.map((k, i) => (
                <span key={k}>
                  {i > 0 && " + "}
                  <Kbd>{k}</Kbd>
                </span>
              ))}{" "}
              anywhere to open apps, run commands, do sums, search the web and open Settings.
            </Point>
            <Point icon={TimerIcon} title="Clock and Pomodoro">
              A small clock sits in the corner of your screen and fades when your mouse comes near. Start a focus session
              from the OmniBar; the countdown shows right there.
            </Point>
            <Point icon={CloudSyncIcon} title="Your setup, everywhere">
              Sign in to keep settings and snippets the same on every PC. Everything works without an account too.
            </Point>
          </ul>
          <div className="flex flex-col gap-4 rounded-modal border border-line p-4">
            <Switch
              label="Start MouseComb with Windows"
              description="It waits in the tray, out of your way."
              checked={startWithWindows}
              onCheckedChange={setStartWithWindows}
            />
            <Switch
              label="Share anonymous usage counts"
              description="Which features get used and whether the app crashes, to decide what to build next. Never what you type, your clipboard, snippets, window titles or file names. Change it any time in Settings."
              checked={telemetry}
              onCheckedChange={(on) => void setTelemetry(on)}
            />
          </div>
        </section>
        <section className="flex flex-col gap-4 self-center rounded-modal border border-line bg-surface p-6">
          <div className="flex flex-col gap-1">
            <h2 className="m-0 font-display text-lg font-semibold">Sign in to sync</h2>
            <p className="m-0 text-sm text-muted">Free while MouseComb is in early access.</p>
          </div>
          <CredentialsForm onSignedIn={() => void finish()} />
          <div className="flex items-center gap-3 text-xs text-muted">
            <span className="h-px flex-1 bg-line" />
            or
            <span className="h-px flex-1 bg-line" />
          </div>
          <Button onClick={() => void finish()}>Use offline</Button>
        </section>
      </div>
    </div>
  );
}

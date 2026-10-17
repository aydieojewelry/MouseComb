import { EXTENSION_SETTINGS, SETTINGS, errorMessage, useExtensionSetting, useSetting } from "@mousecomb/data";
import { Kbd, Section, Slider, Switch, TextField, toaster } from "@mousecomb/ui";
import { useDebouncedCallback } from "@tanstack/react-pacer";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { useEffect, useState } from "react";

import { HudPreview } from "../components/HudPreview";
import { PageHeader } from "../components/PageHeader";

/** Local edits show at once; saving waits until the user pauses (TanStack Pacer). */
function useDraft<T>(saved: T, save: (value: T) => void, wait = 300) {
  const [draft, setDraft] = useState(saved);
  useEffect(() => setDraft(saved), [saved]);
  const debouncedSave = useDebouncedCallback(save, { wait });
  const change = (value: T) => {
    setDraft(value);
    debouncedSave(value);
  };
  return [draft, change] as const;
}

function StartupSection() {
  const client = useQueryClient();
  const autostart = useQuery({ queryKey: ["autostart"], queryFn: isEnabled });
  const toggle = useMutation({
    mutationFn: (on: boolean) => (on ? enable() : disable()),
    onSuccess: () => client.invalidateQueries({ queryKey: ["autostart"] }),
    onError: (e) => toaster.error({ title: "Couldn't change startup", description: errorMessage(e) }),
  });
  return (
    <Section title="Startup">
      <Switch
        label="Start MouseComb when you sign in to Windows"
        description="It starts in the tray, out of your way. This setting stays on this PC."
        checked={autostart.data ?? false}
        disabled={autostart.isPending || toggle.isPending}
        onCheckedChange={(on) => toggle.mutate(on)}
      />
    </Section>
  );
}

function HudSection() {
  const [near, setNear] = useSetting(SETTINGS.hudFadeNearPx);
  const [far, setFar] = useSetting(SETTINGS.hudFadeFarPx);
  const [seconds, setSeconds] = useSetting(SETTINGS.hudShowSeconds);
  const [nearDraft, changeNear] = useDraft(near, setNear);
  const [farDraft, changeFar] = useDraft(far, setFar);

  return (
    <Section
      title="HUD clock"
      description="The small clock in the bottom-right corner fades away as your mouse gets close, so it never covers what you're clicking. The HUD itself arrives in milestone M2; these settings already save and sync."
    >
      <HudPreview nearPx={nearDraft} farPx={farDraft} showSeconds={seconds} />
      <Slider
        label="Fully hidden within"
        value={nearDraft}
        min={0}
        max={400}
        step={10}
        unit=" px"
        onValueChange={(v) => {
          changeNear(v);
          if (v + 40 > farDraft) changeFar(Math.min(800, v + 40));
        }}
      />
      <Slider
        label="Fully visible beyond"
        value={farDraft}
        min={40}
        max={800}
        step={10}
        unit=" px"
        onValueChange={(v) => changeFar(Math.max(v, nearDraft + 40))}
      />
      <Switch label="Show seconds" checked={seconds} onCheckedChange={setSeconds} />
    </Section>
  );
}

function HyperKeySection() {
  const [toggleMs, setToggleMs] = useSetting(SETTINGS.hyperToggleMs);
  const [draft, change] = useDraft(toggleMs, setToggleMs);
  return (
    <Section
      title="CapsLock Hyper-Key"
      description={
        <>
          Hold <Kbd>CapsLock</Kbd> with another key to run your shortcuts. Hold it alone to switch real CapsLock on or
          off. The Hyper-Key arrives in milestone M1.
        </>
      }
    >
      <Slider
        label="Hold CapsLock alone this long to toggle it"
        value={draft}
        min={500}
        max={5000}
        step={100}
        unit=" ms"
        onValueChange={change}
      />
    </Section>
  );
}

function WeatherSection() {
  const [city, setCity] = useExtensionSetting(EXTENSION_SETTINGS.weatherCity);
  const [draft, change] = useDraft(city, (value: string) => {
    if (value.trim()) setCity(value.trim());
  }, 600);
  return (
    <Section
      title="Weather"
      description="Settings for the bundled Weather extension. Extension data syncs like everything else."
    >
      <TextField
        label="City"
        value={draft}
        maxLength={80}
        placeholder="Karachi"
        error={draft.trim() ? undefined : "Enter a city name."}
        onChange={(e) => change(e.target.value)}
      />
    </Section>
  );
}

export function GeneralPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 px-8 py-8">
      <PageHeader title="General" description="Changes save as you make them and sync to your other devices." />
      <StartupSection />
      <HudSection />
      <HyperKeySection />
      <WeatherSection />
    </div>
  );
}

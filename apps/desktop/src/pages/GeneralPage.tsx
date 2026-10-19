import {
  errorMessage,
  FADE_PRESETS,
  fadePresetOf,
  LOCAL_SETTINGS,
  SEARCH_ENGINES,
  searchEngineOf,
  SETTINGS,
  useHotkeyStatus,
  useLocalSetting,
  useSetting,
  type FadePreset,
  type SearchEngine,
} from "@mousecomb/data";
import {
  Button,
  ChoiceGroup,
  ClockFace,
  DIAL_FACES,
  DIGITAL_FACES,
  FACE_NAMES,
  Section,
  ShortcutKeys,
  Switch,
  TextField,
  toaster,
  useShortcutRecorder,
  type ClockLook,
} from "@mousecomb/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { useState } from "react";

import { HudPreview } from "../components/HudPreview";
import { PageHeader } from "../components/PageHeader";
import { useDraft } from "../components/useDraft";
import { useNow } from "../components/useNow";

function OmniBarCard() {
  const [hotkey, setHotkey] = useSetting(SETTINGS.omnibarHotkey);
  const { data: status } = useHotkeyStatus();
  const { recording, buttonProps } = useShortcutRecorder(setHotkey);
  const error = status && !status.registered && status.hotkey === hotkey ? status.message : null;
  return (
    <Section title="Open the OmniBar">
      <div className="flex min-h-13 items-center gap-2">
        {recording ? (
          <span className="text-sm text-accent">Press the new shortcut. Esc cancels.</span>
        ) : (
          <ShortcutKeys shortcut={hotkey} size="lg" separator={<span aria-hidden className="text-lg text-muted">+</span>} />
        )}
        <Button
          {...buttonProps}
          className="ml-auto"
          aria-label={recording ? "Press the new shortcut, or Escape to cancel" : `Change the shortcut, now ${hotkey}`}
        >
          {recording ? "Cancel" : "Change"}
        </Button>
      </div>
      {error ? (
        <span role="alert" className="text-xs text-danger">
          {error}
        </span>
      ) : (
        <span className="text-xs text-muted">Works in every app.</span>
      )}
    </Section>
  );
}

const engineChoices = [
  ...Object.entries(SEARCH_ENGINES).map(([value, e]) => ({ value: value as SearchEngine, label: e.label })),
  { value: "custom" as const, label: "Custom…" },
];

function SearchCard() {
  const [url, setUrl] = useSetting(SETTINGS.omnibarSearchUrl);
  const [customPicked, setCustomPicked] = useState(false);
  const engine = searchEngineOf(url);
  const choice = customPicked || !engine ? "custom" : engine;
  const [draft, change] = useDraft(
    url,
    (value: string) => {
      if (SETTINGS.omnibarSearchUrl.schema.safeParse(value).success) setUrl(value.trim());
    },
    600,
  );
  const check = SETTINGS.omnibarSearchUrl.schema.safeParse(draft);
  return (
    <Section title="Search the web with">
      <ChoiceGroup
        label="Search the web with"
        hideLabel
        variant="chip"
        value={choice}
        choices={engineChoices}
        onValueChange={(v) => {
          setCustomPicked(v === "custom");
          if (v !== "custom") setUrl(SEARCH_ENGINES[v].url);
        }}
      />
      {choice === "custom" ? (
        <TextField
          label="Search address"
          value={draft}
          spellCheck={false}
          helper="{q} is replaced by what you typed."
          error={check.success ? undefined : check.error.issues[0]?.message}
          onChange={(e) => change(e.target.value)}
        />
      ) : (
        <span className="text-xs text-muted">Type a question in the OmniBar and press Enter.</span>
      )}
    </Section>
  );
}

const fadeChoices = Object.entries(FADE_PRESETS).map(([value, p]) => ({ value: value as FadePreset, label: p.label }));

function ClockCard() {
  const [enabled, setEnabled] = useSetting(SETTINGS.hudEnabled);
  const [style, setStyle] = useSetting(SETTINGS.hudStyle);
  const [dialFace, setDialFace] = useSetting(SETTINGS.hudDialFace);
  const [digitalFace, setDigitalFace] = useSetting(SETTINGS.hudDigitalFace);
  const [near, setNear] = useSetting(SETTINGS.hudFadeNearPx);
  const [far, setFar] = useSetting(SETTINGS.hudFadeFarPx);
  const [seconds, setSeconds] = useSetting(SETTINGS.hudShowSeconds);
  const date = new Date(useNow(seconds ? 1000 : 60_000));
  const look: ClockLook = style === "analog" ? { style, face: dialFace } : { style, face: digitalFace };
  const face = (l: ClockLook) => <ClockFace look={l} date={date} showSeconds={seconds} scale={l.style === "analog" ? 0.625 : 0.72} />;

  return (
    <Section
      title="Clock on screen"
      aside={<Switch label="Clock on screen" hideLabel checked={enabled} onCheckedChange={setEnabled} />}
    >
      <ChoiceGroup
        label="Style"
        variant="segment"
        value={style}
        choices={[
          { value: "analog", label: "Analog" },
          { value: "digital", label: "Digital" },
        ]}
        onValueChange={setStyle}
      />
      {style === "analog" ? (
        <ChoiceGroup
          label="Dial face"
          hideLabel
          variant="card"
          value={dialFace}
          choices={DIAL_FACES.map((f) => ({ value: f, label: FACE_NAMES[f], preview: face({ style: "analog", face: f }) }))}
          onValueChange={setDialFace}
        />
      ) : (
        <ChoiceGroup
          label="Digital face"
          hideLabel
          variant="card"
          value={digitalFace}
          choices={DIGITAL_FACES.map((f) => ({ value: f, label: FACE_NAMES[f], preview: face({ style: "digital", face: f }) }))}
          onValueChange={setDigitalFace}
        />
      )}
      <HudPreview look={look} nearPx={near} farPx={far} showSeconds={seconds} date={date} />
      <ChoiceGroup
        label="Fade away when the mouse is"
        variant="segment"
        value={fadePresetOf(near, far)}
        choices={fadeChoices}
        onValueChange={(v) => {
          setNear(FADE_PRESETS[v].near);
          setFar(FADE_PRESETS[v].far);
        }}
      />
      <Switch label="Show seconds" checked={seconds} onCheckedChange={setSeconds} />
    </Section>
  );
}

function BasicsCard() {
  const client = useQueryClient();
  const autostart = useQuery({ queryKey: ["autostart"], queryFn: isEnabled });
  const toggle = useMutation({
    mutationFn: (on: boolean) => (on ? enable() : disable()),
    onSuccess: () => client.invalidateQueries({ queryKey: ["autostart"] }),
    onError: (e) => toaster.error({ title: "Couldn't change startup", description: errorMessage(e) }),
  });
  const [telemetry, setTelemetry] = useLocalSetting(LOCAL_SETTINGS.telemetryEnabled);
  const [details, setDetails] = useState(false);
  return (
    <Section title="Basics">
      <Switch
        label="Start with Windows"
        description="It starts in the tray, out of your way. This stays on this PC."
        checked={autostart.data ?? false}
        disabled={autostart.isPending || toggle.isPending}
        onCheckedChange={(on) => toggle.mutate(on)}
      />
      <div className="flex flex-col gap-1.5">
        <Switch
          label="Share anonymous usage counts"
          description="Never your keys, text, clipboard or file names."
          checked={telemetry}
          onCheckedChange={(on) => void setTelemetry(on)}
        />
        <button
          type="button"
          aria-expanded={details}
          onClick={() => setDetails(!details)}
          className="self-start text-xs text-accent hover:text-accent-hover"
        >
          What's shared
        </button>
        {details && (
          <p className="max-w-prose text-xs text-muted">
            Counts of what you use (the OmniBar opening, which command ran, Pomodoros started and finished), errors and start-up
            time, with a random install id and the app and Windows versions. Never keys you press, anything you type, your
            clipboard, snippets, window titles or file names. Collection starts in a later update; nothing is sent today. This
            setting stays on this PC.
          </p>
        )}
      </div>
    </Section>
  );
}

export function GeneralPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 px-6 py-7">
      <PageHeader title="General" />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4">
        <OmniBarCard />
        <SearchCard />
      </div>
      <ClockCard />
      <BasicsCard />
    </div>
  );
}

import { commands } from "@mousecomb/bindings";
import { eq, useLiveQuery } from "@tanstack/react-db";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { z } from "zod";

import { queryKeys } from "./account";
import { unwrap } from "./errors";
import { createItemCollection } from "./items";

type SettingRow = { key: string; value: unknown };

/** Synced settings: one item per key (APP_SPEC §10). */
export const settingsCollection = createItemCollection<SettingRow>({
  id: "settings",
  kind: "setting",
  getKey: (row) => row.key,
  fromItem: (item) => ({ key: item.key, value: item.data }),
  toData: (row) => row.value,
});

/** Per-extension data: item kind `ext`, key `<extension id>/<key>` (FEAT-016 storage). */
export const extensionDataCollection = createItemCollection<SettingRow>({
  id: "extension-data",
  kind: "ext",
  getKey: (row) => row.key,
  fromItem: (item) => ({ key: item.key, value: item.data }),
  toData: (row) => row.value,
});

/** A setting the core knows: its key, schema and default. */
export type SettingDef<T> = { key: string; schema: z.ZodType<T>; default: T };

function defineSetting<T>(key: string, schema: z.ZodType<T>, fallback: T): SettingDef<T> {
  return { key, schema, default: fallback };
}

/** Words for {@link SETTINGS.omnibarSearchUrl}: must be a web address with `{q}` in it. */
const searchUrl = z
  .string()
  .trim()
  .regex(/^https?:\/\/\S+$/, "Use a web address starting with https://")
  .refine((s) => s.includes("{q}"), "Put {q} where the search words go.");

/**
 * Core settings available now. Later milestones add theirs here.
 * Keys and defaults the Rust side acts on are mirrored in `src-tauri/src/prefs.rs`.
 */
export const SETTINGS = {
  hyperToggleMs: defineSetting("hyper.capslock_toggle_ms", z.number().int().min(500).max(5000), 1500),
  hudEnabled: defineSetting("hud.enabled", z.boolean(), true),
  hudFadeNearPx: defineSetting("hud.fade_near_px", z.number().int().min(0).max(400), 60),
  hudFadeFarPx: defineSetting("hud.fade_far_px", z.number().int().min(40).max(800), 220),
  hudShowSeconds: defineSetting("hud.show_seconds", z.boolean(), false),
  omnibarHotkey: defineSetting("omnibar.hotkey", z.string().trim().min(1).max(64), "Alt+Space"),
  omnibarSearchUrl: defineSetting("omnibar.search_url", searchUrl, "https://duckduckgo.com/?q={q}"),
  pomodoroFocusMin: defineSetting("pomodoro.focus_min", z.number().int().min(1).max(120), 25),
  pomodoroShortBreakMin: defineSetting("pomodoro.short_break_min", z.number().int().min(1).max(60), 5),
  pomodoroLongBreakMin: defineSetting("pomodoro.long_break_min", z.number().int().min(1).max(60), 15),
  pomodoroLongBreakEvery: defineSetting("pomodoro.long_break_every", z.number().int().min(2).max(12), 4),
  pomodoroAutoStart: defineSetting("pomodoro.auto_start", z.boolean(), false),
} as const;

/** Settings that stay on this device (APP_SPEC §5), stored outside sync. */
export const LOCAL_SETTINGS = {
  /** The first-launch sign-in page was finished (FEAT-021). */
  onboardingDone: defineSetting("onboarding.done", z.boolean(), false),
  /** Anonymous usage counts (FEAT-024, DEC-018). Collection starts in M2. */
  telemetryEnabled: defineSetting("telemetry.enabled", z.boolean(), true),
  /** OmniBar entries run most recently, newest first. */
  omnibarRecents: defineSetting("omnibar.recents", z.array(z.string().max(300)).max(30), [] as string[]),
} as const;

export function localSettingQuery<T>(def: SettingDef<T>) {
  return queryOptions({
    queryKey: [...queryKeys.localSettings, def.key] as const,
    queryFn: async () => {
      const raw = await unwrap(commands.localSettingGet(def.key));
      const parsed = def.schema.safeParse(raw);
      return parsed.success ? parsed.data : def.default;
    },
    staleTime: Infinity,
  });
}

/** Read and write one device-only setting. */
export function useLocalSetting<T>(def: SettingDef<T>): readonly [T, (value: T) => Promise<void>] {
  const client = useQueryClient();
  const { data } = useQuery(localSettingQuery(def));
  const set = useCallback(
    async (next: T) => {
      const checked = def.schema.parse(next);
      client.setQueryData(localSettingQuery(def).queryKey, checked);
      await unwrap(commands.localSettingSet(def.key, checked));
    },
    [client, def],
  );
  return [data ?? def.default, set] as const;
}

/** Extension settings for the bundled extensions that have UI today. */
export const EXTENSION_SETTINGS = {
  weatherCity: defineSetting("mc.weather/city", z.string().trim().min(1).max(80), "Karachi"),
} as const;

function useValue<T>(
  collection: typeof settingsCollection,
  def: SettingDef<T>,
): readonly [T, (value: T) => void] {
  const { data } = useLiveQuery({
    query: (q) => q.from({ s: collection }).where(({ s }) => eq(s.key, def.key)),
  });
  const row = data?.[0];
  const parsed = row ? def.schema.safeParse(row.value) : undefined;
  const value = parsed?.success ? parsed.data : def.default;

  const set = useCallback(
    (next: T) => {
      const checked = def.schema.parse(next);
      if (collection.has(def.key)) {
        collection.update(def.key, (draft) => {
          draft.value = checked;
        });
      } else {
        collection.insert({ key: def.key, value: checked });
      }
    },
    [collection, def],
  );

  return [value, set] as const;
}

/** Read and write one synced core setting. */
export function useSetting<T>(def: SettingDef<T>) {
  return useValue(settingsCollection, def);
}

/** Read and write one value stored by an extension. */
export function useExtensionSetting<T>(def: SettingDef<T>) {
  return useValue(extensionDataCollection, def);
}

import { eq, useLiveQuery } from "@tanstack/react-db";
import { useCallback } from "react";
import { z } from "zod";

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

/** Core settings available now. Later milestones add theirs here. */
export const SETTINGS = {
  hyperToggleMs: defineSetting("hyper.capslock_toggle_ms", z.number().int().min(500).max(5000), 1500),
  hudFadeNearPx: defineSetting("hud.fade_near_px", z.number().int().min(0).max(400), 60),
  hudFadeFarPx: defineSetting("hud.fade_far_px", z.number().int().min(40).max(800), 220),
  hudShowSeconds: defineSetting("hud.show_seconds", z.boolean(), false),
} as const;

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

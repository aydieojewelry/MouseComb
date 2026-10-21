import { commands, type Command } from "@mousecomb/bindings";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";

import { queryKeys } from "./account";
import { createItemCollection } from "./items";
import type { Snippet } from "./snippets";

/** What a user edits. Mirrors `mc_core::bindings::Binding`. */
export const bindingInputSchema = z.object({
  title: z.string().max(120).default(""),
  /** `hotkey:Ctrl+Alt+P`, `hyper:K`, `gesture:caps:left` (see `mc_core::bindings::Trigger`). */
  trigger: z.string().min(1),
  action: z.string().min(1),
  with: z.unknown().default(null),
  only_in: z.array(z.string().trim().min(1).max(260)).max(20).default([]),
  not_in: z.array(z.string().trim().min(1).max(260)).max(20).default([]),
  enabled: z.boolean().default(true),
});

export type BindingInput = z.infer<typeof bindingInputSchema>;
export type Binding = BindingInput & { id: string; updated: number };

/** Triggers connected to actions, synced across devices (FEAT-014). */
export const bindingsCollection = createItemCollection<Binding>({
  id: "bindings",
  kind: "binding",
  getKey: (b) => b.id,
  fromItem: (item) => {
    const parsed = bindingInputSchema.safeParse(item.data);
    return parsed.success ? { id: item.key, updated: item.mtime, ...parsed.data } : null;
  },
  toData: ({ title, trigger, action, with: args, only_in, not_in, enabled }) => ({
    title,
    trigger,
    action,
    with: args ?? null,
    only_in,
    not_in,
    enabled,
  }),
});

export async function newBindingId(): Promise<string> {
  return commands.itemNewKey();
}

export type GestureButton = "caps" | "rmb";
export type GestureDirection = "left" | "right" | "up" | "down";

export type TriggerView =
  | { kind: "hotkey"; shortcut: string }
  | { kind: "hyper"; key: string }
  | { kind: "gesture"; button: GestureButton; direction: GestureDirection };

export function parseTrigger(text: string): TriggerView | null {
  const [head, ...rest] = text.split(":");
  const tail = rest.join(":");
  if (head === "hotkey" && tail) return { kind: "hotkey", shortcut: tail };
  if (head === "hyper" && tail) return { kind: "hyper", key: tail };
  if (head === "gesture") {
    const [button, direction] = tail.split(":");
    if ((button === "caps" || button === "rmb") && ["left", "right", "up", "down"].includes(direction ?? "")) {
      return { kind: "gesture", button, direction: direction as GestureDirection };
    }
  }
  return null;
}

export const GESTURE_ARROW: Record<GestureDirection, string> = { left: "←", right: "→", up: "↑", down: "↓" };

/** A trigger in words, for lists and screen readers. */
export function triggerWords(text: string): string {
  const t = parseTrigger(text);
  if (!t) return text;
  if (t.kind === "hotkey") return t.shortcut.replaceAll("+", " + ");
  if (t.kind === "hyper") return `CapsLock + ${t.key}`;
  return `${t.button === "caps" ? "CapsLock + drag" : "Right-button drag"} ${t.direction}`;
}

function sameScope(a: Binding, b: Binding): boolean {
  const norm = (p: string) => p.trim().toLowerCase().replace(/\.exe$/, "");
  const apps = (list: string[]) => new Set(list.map(norm));
  if (a.only_in.length && b.only_in.length) {
    const left = apps(a.only_in);
    return b.only_in.some((p) => left.has(norm(p)));
  }
  return true;
}

/** Ids of enabled bindings that share a trigger and could both apply (the earlier id wins). */
export function conflictingBindings(bindings: readonly Binding[]): Set<string> {
  const out = new Set<string>();
  const live = bindings.filter((b) => b.enabled);
  for (const [i, a] of live.entries()) {
    for (const b of live.slice(i + 1)) {
      if (a.trigger === b.trigger && sameScope(a, b)) {
        out.add(a.id);
        out.add(b.id);
      }
    }
  }
  return out;
}

/** One thing a binding can run, as the picker lists it. */
export type ActionChoice = {
  /** Unique: the OmniBar key, or `snippet-type:<id>`. */
  key: string;
  group: string;
  title: string;
  action: string;
  args: unknown;
};

const GROUP_TITLE: Record<Command["group"], string> = { mouse_comb: "MouseComb", pomodoro: "Pomodoro", windows: "Windows" };

/** Everything bindable: the OmniBar commands, plus each snippet to type or copy. */
export function actionChoices(commandList: readonly Command[], snippets: readonly Snippet[]): ActionChoice[] {
  const fromCommands = commandList.map((c) => ({
    key: c.key,
    group: GROUP_TITLE[c.group],
    title: c.title,
    action: c.action,
    args: c.with ?? null,
  }));
  const fromSnippets = snippets.flatMap((s) => [
    { key: `snippet-type:${s.id}`, group: "Snippets", title: `Type “${s.title}”`, action: "ext.mc.snippets.type", args: { id: s.id } },
    { key: `snippet-copy:${s.id}`, group: "Snippets", title: `Copy “${s.title}”`, action: "ext.mc.snippets.copy", args: { id: s.id } },
  ]);
  return [...fromCommands, ...fromSnippets];
}

/** The picker entry a binding runs, matched by action and arguments. */
export function choiceFor(choices: readonly ActionChoice[], b: Pick<Binding, "action" | "with">): ActionChoice | undefined {
  const same = (x: unknown, y: unknown) => JSON.stringify(x ?? null) === JSON.stringify(y ?? null);
  return choices.find((c) => c.action === b.action && same(c.args, b.with));
}

/** Hotkeys, the Hyper-Key and gestures: what is registered or running, and what failed. */
export function useInputStatus() {
  return useQuery({ queryKey: queryKeys.inputStatus, queryFn: () => commands.inputStatusGet(), staleTime: Infinity });
}

import type { Command } from "@mousecomb/bindings";
import { describe, expect, it } from "vitest";

import { actionChoices, choiceFor, conflictingBindings, parseTrigger, triggerWords, type Binding } from "./bindings";

const binding = (id: string, trigger: string, extra: Partial<Binding> = {}): Binding => ({
  id,
  updated: 1,
  title: "",
  trigger,
  action: "mc.sync.now",
  with: null,
  only_in: [],
  not_in: [],
  enabled: true,
  ...extra,
});

describe("triggers", () => {
  it("parse and read aloud", () => {
    expect(parseTrigger("hotkey:Ctrl+Alt+P")).toEqual({ kind: "hotkey", shortcut: "Ctrl+Alt+P" });
    expect(parseTrigger("hyper:K")).toEqual({ kind: "hyper", key: "K" });
    expect(parseTrigger("gesture:rmb:up")).toEqual({ kind: "gesture", button: "rmb", direction: "up" });
    expect(parseTrigger("gesture:rmb:sideways")).toBeNull();
    expect(parseTrigger("nonsense")).toBeNull();
    expect(triggerWords("hotkey:Ctrl+Alt+P")).toBe("Ctrl + Alt + P");
    expect(triggerWords("hyper:K")).toBe("CapsLock + K");
    expect(triggerWords("gesture:caps:left")).toBe("CapsLock + drag left");
  });
});

describe("conflicts", () => {
  it("flags enabled bindings that share a trigger and could both apply", () => {
    const list = [
      binding("a", "hotkey:Ctrl+K"),
      binding("b", "hotkey:Ctrl+K"),
      binding("c", "hotkey:Ctrl+J"),
      binding("d", "hotkey:Ctrl+L", { only_in: ["Code.exe"] }),
      binding("e", "hotkey:Ctrl+L", { only_in: ["chrome"] }),
      binding("f", "hotkey:Ctrl+M", { enabled: false }),
      binding("g", "hotkey:Ctrl+M"),
    ];
    expect([...conflictingBindings(list)].sort()).toEqual(["a", "b"]);
  });

  it("treats the same program with or without .exe as one", () => {
    const list = [binding("a", "hotkey:F9", { only_in: ["Code.exe"] }), binding("b", "hotkey:F9", { only_in: ["code"] })];
    expect(conflictingBindings(list).size).toBe(2);
  });
});

describe("action choices", () => {
  const commands: Command[] = [
    { key: "mc.sync.now", action: "mc.sync.now", with: null, title: "Sync now", hint: "", keywords: [], group: "mouse_comb", confirm: false },
  ];
  const snippets = [{ id: "s1", title: "Sign-off", text: "Best,", tags: [], updated: 1 }];

  it("lists commands and each snippet to type or copy, and finds a binding's entry", () => {
    const choices = actionChoices(commands, snippets);
    expect(choices.map((c) => c.title)).toEqual(["Sync now", "Type “Sign-off”", "Copy “Sign-off”"]);
    expect(choiceFor(choices, binding("x", "hotkey:F1", { action: "ext.mc.snippets.type", with: { id: "s1" } }))?.key).toBe("snippet-type:s1");
    expect(choiceFor(choices, binding("x", "hotkey:F1"))?.title).toBe("Sync now");
    expect(choiceFor(choices, binding("x", "hotkey:F1", { action: "gone" }))).toBeUndefined();
  });
});

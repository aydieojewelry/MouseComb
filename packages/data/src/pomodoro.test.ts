import type { Pomodoro } from "@mousecomb/bindings";
import { describe, expect, it } from "vitest";

import { pomodoroRound, upcomingPhases } from "./pomodoro";
import { fadePresetOf, searchEngineOf } from "./settings";

const MIN = 60_000;
const rhythm = { focusMin: 25, shortBreakMin: 5, longBreakMin: 15, longBreakEvery: 4 };
const timer = (p: Partial<Pomodoro>): Pomodoro => ({
  phase: "focus",
  ends_at: null,
  remaining_ms: 25 * MIN,
  total_ms: 25 * MIN,
  completed: 0,
  fresh: true,
  started_at: null,
  ...p,
});

describe("upcomingPhases", () => {
  it("shows now, next and when the long break comes", () => {
    const cards = upcomingPhases(timer({ completed: 1 }), rhythm);
    expect(cards.map((c) => [c.label, c.phase, c.minutes])).toEqual([
      ["Now", "focus", 25],
      ["Next", "short_break", 5],
      ["After 4", "long_break", 15],
    ]);
  });

  it("shows the focus after the long break when the long break is next", () => {
    const cards = upcomingPhases(timer({ completed: 3, total_ms: 30 * MIN }), rhythm);
    expect(cards.map((c) => [c.label, c.phase, c.minutes])).toEqual([
      ["Now", "focus", 30],
      ["Next", "long_break", 15],
      ["Then", "focus", 25],
    ]);
  });

  it("follows a break with focus", () => {
    expect(upcomingPhases(timer({ phase: "short_break", completed: 1, total_ms: 5 * MIN }), rhythm)[1]).toEqual({
      label: "Next",
      phase: "focus",
      minutes: 25,
    });
  });
});

describe("pomodoroRound", () => {
  it("counts focus rounds; a break belongs to the round before it", () => {
    expect(pomodoroRound(timer({}), 4)).toBe(1);
    expect(pomodoroRound(timer({ completed: 1 }), 4)).toBe(2);
    expect(pomodoroRound(timer({ phase: "short_break", completed: 1 }), 4)).toBe(1);
    expect(pomodoroRound(timer({ phase: "long_break", completed: 4 }), 4)).toBe(4);
    expect(pomodoroRound(timer({ completed: 4 }), 4)).toBe(1);
  });
});

describe("setting presets", () => {
  it("matches fade distances to a preset, or none", () => {
    expect(fadePresetOf(60, 220)).toBe("medium");
    expect(fadePresetOf(100, 320)).toBe("far");
    expect(fadePresetOf(70, 220)).toBeNull();
  });

  it("recognises the offered search engines", () => {
    expect(searchEngineOf("https://duckduckgo.com/?q={q}")).toBe("duckduckgo");
    expect(searchEngineOf(" https://www.google.com/search?q={q} ")).toBe("google");
    expect(searchEngineOf("https://search.brave.com/search?q={q}")).toBeNull();
  });
});

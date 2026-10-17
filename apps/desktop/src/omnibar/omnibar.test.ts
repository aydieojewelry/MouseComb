import type { Command } from "@mousecomb/bindings";
import { describe, expect, it } from "vitest";

import { calculate, evaluate } from "./calc";
import { asUrl, matchScore, rememberRecent, search, type Sources } from "./search";

describe("calculator", () => {
  it("does arithmetic with the usual precedence", () => {
    expect(calculate("2+3*4")).toBe("14");
    expect(calculate("(2+3)*4")).toBe("20");
    expect(calculate("2^3^2")).toBe("512");
    expect(calculate("-2^2")).toBe("-4");
    expect(calculate("10 / 4")).toBe("2.5");
    expect(calculate("0.1 + 0.2")).toBe("0.3");
    expect(calculate("1,250 × 4")).toBe("5000");
    expect(calculate("7 ÷ 2")).toBe("3.5");
  });

  it("knows percent, constants and functions", () => {
    expect(calculate("200 * 15%")).toBe("30");
    expect(calculate("1250*4 + 12%")).toBe("5600");
    expect(calculate("100 - 20%")).toBe("80");
    expect(calculate("50%")).toBe("0.5");
    expect(calculate("sqrt(16) + 1")).toBe("5");
    expect(calculate("sqrt 81")).toBe("9");
    expect(calculate("2pi")).toBe(String(Number((2 * Math.PI).toPrecision(12))));
    expect(calculate("log(1000)")).toBe("3");
  });

  it("ignores things that aren't sums", () => {
    expect(calculate("42")).toBeNull();
    expect(calculate("settings")).toBeNull();
    expect(calculate("2 +")).toBeNull();
    expect(calculate("1/0")).toBeNull();
    expect(calculate("alert(1)")).toBeNull();
    expect(evaluate("constructor")).toBeNull();
  });
});

const cmd = (key: string, title: string, keywords: string[] = []): Command => ({
  key,
  action: key,
  with: null,
  title,
  hint: "MouseComb",
  keywords,
  group: "mouse_comb",
  confirm: false,
});

const sources: Sources = {
  commands: [
    cmd("mc.settings.open", "Open Settings", ["preferences"]),
    cmd("ext.mc.pomodoro.toggle", "Start or pause Pomodoro", ["timer", "focus"]),
    cmd("ext.mc.pomodoro.reset", "Reset Pomodoro", ["stop", "timer"]),
    cmd("core.os.power.lock", "Lock screen"),
  ],
  apps: [
    { name: "Visual Studio Code", id: "code" },
    { name: "Calculator", id: "calc" },
  ],
  snippets: [{ id: "s1", title: "Work log entry", text: "[{TIME}] #dev", tags: ["log"], updated: 1 }],
  recents: [],
  searchUrl: "https://duckduckgo.com/?q={q}",
};

describe("OmniBar search", () => {
  it("ranks prefix, word starts, initials and letters in order", () => {
    expect(matchScore("open", "Open Settings")).toBeGreaterThan(matchScore("set", "Open Settings"));
    expect(matchScore("vsc", "Visual Studio Code")).toBeGreaterThan(0);
    expect(matchScore("stg", "Open Settings")).toBeGreaterThan(0);
    expect(matchScore("zzz", "Open Settings")).toBe(0);
  });

  it("finds commands by keyword, apps and snippets, and ends with web search", () => {
    const timer = search("timer", sources);
    expect(timer[0]?.title).toBe("Start or pause Pomodoro");
    expect(search("vsc", sources)[0]?.title).toBe("Visual Studio Code");
    expect(search("work", sources)[0]?.kind).toBe("snippet");
    expect(timer.at(-1)).toMatchObject({ kind: "search", args: { url: "https://duckduckgo.com/?q=timer" } });
  });

  it("puts the calculator and web addresses first", () => {
    expect(search("12*3", sources)[0]).toMatchObject({ kind: "calc", title: "36", args: { text: "36" } });
    expect(search("github.com/tauri-apps", sources)[0]).toMatchObject({ kind: "url", args: { url: "https://github.com/tauri-apps" } });
    expect(asUrl("not a url")).toBeNull();
    expect(asUrl("version")).toBeNull();
  });

  it("shows recents first when empty, and remembers runs", () => {
    const recents = rememberRecent(rememberRecent([], "cmd:core.os.power.lock"), "app:code");
    expect(recents).toEqual(["app:code", "cmd:core.os.power.lock"]);
    expect(rememberRecent(recents, "calc")).toBe(recents);
    const empty = search("", { ...sources, recents });
    expect(empty.slice(0, 2).map((r) => r.key)).toEqual(["app:code", "cmd:core.os.power.lock"]);
    expect(empty.some((r) => r.kind === "snippet")).toBe(false);
  });

  it("shows what the Pomodoro toggle will do, and still finds it by name", () => {
    const live = { ...sources, pomodoroTitle: "Start Pomodoro · Focus 25:00" };
    expect(search("pomodoro", live)[0]?.title).toBe("Start Pomodoro · Focus 25:00");
    expect(search("start or pause", live)[0]?.title).toBe("Start Pomodoro · Focus 25:00");
    expect(search("timer", live)[0]?.action).toBe("ext.mc.pomodoro.toggle");
  });
});

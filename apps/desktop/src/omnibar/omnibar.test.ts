import type { Command } from "@mousecomb/bindings";
import { describe, expect, it } from "vitest";

import { BUILTIN_BANGS, bangUrl, parseBang, resolveBang } from "./bangs";
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
    const typing = search("work", sources).find((r) => r.action === "ext.mc.snippets.type");
    expect(typing).toMatchObject({ title: "Type “Work log entry”", args: { id: "s1" } });
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

describe("bangs", () => {
  const mine = [{ trigger: "jira", name: "Jira", url: "https://acme.atlassian.net/browse/?jql=text~{q}" }];

  it("finds a bang at the start, end or middle of the text", () => {
    expect(parseBang("!yt cats")).toEqual({ trigger: "yt", terms: "cats" });
    expect(parseBang("cats !yt")).toEqual({ trigger: "yt", terms: "cats" });
    expect(parseBang("funny !yt cats")).toEqual({ trigger: "yt", terms: "funny cats" });
    expect(parseBang("!YT cats")).toEqual({ trigger: "yt", terms: "cats" });
    expect(parseBang("wow!yt")).toBeNull();
    expect(parseBang("what!? no")).toBeNull();
    expect(parseBang("plain words")).toBeNull();
  });

  it("uses your own bang first, then the built-in list, then DuckDuckGo", () => {
    expect(resolveBang("!jira login bug", mine)?.site).toMatchObject({ name: "Jira", fallback: false });
    expect(resolveBang("!g", [{ trigger: "g", name: "Mine", url: "https://x.test/?q={q}" }])?.site.name).toBe("Mine");
    expect(resolveBang("!yt cats", mine)?.site.name).toBe("YouTube");
    expect(resolveBang("!wayback example.com", mine)?.site).toMatchObject({ fallback: true });
    expect(resolveBang("no bang here", mine)).toBeNull();
  });

  it("builds the address, encoding the words", () => {
    const yt = resolveBang("!yt cats & dogs", [])!;
    expect(bangUrl(yt)).toBe("https://www.youtube.com/results?search_query=cats%20%26%20dogs");
    expect(bangUrl(resolveBang("!yt", [])!)).toBe("https://www.youtube.com");
    expect(bangUrl(resolveBang("!wayback example.com", [])!)).toBe("https://duckduckgo.com/?q=!wayback+example.com");
    expect(bangUrl(resolveBang("!wayback", [])!)).toBe("https://duckduckgo.com/?q=!wayback");
  });

  it("every built-in bang has a {q} and a valid address", () => {
    for (const [trigger, site] of Object.entries(BUILTIN_BANGS)) {
      expect(trigger).toMatch(/^[a-z0-9]{1,16}$/);
      expect(site.url).toContain("{q}");
      expect(() => new URL(site.url.replace("{q}", "x"))).not.toThrow();
    }
  });

  it("comes first in the OmniBar, ahead of the calculator and the web fallback", () => {
    const out = search("!yt cats", { ...sources, bangs: [] });
    expect(out[0]).toMatchObject({
      kind: "search",
      title: "Search YouTube for “cats”",
      action: "core.os.shell.open_url",
      args: { url: "https://www.youtube.com/results?search_query=cats" },
    });
    expect(search("2+2 !g", sources)[0]?.key).toBe("bang:g");
    expect(search("!jira bug", { ...sources, bangs: mine })[0]?.hint).toBe("!jira · acme.atlassian.net");
    expect(rememberRecent([], "bang:yt")).toEqual([]);
  });
});

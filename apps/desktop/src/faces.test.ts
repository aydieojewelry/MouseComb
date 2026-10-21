import { clockParts, dialMarks, faceSize, handAngles } from "@mousecomb/ui";
import { describe, expect, it } from "vitest";

describe("timer dial", () => {
  it("marks the minutes left, with a dot every half minute", () => {
    const g = dialMarks(18.7);
    expect(g.ticks).toHaveLength(60);
    expect(g.ticks.filter((t) => t.on)).toHaveLength(19);
    expect(g.ticks.filter((t) => t.major)).toHaveLength(12);
    expect(g.dots.filter((d) => d.on)).toHaveLength(19); // 0.5 … 18.5
    expect(g.labels.filter((l) => l.quarter).map((l) => l.text)).toEqual(["0", "15", "30", "45"]);
    expect(g.arc).toMatch(/^M 150 53 A 97 97 0 0 1 /);
  });

  it("draws nothing past the top and still shows a full hour", () => {
    expect(dialMarks(0).arc).toBe("");
    expect(dialMarks(90).arc).toMatch(/ 0 1 1 /);
    expect(dialMarks(-3).ticks.filter((t) => t.on)).toHaveLength(1);
  });
});

describe("clock faces", () => {
  const date = new Date(2026, 9, 19, 14, 5, 32);

  it("turns the hands", () => {
    const a = handAngles(date);
    expect(a.hour).toBeCloseTo(62.5 + 32 / 120);
    expect(a.minute).toBeCloseTo(33.2);
    expect(a.second).toBe(192);
  });

  it("splits the time for faces that size its parts apart", () => {
    const withSeconds = clockParts(date, true);
    expect(withSeconds.seconds).toBe("32");
    expect(withSeconds.text).toContain("05");
    expect(clockParts(date, false).seconds).toBe("");
    expect(withSeconds.hoursMinutes).toMatch(/0?2|14/);
  });

  it("has the sizes the HUD window is made for", () => {
    expect(faceSize("analog")).toEqual({ width: 96, height: 96 });
    expect(faceSize("digital")).toEqual({ width: 150, height: 58 });
  });
});

import { describe, expect, it } from "vitest";

import { inlineParts, parseChangelog } from "./changelog";

const SAMPLE = `# Changelog

Intro text that belongs to no version.

## Next
- something the owner wants

## 0.1.0+2 — 2026-10-21 — hotkeys and gestures

Everything below
is new.

Second paragraph.

### Features
- **Hotkeys:** bind any key
  combination to an action.
- Mouse gestures

### Fixes
- It works.

## 0.0.0+1 — 2026-10-20
### Fixed
- One thing
`;

describe("parseChangelog", () => {
  const entries = parseChangelog(SAMPLE);

  it("reads versions newest first, skipping Next and the intro", () => {
    expect(entries.map((e) => e.version)).toEqual(["0.1.0+2", "0.0.0+1"]);
    expect(entries[0]).toMatchObject({ date: "2026-10-21", name: "hotkeys and gestures", intro: ["Everything below is new.", "Second paragraph."] });
    expect(entries[1]).toMatchObject({ date: "2026-10-20", name: null });
  });

  it("reads groups and joins wrapped bullets", () => {
    expect(entries[0]!.groups.map((g) => g.title)).toEqual(["Features", "Fixes"]);
    expect(entries[0]!.groups[0]!.items).toEqual(["**Hotkeys:** bind any key combination to an action.", "Mouse gestures"]);
  });
});

describe("inlineParts", () => {
  it("splits bold and code", () => {
    expect(inlineParts("Press **Alt+Space** or `mc.settings.open` now")).toEqual([
      { kind: "text", text: "Press " },
      { kind: "bold", text: "Alt+Space" },
      { kind: "text", text: " or " },
      { kind: "code", text: "mc.settings.open" },
      { kind: "text", text: " now" },
    ]);
    expect(inlineParts("plain")).toEqual([{ kind: "text", text: "plain" }]);
  });
});

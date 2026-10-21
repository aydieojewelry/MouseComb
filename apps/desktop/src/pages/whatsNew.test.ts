import { parseChangelog } from "@mousecomb/data";
import { describe, expect, it } from "vitest";

import changelog from "../../../../CHANGELOG.md?raw";

describe("the real CHANGELOG.md", () => {
  it("has numbered versions the What's New page can read", () => {
    const entries = parseChangelog(changelog);
    expect(entries.length).toBeGreaterThan(0);
    for (const e of entries) {
      expect(e.version).toMatch(/^\d+\.\d+\.\d+\+\d+$/);
      expect(e.groups.length + e.intro.length).toBeGreaterThan(0);
    }
  });
});

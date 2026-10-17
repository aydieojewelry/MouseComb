import { describe, expect, it } from "vitest";

import { describeSync } from "./components/SyncBadge";
import { timeAgo } from "./time";

const now = Date.UTC(2026, 9, 17, 12, 0, 0);
const status = (s: Partial<Parameters<typeof describeSync>[0] & object>) => ({
  state: "idle" as const,
  last_synced_at: null,
  message: null,
  pending: 0,
  ...s,
});

describe("timeAgo", () => {
  it("reads naturally", () => {
    expect(timeAgo(now - 10_000, now)).toBe("just now");
    expect(timeAgo(now - 3 * 60_000, now)).toBe("3 min ago");
    expect(timeAgo(now - 2 * 3_600_000, now)).toBe("2 h ago");
    expect(timeAgo(now - 86_400_000, now)).toBe("1 day ago");
    expect(timeAgo(now + 5_000, now)).toBe("just now");
  });
});

describe("describeSync", () => {
  it("covers every state in plain words", () => {
    expect(describeSync(undefined, now)).toEqual({ tone: "muted", label: "Not syncing" });
    expect(describeSync(status({ state: "signed_out" }), now).label).toBe("Not syncing");
    expect(describeSync(status({ state: "syncing" }), now).label).toBe("Syncing…");
    expect(describeSync(status({ state: "offline" }), now)).toEqual({ tone: "warn", label: "Offline, will retry" });
    expect(describeSync(status({ state: "error" }), now).tone).toBe("danger");
    expect(describeSync(status({ pending: 1 }), now).label).toBe("1 change waiting");
    expect(describeSync(status({ pending: 3 }), now).label).toBe("3 changes waiting");
    expect(describeSync(status({ last_synced_at: now - 120_000 }), now)).toEqual({ tone: "ok", label: "Synced 2 min ago" });
  });
});

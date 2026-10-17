import type { SyncStatus } from "@mousecomb/bindings";
import { useAccount, useSyncStatus } from "@mousecomb/data";
import { StatusDot } from "@mousecomb/ui";
import { Link } from "@tanstack/react-router";

import { timeAgo } from "../time";

/** Short, plain description of the sync state. */
export function describeSync(status: SyncStatus | undefined, now = Date.now()): {
  tone: "ok" | "warn" | "danger" | "muted" | "accent";
  label: string;
} {
  if (!status || status.state === "signed_out") return { tone: "muted", label: "Not syncing" };
  if (status.state === "syncing") return { tone: "accent", label: "Syncing…" };
  if (status.state === "offline") return { tone: "warn", label: "Offline, will retry" };
  if (status.state === "error") return { tone: "danger", label: "Sync problem" };
  if (status.pending > 0) return { tone: "warn", label: `${status.pending} change${status.pending === 1 ? "" : "s"} waiting` };
  return {
    tone: "ok",
    label: status.last_synced_at ? `Synced ${timeAgo(status.last_synced_at, now)}` : "Up to date",
  };
}

export function SyncBadge() {
  const { data: status } = useSyncStatus();
  const { data: account } = useAccount();
  const { tone, label } = describeSync(status);
  return (
    <Link
      to="/account"
      className="flex items-center gap-2 rounded-lg px-2 py-2 text-xs text-muted transition-colors hover:bg-raised hover:text-fg"
      title={account ? `Signed in as ${account.email}` : "Sign in to sync your setup"}
    >
      <StatusDot tone={tone} pulse={status?.state === "syncing"} />
      <span className="truncate">{label}</span>
    </Link>
  );
}

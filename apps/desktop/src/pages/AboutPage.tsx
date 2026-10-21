import { errorMessage, useAppInfo, useRunAction, useUpdateStatus } from "@mousecomb/data";
import { Button, DownloadIcon, Section, StatusDot, SyncIcon, toaster } from "@mousecomb/ui";
import { Link } from "@tanstack/react-router";

import { PageHeader } from "../components/PageHeader";
import { timeAgo } from "../time";

function UpdatesSection() {
  const { data: status } = useUpdateStatus();
  const run = useRunAction();
  if (!status) return null;
  const act = (action: string) =>
    run.mutate({ action }, { onError: (e) => toaster.error({ title: "Updates", description: errorMessage(e) }) });

  const line = (() => {
    switch (status.state) {
      case "disabled":
        return { tone: "muted" as const, text: status.message ?? "Updates are off in this build." };
      case "checking":
        return { tone: "accent" as const, text: "Checking for updates…" };
      case "downloading":
        return {
          tone: "accent" as const,
          text: `Downloading ${status.version ?? "update"}${status.progress !== null ? ` · ${Math.round(status.progress * 100)}%` : "…"}`,
        };
      case "ready":
        return { tone: "ok" as const, text: `Version ${status.version} is ready. It installs when you restart MouseComb.` };
      case "error":
        return { tone: "danger" as const, text: status.message ?? "The last check didn't work." };
      case "up_to_date":
        return { tone: "ok" as const, text: `Up to date${status.checked_at ? `, checked ${timeAgo(status.checked_at)}` : ""}.` };
      default:
        return { tone: "muted" as const, text: "MouseComb checks for updates when it starts and once a day." };
    }
  })();

  return (
    <Section
      title="Updates"
      description="New versions come out weekly. They download in the background and install on the next restart."
      aside={
        status.state === "ready" ? (
          <Button variant="primary" busy={run.isPending} onClick={() => act("mc.update.install")}>
            <DownloadIcon />
            Restart to update
          </Button>
        ) : (
          <Button
            disabled={status.state === "disabled"}
            busy={run.isPending || status.state === "checking" || status.state === "downloading"}
            onClick={() => act("mc.update.check")}
          >
            <SyncIcon />
            Check now
          </Button>
        )
      }
    >
      <p className="m-0 flex items-center gap-2 text-sm">
        <StatusDot tone={line.tone} pulse={status.state === "checking" || status.state === "downloading"} />
        {line.text}
      </p>
      {status.state === "ready" && status.notes && (
        <pre className="m-0 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-raised p-3 font-sans text-xs text-muted">{status.notes}</pre>
      )}
    </Section>
  );
}

export function AboutPage() {
  const { data: info } = useAppInfo();
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 px-8 py-8">
      <PageHeader title="About" description="MouseComb, early access." />
      <Section title="This copy">
        <dl className="grid grid-cols-[8rem_1fr] gap-x-4 gap-y-3 text-sm">
          <dt className="text-muted">Version</dt>
          <dd className="m-0 font-mono text-xs leading-5">{info?.version ?? "…"}</dd>
          <dt className="text-muted">Device id</dt>
          <dd className="m-0 select-all font-mono text-xs leading-5">{info?.device_id ?? "…"}</dd>
          <dt className="text-muted">Data folder</dt>
          <dd className="m-0 select-all break-all font-mono text-xs leading-5">{info?.data_dir ?? "…"}</dd>
        </dl>
      </Section>
      <UpdatesSection />
      <Section
        title="What's new"
        description="What changed in each version, in plain words."
        aside={
          <Link to="/whats-new" className="rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-raised">
            See what's new
          </Link>
        }
      >
        <p className="m-0 text-sm text-muted">It opens by itself once after an update.</p>
      </Section>
    </div>
  );
}

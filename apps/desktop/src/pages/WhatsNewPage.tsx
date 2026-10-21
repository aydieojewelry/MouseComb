import { inlineParts, parseChangelog, useAppInfo, type ChangelogEntry } from "@mousecomb/data";
import { Section } from "@mousecomb/ui";
import { Fragment } from "react";

import changelog from "../../../../CHANGELOG.md?raw";
import { PageHeader } from "../components/PageHeader";

const ENTRIES = parseChangelog(changelog);

function Inline({ text }: { text: string }) {
  return (
    <>
      {inlineParts(text).map((p, i) =>
        p.kind === "bold" ? (
          <strong key={i} className="font-semibold">
            {p.text}
          </strong>
        ) : p.kind === "code" ? (
          <code key={i} className="rounded bg-raised px-1 py-0.5 font-mono text-xs">
            {p.text}
          </code>
        ) : (
          <Fragment key={i}>{p.text}</Fragment>
        ),
      )}
    </>
  );
}

function Entry({ entry, installed }: { entry: ChangelogEntry; installed: boolean }) {
  return (
    <Section
      title={entry.name ? `${entry.version} · ${entry.name}` : entry.version}
      description={entry.date ?? undefined}
      aside={installed ? <span className="rounded-full bg-accent/15 px-2.5 py-1 text-xs font-medium text-accent">You have this</span> : undefined}
    >
      {entry.intro.map((p) => (
        <p key={p} className="m-0 max-w-prose text-sm">
          <Inline text={p} />
        </p>
      ))}
      {entry.groups.map((g) => (
        <div key={g.title} className="flex flex-col gap-1.5">
          <h3 className="m-0 text-xs font-semibold uppercase tracking-wide text-muted">{g.title}</h3>
          <ul className="m-0 flex list-disc flex-col gap-1.5 pl-5 text-sm">
            {g.items.map((item) => (
              <li key={item}>
                <Inline text={item} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </Section>
  );
}

/** What changed in each release, read from CHANGELOG.md (FEAT-022). */
export function WhatsNewPage() {
  const { data: info } = useAppInfo();
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 px-6 py-7">
      <PageHeader title="What's new" description={info ? `You're on ${info.version}.` : undefined} />
      {ENTRIES.length === 0 ? (
        <Section label="Nothing yet">
          <p className="m-0 text-sm text-muted">No release notes yet.</p>
        </Section>
      ) : (
        ENTRIES.slice(0, 8).map((e) => <Entry key={e.version} entry={e} installed={e.version === info?.version} />)
      )}
    </div>
  );
}

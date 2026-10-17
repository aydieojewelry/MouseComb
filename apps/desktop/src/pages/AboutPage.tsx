import { useAppInfo } from "@mousecomb/data";
import { Section } from "@mousecomb/ui";

import { PageHeader } from "../components/PageHeader";

const BUILT = [
  "Tray app that starts with Windows and keeps running when you close this window",
  "Settings, snippets and extension data saved on this PC",
  "Account sign-in and sync with your MouseComb server",
];

const NEXT = [
  "M1: CapsLock Hyper-Key and bindable Windows actions",
  "M2: OmniBar launcher and the bindings editor",
  "M3: Workflows",
];

export function AboutPage() {
  const { data: info } = useAppInfo();
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 px-8 py-8">
      <PageHeader title="About" description="MouseComb, pre-production build." />
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
      <Section title="What works in this build">
        <ul className="m-0 flex list-disc flex-col gap-1.5 pl-5 text-sm">
          {BUILT.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      </Section>
      <Section title="Coming next">
        <ul className="m-0 flex list-disc flex-col gap-1.5 pl-5 text-sm text-muted">
          {NEXT.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

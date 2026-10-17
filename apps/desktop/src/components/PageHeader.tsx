import type { ReactNode } from "react";

export function PageHeader(props: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex items-end justify-between gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-semibold tracking-tight">{props.title}</h1>
        {props.description && <p className="text-sm text-muted">{props.description}</p>}
      </div>
      {props.actions}
    </header>
  );
}

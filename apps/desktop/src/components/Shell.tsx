import { CloudSyncIcon, InfoIcon, SlidersIcon, SnippetIcon, type Icon } from "@mousecomb/ui";
import { Link, Outlet } from "@tanstack/react-router";

import { SyncBadge } from "./SyncBadge";

const nav: Array<{ to: "/general" | "/snippets" | "/account" | "/about"; label: string; icon: Icon }> = [
  { to: "/general", label: "General", icon: SlidersIcon },
  { to: "/snippets", label: "Snippets", icon: SnippetIcon },
  { to: "/account", label: "Account & sync", icon: CloudSyncIcon },
  { to: "/about", label: "About", icon: InfoIcon },
];

export function Shell() {
  return (
    <div className="flex h-full">
      <aside className="flex w-56 shrink-0 flex-col gap-6 border-r border-line bg-idle px-3 py-5">
        <div className="flex items-center gap-2.5 px-2">
          <img src="/logo.svg" alt="" className="size-7" />
          <span className="font-display text-base font-semibold tracking-tight">MouseComb</span>
        </div>
        <nav className="flex flex-col gap-0.5" aria-label="Settings sections">
          {nav.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm text-muted transition-colors hover:bg-raised hover:text-fg"
              activeProps={{ className: "bg-raised !text-fg" }}
            >
              <Icon className="shrink-0" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto px-1">
          <SyncBadge />
        </div>
      </aside>
      <main className="relative min-w-0 flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}

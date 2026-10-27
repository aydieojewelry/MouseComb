import { commands } from "@mousecomb/bindings";
import { errorMessage, unwrap } from "@mousecomb/data";
import { Button, SelectField, toaster } from "@mousecomb/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

import type { EditorApi } from "./api";
import { editorBackendQuery } from "./backend";
import { DocumentShell } from "./DocumentShell";
import { Explorer } from "./explorer";

/** The editor window (FEAT-030): the folders you added, their files, and the open file. */
export function EditorPage() {
  const backend = useQuery(editorBackendQuery);
  if (backend.isPending) return <Notice>Starting the editor…</Notice>;
  if (backend.isError) return <Notice tone="danger">The editor couldn't start. {errorMessage(backend.error)}</Notice>;
  return <Folders api={backend.data} />;
}

function Folders({ api }: { api: EditorApi }) {
  const queryClient = useQueryClient();
  const list = useQuery({ queryKey: ["editor", "workspaces"], queryFn: () => api.workspaces() });
  const [chosen, setChosen] = useState<string | null>(null);
  const [openPath, setOpenPath] = useState<string | null>(null);

  const workspaces = list.data ?? [];
  const current = workspaces.find((w) => w.id === chosen) ?? workspaces[0];

  const addFolder = async () => {
    try {
      const picked = await unwrap(commands.editorPickFolder());
      if (!picked) return;
      const added = await api.addWorkspace(picked);
      await queryClient.invalidateQueries({ queryKey: ["editor", "workspaces"] });
      setChosen(added.id);
      setOpenPath(null);
    } catch (e) {
      toaster.error({ title: "Add a folder", description: errorMessage(e) });
    }
  };

  if (list.isPending) return <Notice>Loading…</Notice>;
  if (list.isError) return <Notice tone="danger">{errorMessage(list.error)}</Notice>;

  if (!current) {
    return (
      <Notice>
        <span className="flex flex-col items-center gap-3">
          <span>Add a folder to start. The editor only reads and writes inside the folders you add.</span>
          <Button variant="primary" onClick={() => void addFolder()}>
            Add a folder
          </Button>
        </span>
      </Notice>
    );
  }

  return (
    <div className="grid h-dvh grid-cols-[18rem_1fr] overflow-hidden bg-surface text-fg">
      <aside className="flex min-h-0 flex-col border-r border-line">
        <div className="flex flex-col gap-2 border-b border-line p-3">
          <SelectField
            label="Folder"
            value={current.id}
            groups={[{ label: "Folders you added", options: workspaces.map((w) => ({ value: w.id, label: w.name })) }]}
            onChange={(id) => {
              setChosen(id);
              setOpenPath(null);
            }}
          />
          <Button variant="secondary" className="h-8" onClick={() => void addFolder()}>
            Add a folder
          </Button>
        </div>
        <Explorer key={current.id} api={api} workspace={current.id} openPath={openPath} onOpen={setOpenPath} />
      </aside>
      <main className="min-h-0 min-w-0">
        {openPath ? (
          <DocumentShell key={`${current.id}:${openPath}`} api={api} workspace={current.id} path={openPath} />
        ) : (
          <Notice>Pick a file on the left.</Notice>
        )}
      </main>
    </div>
  );
}

function Notice({ children, tone }: { children: ReactNode; tone?: "danger" }) {
  return (
    <div className="flex h-dvh items-center justify-center p-6 text-center text-sm">
      <div className={tone === "danger" ? "text-danger" : "text-muted"}>{children}</div>
    </div>
  );
}

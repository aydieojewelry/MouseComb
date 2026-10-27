import { useForm } from "@tanstack/react-form";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useMemo, useRef, useState } from "react";
import { z } from "zod";

import { AddIcon, Button, DeleteIcon, Dialog, EditIcon, TextField, toaster } from "@mousecomb/ui";
import { errorMessage } from "@mousecomb/data";

import { type EditorApi, type Entry, type Listing } from "../api";
import { issueText } from "../forms";

const ROW_HEIGHT = 30;

type Props = {
  api: EditorApi;
  workspace: string;
  openPath: string | null;
  onOpen: (path: string | null) => void;
};

type Row = { entry: Entry; depth: number };

const parentOf = (path: string) => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");
const joinPath = (dir: string, name: string) => (dir === "" ? name : `${dir}/${name}`);
const isInside = (path: string, folder: string) => path === folder || path.startsWith(`${folder}/`);

const nameSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter a name.")
    .max(200, "Use at most 200 characters.")
    .refine((n) => !/[\\/]/.test(n), "Names can't contain / or \\.")
    .refine((n) => n !== "." && n !== "..", "Pick another name."),
});

/** The workspace's files and folders as a tree (FEAT-030). Folders load when opened, and the list is virtualized. */
export function Explorer({ api, workspace, openPath, onOpen }: Props) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [selected, setSelected] = useState<Entry | null>(null);
  const [dialog, setDialog] = useState<"new-file" | "new-folder" | "rename" | "delete" | null>(null);

  const folders = useMemo(() => ["", ...expanded], [expanded]);
  const listings = useQueries({
    queries: folders.map((path) => ({
      queryKey: ["editor", "tree", workspace, path] as const,
      queryFn: () => api.list(workspace, path),
    })),
  });

  const byPath = new Map<string, Listing>();
  folders.forEach((path, i) => {
    const data = listings[i]?.data;
    if (data) byPath.set(path, data);
  });
  const rootError = listings[0]?.error;

  const rows: Row[] = [];
  const walk = (dir: string, depth: number) => {
    for (const entry of byPath.get(dir)?.entries ?? []) {
      rows.push({ entry, depth });
      if (entry.dir && expanded.has(entry.path)) walk(entry.path, depth + 1);
    }
  };
  walk("", 0);

  const scroller = useRef<HTMLDivElement>(null);
  const virtual = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scroller.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });

  // New items go into the selected folder, or next to the selected file.
  const targetDir = selected ? (selected.dir ? selected.path : parentOf(selected.path)) : "";

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["editor", "tree", workspace] });

  const perform = async (job: () => Promise<unknown>, after?: () => void) => {
    try {
      await job();
      await refresh();
      after?.();
    } catch (e) {
      toaster.error({ title: "Files", description: errorMessage(e) });
    }
  };

  const activate = (entry: Entry) => {
    setSelected(entry);
    if (entry.dir) {
      setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(entry.path)) next.delete(entry.path);
        else next.add(entry.path);
        return next;
      });
    } else {
      onOpen(entry.path);
    }
  };

  const createItem = async (name: string, kind: "file" | "folder") => {
    const path = joinPath(targetDir, name);
    await perform(
      () => (kind === "file" ? api.create(workspace, path, "") : api.mkdir(workspace, path)),
      () => {
        if (kind === "file") {
          onOpen(path);
          setSelected({ name, path, dir: false, link: false, size: 0, mtime: 0 });
        } else {
          setExpanded((prev) => new Set(prev).add(targetDir));
        }
      },
    );
  };

  const renameSelected = async (name: string) => {
    if (!selected) return;
    const from = selected.path;
    const to = joinPath(parentOf(from), name);
    await perform(
      () => api.rename(workspace, from, to),
      () => {
        if (openPath && isInside(openPath, from)) onOpen(to + openPath.slice(from.length));
        setSelected({ ...selected, name, path: to });
      },
    );
  };

  const deleteSelected = async () => {
    if (!selected) return;
    const gone = selected.path;
    await perform(
      () => api.remove(workspace, gone),
      () => {
        if (openPath && isInside(openPath, gone)) onOpen(null);
        setSelected(null);
        setExpanded((prev) => new Set([...prev].filter((p) => !isInside(p, gone))));
      },
    );
  };

  const rootFailed = rootError !== undefined && rootError !== null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap gap-1 border-b border-line p-2">
        <Button variant="ghost" className="h-7 px-2 text-xs" onClick={() => setDialog("new-file")}>
          <AddIcon />
          File
        </Button>
        <Button variant="ghost" className="h-7 px-2 text-xs" onClick={() => setDialog("new-folder")}>
          <AddIcon />
          Folder
        </Button>
        <Button variant="ghost" className="h-7 px-2 text-xs" disabled={!selected} onClick={() => setDialog("rename")}>
          <EditIcon />
          Rename
        </Button>
        <Button variant="ghost" className="h-7 px-2 text-xs" disabled={!selected} onClick={() => setDialog("delete")}>
          <DeleteIcon />
          Trash
        </Button>
      </div>

      {rootFailed ? (
        <p className="m-0 p-3 text-xs text-danger">{errorMessage(rootError)}</p>
      ) : (
        <div ref={scroller} className="min-h-0 flex-1 overflow-auto py-1 text-sm">
          {rows.length === 0 && listings[0]?.isSuccess && (
            <p className="m-0 p-3 text-xs text-muted">This folder is empty. Use File or Folder above.</p>
          )}
          <div className="relative" style={{ height: virtual.getTotalSize() }}>
            {virtual.getVirtualItems().map((item) => {
              const row = rows[item.index];
              if (!row) return null;
              const { entry, depth } = row;
              const current = openPath === entry.path || selected?.path === entry.path;
              return (
                <button
                  key={entry.path}
                  type="button"
                  aria-expanded={entry.dir ? expanded.has(entry.path) : undefined}
                  title={entry.path}
                  onClick={() => activate(entry)}
                  className={`absolute left-0 flex w-full items-center gap-2 truncate pr-2 text-left hover:bg-raised ${
                    current ? "bg-raised text-fg" : "text-muted"
                  }`}
                  style={{ transform: `translateY(${item.start}px)`, height: ROW_HEIGHT, paddingLeft: 10 + depth * 14 }}
                >
                  <span className="w-3 shrink-0 text-center text-xs">
                    {entry.dir ? (expanded.has(entry.path) ? "▾" : "▸") : ""}
                  </span>
                  <span className="truncate">{entry.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {(dialog === "new-file" || dialog === "new-folder" || dialog === "rename") && (
        <NameDialog
          key={dialog}
          title={dialog === "new-file" ? "New file" : dialog === "new-folder" ? "New folder" : "Rename"}
          initial={dialog === "rename" ? (selected?.name ?? "") : ""}
          submitLabel={dialog === "rename" ? "Rename" : "Create"}
          onClose={() => setDialog(null)}
          onSubmit={async (name) => {
            if (dialog === "rename") await renameSelected(name);
            else await createItem(name, dialog === "new-file" ? "file" : "folder");
          }}
        />
      )}

      {dialog === "delete" && selected && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) setDialog(null);
          }}
          title={`Move “${selected.name}” to the trash?`}
          description={
            selected.dir
              ? "The folder and everything in it goes to the trash. You can restore it from there."
              : "The file goes to the trash. You can restore it from there."
          }
          footer={
            <>
              <Button variant="ghost" onClick={() => setDialog(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  setDialog(null);
                  void deleteSelected();
                }}
              >
                Move to trash
              </Button>
            </>
          }
        />
      )}
    </div>
  );
}

function NameDialog(props: {
  title: string;
  initial: string;
  submitLabel: string;
  onClose: () => void;
  onSubmit: (name: string) => Promise<void>;
}) {
  const form = useForm({
    defaultValues: { name: props.initial },
    validators: { onSubmit: nameSchema },
    onSubmit: async ({ value }) => {
      await props.onSubmit(value.name.trim());
      props.onClose();
    },
  });

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
      title={props.title}
      footer={
        <>
          <Button variant="ghost" onClick={props.onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void form.handleSubmit()}>
            {props.submitLabel}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void form.handleSubmit();
        }}
      >
        <form.Field name="name">
          {(field) => (
            <TextField
              label="Name"
              autoFocus
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
              error={issueText(field.state.meta.errors)}
            />
          )}
        </form.Field>
      </form>
    </Dialog>
  );
}

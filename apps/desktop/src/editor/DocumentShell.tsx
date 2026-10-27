import { lazy, Suspense } from "react";

import { Button, StatusDot } from "@mousecomb/ui";

import type { EditorApi } from "./api";
import { useDocument } from "./document";

const CodeView = lazy(() => import("./views/CodeView"));
const CsvView = lazy(() => import("./views/CsvView"));
const ConfigView = lazy(() => import("./views/ConfigView"));

/** Which view a file opens in (FEAT-030): by extension. */
export function viewKind(path: string): "markdown" | "csv" | "config" | "text" {
  const ext = path.split(".").at(-1)?.toLowerCase() ?? "";
  if (ext === "md" || ext === "markdown") return "markdown";
  if (ext === "csv" || ext === "tsv") return "csv";
  if (ext === "toml" || ext === "ini" || ext === "cfg") return "config";
  return "text";
}

const PHASE_TEXT = {
  idle: { tone: "muted", text: "Saved" },
  editing: { tone: "accent", text: "Unsaved changes" },
  persisting: { tone: "accent", text: "Saving…" },
  synced: { tone: "ok", text: "Saved" },
  error: { tone: "danger", text: "Not saved" },
} as const;

type Props = { api: EditorApi; workspace: string; path: string };

/** One open file: a header with the save state, the problems if a save was refused, and the view. */
export function DocumentShell({ api, workspace, path }: Props) {
  const doc = useDocument(api, workspace, path);
  const kind = viewKind(path);
  const status = PHASE_TEXT[doc.phase];

  if (doc.loading) return <p className="m-0 p-6 text-sm text-muted">Opening…</p>;
  if (doc.loadError) {
    return <p className="m-0 p-6 text-sm text-danger">{doc.loadError instanceof Error ? doc.loadError.message : "Couldn't open this file."}</p>;
  }
  if (doc.binary) {
    return <p className="m-0 p-6 text-sm text-muted">This is a binary file, so it can't be edited here.</p>;
  }

  const saveError = doc.saveError;
  const conflict = saveError?.status === 409;
  const problems = saveError?.problems ?? [];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-3 border-b border-line px-4 py-2">
        <span className="min-w-0 flex-1 truncate font-mono text-xs">{path}</span>
        <span className="flex items-center gap-2 text-xs text-muted">
          <StatusDot tone={status.tone} pulse={doc.saving} />
          {doc.dirty && doc.phase !== "persisting" ? "Unsaved changes" : status.text}
        </span>
        <Button variant="primary" className="h-8" disabled={!doc.dirty} busy={doc.saving} onClick={doc.save}>
          Save
        </Button>
      </header>

      {(saveError || conflict) && (
        <div className="flex flex-col gap-2 border-b border-line bg-raised px-4 py-3 text-sm">
          {conflict ? (
            <p className="m-0 text-danger">{saveError?.message}</p>
          ) : problems.length > 0 ? (
            <>
              <p className="m-0 text-danger">{saveError?.message}</p>
              <ul className="m-0 flex list-none flex-col gap-1 p-0 text-xs">
                {problems.map((p, i) => (
                  <li key={i}>
                    <span className="font-mono text-muted">{p.path}</span> {p.message}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="m-0 text-danger">{saveError?.message ?? "Couldn't save."}</p>
          )}
          {conflict && (
            <div>
              <Button variant="secondary" className="h-8" onClick={() => void doc.reload()}>
                {doc.dirty ? "Discard my changes and reload" : "Reload from disk"}
              </Button>
            </div>
          )}
        </div>
      )}

      <div className="min-h-0 flex-1">
        <Suspense fallback={<p className="m-0 p-6 text-sm text-muted">Loading the view…</p>}>
          {kind === "csv" && <CsvView text={doc.text} onChange={doc.setText} />}
          {kind === "config" && (
            <ConfigView path={path} text={doc.text} onChange={doc.setText} onSave={doc.save} />
          )}
          {(kind === "markdown" || kind === "text") && (
            <CodeView
              text={doc.text}
              language={kind === "markdown" ? "markdown" : "plain"}
              onChange={doc.setText}
              onSave={doc.save}
            />
          )}
        </Suspense>
      </div>
    </div>
  );
}

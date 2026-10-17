import {
  errorMessage,
  newSnippetId,
  previewSnippet,
  snippetInputSchema,
  snippetsCollection,
  SNIPPET_TOKENS,
  type Snippet,
} from "@mousecomb/data";
import { AddIcon, Button, DeleteIcon, Dialog, SearchIcon, TextArea, TextField, cx, toaster } from "@mousecomb/ui";
import { useLiveQuery } from "@tanstack/react-db";
import { useForm } from "@tanstack/react-form";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useMemo, useRef, useState } from "react";
import { z } from "zod";

import { timeAgo } from "../time";

const editorSchema = z.object({
  title: snippetInputSchema.shape.title,
  text: snippetInputSchema.shape.text,
  tagsText: z
    .string()
    .refine((s) => parseTags(s).length <= 12, "Use up to 12 tags.")
    .refine((s) => parseTags(s).every((t) => t.length <= 32), "Keep each tag under 32 characters."),
});

function parseTags(text: string): string[] {
  return [...new Set(text.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean))];
}

function issueText(errors: unknown[]): string | undefined {
  const first = errors.find(Boolean);
  if (!first) return undefined;
  return typeof first === "string" ? first : ((first as { message?: string }).message ?? "Check this field.");
}

export function SnippetsPage() {
  const { q = "", id } = useSearch({ from: "/snippets" });
  const navigate = useNavigate({ from: "/snippets" });
  const { data: snippets = [], isLoading } = useLiveQuery({
    query: (query) => query.from({ s: snippetsCollection }).orderBy(({ s }) => s.updated, "desc"),
  });

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return snippets;
    return snippets.filter(
      (s) =>
        s.title.toLowerCase().includes(needle) ||
        s.text.toLowerCase().includes(needle) ||
        s.tags.some((t) => t.includes(needle)),
    );
  }, [snippets, q]);

  const selected = id && id !== "new" ? snippets.find((s) => s.id === id) : undefined;
  const editing = id === "new" || Boolean(selected);

  return (
    <div className="flex h-full min-h-0">
      <div className="flex w-80 shrink-0 flex-col border-r border-line">
        <div className="flex flex-col gap-3 border-b border-line p-4">
          <div className="flex items-center justify-between">
            <h1 className="font-display text-xl font-semibold tracking-tight">Snippets</h1>
            <Button variant="primary" onClick={() => navigate({ search: { q, id: "new" } })}>
              <AddIcon />
              New
            </Button>
          </div>
          <label className="relative block">
            <span className="sr-only">Search snippets</span>
            <SearchIcon className="pointer-events-none absolute left-2.5 top-2 text-muted" />
            <input
              type="search"
              value={q}
              placeholder="Search"
              onChange={(e) => navigate({ search: { q: e.target.value || undefined, id }, replace: true })}
              className="w-full rounded-lg border border-line bg-raised py-2 pl-9 pr-3 text-sm outline-none placeholder:text-muted focus:border-accent"
            />
          </label>
        </div>
        {isLoading ? (
          <p className="p-4 text-sm text-muted">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="p-4 text-sm text-muted">
            {snippets.length === 0
              ? "No snippets yet. Add text you type often, like an address, a sign-off or a log template."
              : `Nothing matches "${q}".`}
          </p>
        ) : (
          <SnippetList snippets={filtered} selectedId={selected?.id} onSelect={(s) => navigate({ search: { q, id: s } })} />
        )}
      </div>
      <div className="min-w-0 flex-1 overflow-y-auto">
        {editing ? (
          <SnippetEditor
            key={selected?.id ?? "new"}
            snippet={selected}
            onSaved={(savedId) => navigate({ search: { q, id: savedId }, replace: true })}
            onDeleted={() => navigate({ search: { q }, replace: true })}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
            <p className="font-display text-lg font-semibold">Pick a snippet or make a new one</p>
            <p className="max-w-sm text-sm text-muted">
              Snippets are pasted from <span className="text-fg">Caps + V</span> once the clipboard extension arrives,
              and they sync to your other devices.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/** Virtualized so thousands of snippets scroll smoothly (TanStack Virtual). */
function SnippetList(props: { snippets: Snippet[]; selectedId?: string; onSelect: (id: string) => void }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: props.snippets.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 64,
    overscan: 8,
  });
  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-2" role="listbox" aria-label="Snippets">
      <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((row) => {
          const s = props.snippets[row.index]!;
          const active = s.id === props.selectedId;
          return (
            <button
              key={s.id}
              type="button"
              role="option"
              aria-selected={active}
              onClick={() => props.onSelect(s.id)}
              className={cx(
                "absolute left-0 top-0 flex w-full flex-col gap-0.5 rounded-lg px-3 py-2.5 text-left transition-colors",
                active ? "bg-raised" : "hover:bg-raised/60",
              )}
              style={{ transform: `translateY(${row.start}px)`, height: row.size - 4 }}
            >
              <span className="flex items-baseline justify-between gap-2">
                <span className={cx("truncate text-sm", active ? "text-fg" : "text-fg/90")}>{s.title}</span>
                <span className="shrink-0 text-[11px] text-muted">{timeAgo(s.updated)}</span>
              </span>
              <span className="truncate font-mono text-xs text-muted">{s.text}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SnippetEditor(props: { snippet?: Snippet; onSaved: (id: string) => void; onDeleted: () => void }) {
  const { snippet } = props;
  const [confirmDelete, setConfirmDelete] = useState(false);

  const form = useForm({
    defaultValues: {
      title: snippet?.title ?? "",
      text: snippet?.text ?? "",
      tagsText: snippet?.tags.join(", ") ?? "",
    },
    validators: { onChange: editorSchema, onSubmit: editorSchema },
    onSubmit: async ({ value }) => {
      const input = { title: value.title.trim(), text: value.text, tags: parseTags(value.tagsText) };
      try {
        if (snippet) {
          const tx = snippetsCollection.update(snippet.id, (draft) => {
            draft.title = input.title;
            draft.text = input.text;
            draft.tags = input.tags;
          });
          await tx.isPersisted.promise;
          toaster.success({ title: "Snippet saved" });
          props.onSaved(snippet.id);
        } else {
          const id = await newSnippetId();
          const tx = snippetsCollection.insert({ id, ...input, updated: Date.now() });
          await tx.isPersisted.promise;
          toaster.success({ title: "Snippet added" });
          props.onSaved(id);
        }
      } catch (e) {
        toaster.error({ title: "Couldn't save the snippet", description: errorMessage(e) });
      }
    },
  });

  const remove = async () => {
    if (!snippet) return;
    try {
      await snippetsCollection.delete(snippet.id).isPersisted.promise;
      setConfirmDelete(false);
      toaster.success({ title: "Snippet deleted" });
      props.onDeleted();
    } catch (e) {
      toaster.error({ title: "Couldn't delete the snippet", description: errorMessage(e) });
    }
  };

  return (
    <form
      className="mx-auto flex max-w-2xl flex-col gap-5 px-8 py-8"
      onSubmit={(e) => {
        e.preventDefault();
        void form.handleSubmit();
      }}
    >
      <h2 className="font-display text-xl font-semibold tracking-tight">{snippet ? "Edit snippet" : "New snippet"}</h2>

      <form.Field name="title">
        {(field) => (
          <TextField
            label="Name"
            value={field.state.value}
            placeholder="Work log entry"
            autoFocus={!snippet}
            onBlur={field.handleBlur}
            onChange={(e) => field.handleChange(e.target.value)}
            error={field.state.meta.isTouched ? issueText(field.state.meta.errors) : undefined}
          />
        )}
      </form.Field>

      <form.Field name="text">
        {(field) => (
          <div className="flex flex-col gap-2">
            <TextArea
              label="Text"
              value={field.state.value}
              placeholder="[{TIME}] - #dev - | @30m"
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
              error={field.state.meta.isTouched ? issueText(field.state.meta.errors) : undefined}
            />
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted">Insert:</span>
              {SNIPPET_TOKENS.map(({ token, meaning }) => (
                <button
                  key={token}
                  type="button"
                  title={meaning}
                  onClick={() => field.handleChange(field.state.value + token)}
                  className="rounded-md border border-line bg-raised px-2 py-0.5 font-mono text-xs text-muted hover:border-accent hover:text-fg"
                >
                  {token}
                </button>
              ))}
            </div>
            {field.state.value && (
              <div className="rounded-lg border border-line bg-idle px-3 py-2">
                <div className="mb-1 text-[11px] uppercase tracking-wider text-muted">Pastes as</div>
                <pre className="m-0 whitespace-pre-wrap break-words font-mono text-xs text-fg">
                  {previewSnippet(field.state.value)}
                </pre>
              </div>
            )}
          </div>
        )}
      </form.Field>

      <form.Field name="tagsText">
        {(field) => (
          <TextField
            label="Tags"
            helper="Separate with commas. Used for search."
            value={field.state.value}
            placeholder="log, work"
            onBlur={field.handleBlur}
            onChange={(e) => field.handleChange(e.target.value)}
            error={issueText(field.state.meta.errors)}
          />
        )}
      </form.Field>

      <div className="flex items-center justify-between gap-3 border-t border-line pt-5">
        {snippet ? (
          <Button variant="danger" onClick={() => setConfirmDelete(true)}>
            <DeleteIcon />
            Delete
          </Button>
        ) : (
          <span />
        )}
        <form.Subscribe selector={(s) => [s.canSubmit, s.isSubmitting, s.isDirty] as const}>
          {([canSubmit, isSubmitting, isDirty]) => (
            <Button type="submit" variant="primary" disabled={!canSubmit || (!isDirty && Boolean(snippet))} busy={isSubmitting}>
              {snippet ? "Save changes" : "Add snippet"}
            </Button>
          )}
        </form.Subscribe>
      </div>

      <Dialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete "${snippet?.title ?? ""}"?`}
        description="It's removed from this PC and from your other devices the next time they sync."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => void remove()}>
              Delete snippet
            </Button>
          </>
        }
      />
    </form>
  );
}

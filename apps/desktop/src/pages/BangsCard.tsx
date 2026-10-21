import { bangInputSchema, bangsCollection, bangTriggerSchema, errorMessage, type Bang } from "@mousecomb/data";
import { AddIcon, Button, DeleteIcon, Dialog, EditIcon, Kbd, Section, TextField, toaster } from "@mousecomb/ui";
import { useLiveQuery } from "@tanstack/react-db";
import { useForm } from "@tanstack/react-form";
import { useState } from "react";

import { BUILTIN_BANGS } from "../omnibar/bangs";
import { issueText } from "../components/issueText";

const FORM_ID = "bang-form";

const editorSchema = bangInputSchema.extend({ trigger: bangTriggerSchema });

function BangEditor(props: { bang?: Bang; taken: ReadonlySet<string>; onClose: () => void }) {
  const { bang } = props;
  const form = useForm({
    defaultValues: { trigger: bang?.trigger ?? "", name: bang?.name ?? "", url: bang?.url ?? "https://" },
    validators: {
      onChange: editorSchema,
      onSubmit: editorSchema.refine((v) => bang !== undefined || !props.taken.has(v.trigger), {
        path: ["trigger"],
        message: "You already have a bang with this name.",
      }),
    },
    onSubmit: async ({ value }) => {
      const row = editorSchema.parse(value);
      try {
        if (bang) await bangsCollection.update(bang.trigger, (d) => Object.assign(d, { name: row.name, url: row.url })).isPersisted.promise;
        else await bangsCollection.insert(row).isPersisted.promise;
        toaster.success({ title: bang ? "Bang saved" : "Bang added" });
        props.onClose();
      } catch (e) {
        toaster.error({ title: "Couldn't save the bang", description: errorMessage(e) });
      }
    },
  });

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && props.onClose()}
      title={bang ? `Edit !${bang.trigger}` : "New bang"}
      description="Type the bang and your words in the OmniBar to search that site."
      footer={
        <>
          <Button variant="ghost" onClick={props.onClose}>
            Cancel
          </Button>
          <form.Subscribe selector={(s) => s.isSubmitting}>
            {(isSubmitting) => (
              <Button type="submit" form={FORM_ID} variant="primary" busy={isSubmitting}>
                {bang ? "Save changes" : "Add bang"}
              </Button>
            )}
          </form.Subscribe>
        </>
      }
    >
      <form
        id={FORM_ID}
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void form.handleSubmit();
        }}
      >
        <form.Field name="trigger">
          {(field) => (
            <TextField
              label="Bang"
              helper="Letters and numbers, without the !"
              placeholder="jira"
              value={field.state.value}
              disabled={bang !== undefined}
              spellCheck={false}
              autoCapitalize="none"
              error={field.state.meta.isTouched ? issueText(field.state.meta.errors) : undefined}
              onChange={(e) => field.handleChange(e.target.value.replace(/^!/, ""))}
              onBlur={field.handleBlur}
            />
          )}
        </form.Field>
        <form.Field name="name">
          {(field) => (
            <TextField
              label="Name"
              placeholder="Jira"
              value={field.state.value}
              error={field.state.meta.isTouched ? issueText(field.state.meta.errors) : undefined}
              onChange={(e) => field.handleChange(e.target.value)}
              onBlur={field.handleBlur}
            />
          )}
        </form.Field>
        <form.Field name="url">
          {(field) => (
            <TextField
              label="Search address"
              helper="{q} is replaced by your words."
              placeholder="https://example.com/search?q={q}"
              value={field.state.value}
              spellCheck={false}
              error={field.state.meta.isTouched ? issueText(field.state.meta.errors) : undefined}
              onChange={(e) => field.handleChange(e.target.value)}
              onBlur={field.handleBlur}
            />
          )}
        </form.Field>
      </form>
    </Dialog>
  );
}

/** Bangs: `!yt cats` searches YouTube. About 60 are built in; these are yours (FEAT-004). */
export function BangsCard() {
  const { data: mine = [] } = useLiveQuery({ query: (q) => q.from({ b: bangsCollection }).orderBy(({ b }) => b.trigger) });
  const [editing, setEditing] = useState<Bang | "new" | null>(null);
  const taken = new Set(mine.map((b) => b.trigger));

  const remove = async (b: Bang) => {
    try {
      await bangsCollection.delete(b.trigger).isPersisted.promise;
      toaster.success({ title: `Deleted !${b.trigger}` });
    } catch (e) {
      toaster.error({ title: "Couldn't delete the bang", description: errorMessage(e) });
    }
  };

  return (
    <Section
      title="Bangs"
      description={`Type !yt cats in the OmniBar to search YouTube. ${Object.keys(BUILTIN_BANGS).length} are built in, and any other bang goes to DuckDuckGo.`}
      aside={
        <Button onClick={() => setEditing("new")}>
          <AddIcon />
          New bang
        </Button>
      }
    >
      {mine.length === 0 ? (
        <span className="text-xs text-muted">Your own bangs show up here. They win over the built-in ones.</span>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0" aria-label="Your bangs">
          {mine.map((b) => (
            <li key={b.trigger} className="flex items-center gap-3 rounded-xl border border-line bg-raised px-3 py-2">
              <Kbd>!{b.trigger}</Kbd>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm">{b.name}</span>
                <span className="truncate text-xs text-muted">{b.url}</span>
              </div>
              <Button variant="ghost" aria-label={`Edit !${b.trigger}`} className="px-2" onClick={() => setEditing(b)}>
                <EditIcon />
              </Button>
              <Button variant="ghost" aria-label={`Delete !${b.trigger}`} className="px-2" onClick={() => void remove(b)}>
                <DeleteIcon />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <BangEditor
          key={editing === "new" ? "new" : editing.trigger}
          bang={editing === "new" ? undefined : editing}
          taken={taken}
          onClose={() => setEditing(null)}
        />
      )}
    </Section>
  );
}

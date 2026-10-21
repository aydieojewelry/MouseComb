import {
  actionChoices,
  bindingsCollection,
  choiceFor,
  conflictingBindings,
  errorMessage,
  GESTURE_ARROW,
  LOCAL_SETTINGS,
  newBindingId,
  parseTrigger,
  snippetsCollection,
  triggerWords,
  useCommands,
  useInputStatus,
  useLocalSetting,
  type ActionChoice,
  type Binding,
  type GestureDirection,
} from "@mousecomb/data";
import {
  AddIcon,
  Button,
  ChoiceGroup,
  DeleteIcon,
  Dialog,
  EditIcon,
  Kbd,
  Section,
  SelectField,
  ShortcutButton,
  ShortcutKeys,
  Switch,
  TextField,
  cx,
  toaster,
} from "@mousecomb/ui";
import { useLiveQuery } from "@tanstack/react-db";
import { useForm } from "@tanstack/react-form";
import { useMemo, useState } from "react";
import { z } from "zod";

import { issueText } from "../components/issueText";
import { PageHeader } from "../components/PageHeader";

// ---- the switch and its options ------------------------------------------

function InputCard() {
  const [enabled, setEnabled] = useLocalSetting(LOCAL_SETTINGS.inputEnabled);
  const [hyper, setHyper] = useLocalSetting(LOCAL_SETTINGS.inputHyper);
  const [gestures, setGestures] = useLocalSetting(LOCAL_SETTINGS.inputGestures);
  const { data: status } = useInputStatus();
  const hooks = status?.hooks_supported ?? false;
  const panic = (status?.panic_key ?? "Ctrl+Alt+Pause").split("+");
  return (
    <Section
      title="Hotkeys, Hyper-Key and gestures"
      description="They're off until you turn them on, and only on this PC."
      aside={<Switch label="Turn on hotkeys, Hyper-Key and gestures" hideLabel checked={enabled} onCheckedChange={(on) => void setEnabled(on)} />}
    >
      <p className="flex flex-wrap items-center gap-1.5 text-sm text-muted">
        Stuck or in the way? Press{" "}
        {panic.map((k) => (
          <Kbd key={k}>{k}</Kbd>
        ))}{" "}
        to turn everything off at once.
      </p>
      <div className={cx("flex flex-col gap-4 border-t border-line pt-4", !enabled && "opacity-50")}>
        <Switch
          label="CapsLock Hyper-Key"
          description={
            hooks
              ? "Hold CapsLock and press a key to run a binding. Hold it alone for 1.5 seconds to switch real CapsLock."
              : "Windows only."
          }
          checked={hyper}
          disabled={!enabled || !hooks}
          onCheckedChange={(on) => void setHyper(on)}
        />
        <ChoiceGroup
          label="Mouse gestures"
          variant="segment"
          value={gestures}
          choices={[
            { value: "off", label: "Off" },
            { value: "caps", label: "CapsLock + drag" },
            { value: "rmb", label: "Right-button drag" },
          ]}
          onValueChange={(v) => void setGestures(v)}
          className={!enabled || !hooks ? "pointer-events-none" : undefined}
        />
        <p className="text-xs text-muted">
          {hooks
            ? "Drag left, right, up or down while holding the button. Press Esc to cancel. A plain right-click still opens menus."
            : "Gestures and the Hyper-Key need Windows. Hotkeys work here too."}
        </p>
      </div>
      {status?.hooks_supported && enabled && !status.hooks_running && (hyper || gestures !== "off") && (
        <p role="alert" className="text-sm text-danger">
          {status.issues.find((i) => i.trigger === "hooks")?.message ?? "The keyboard and mouse hooks aren't running."}
        </p>
      )}
    </Section>
  );
}

// ---- the list --------------------------------------------------------------

function TriggerView({ trigger }: { trigger: string }) {
  const t = parseTrigger(trigger);
  if (!t) return <span className="font-mono text-xs text-danger">{trigger}</span>;
  if (t.kind === "hotkey") return <ShortcutKeys shortcut={t.shortcut} />;
  if (t.kind === "hyper") {
    return (
      <span className="flex items-center gap-1">
        <Kbd>CapsLock</Kbd>
        <span aria-hidden className="text-muted">
          +
        </span>
        <Kbd>{t.key}</Kbd>
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5">
      <span className="text-xs text-muted">{t.button === "caps" ? "CapsLock + drag" : "Right drag"}</span>
      <span aria-hidden className="grid size-7 place-items-center rounded-md border border-line bg-raised text-base font-semibold">
        {GESTURE_ARROW[t.direction]}
      </span>
    </span>
  );
}

function BindingRow(props: {
  binding: Binding;
  choice?: ActionChoice;
  conflict: boolean;
  issue?: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { binding: b } = props;
  const scope = b.only_in.length ? `Only in ${b.only_in.join(", ")}` : b.not_in.length ? `Not in ${b.not_in.join(", ")}` : null;
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-line bg-raised px-4 py-3">
      <div className="flex min-w-44 items-center">
        <span className="sr-only">{triggerWords(b.trigger)}</span>
        <TriggerView trigger={b.trigger} />
      </div>
      <span aria-hidden className="text-muted">
        →
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className={cx("truncate text-sm", !b.enabled && "text-muted line-through")}>
          {props.choice?.title ?? b.action}
        </span>
        {scope && <span className="truncate text-xs text-muted">{scope}</span>}
        {props.issue && (
          <span role="alert" className="text-xs text-danger">
            {props.issue}
          </span>
        )}
        {!props.issue && props.conflict && (
          <span className="text-xs text-warn">Another binding uses the same trigger. Only one of them will run.</span>
        )}
      </div>
      <Switch label={`${b.enabled ? "Turn off" : "Turn on"} ${triggerWords(b.trigger)}`} hideLabel checked={b.enabled} onCheckedChange={(on) => bindingsCollection.update(b.id, (d) => void (d.enabled = on))} />
      <div className="flex gap-1">
        <Button variant="ghost" aria-label={`Edit ${triggerWords(b.trigger)}`} className="px-2" onClick={props.onEdit}>
          <EditIcon />
        </Button>
        <Button variant="ghost" aria-label={`Delete ${triggerWords(b.trigger)}`} className="px-2" onClick={props.onDelete}>
          <DeleteIcon />
        </Button>
      </div>
    </li>
  );
}

// ---- the editor ---------------------------------------------------------------

const editorSchema = z
  .object({
    kind: z.enum(["hotkey", "hyper", "gesture"]),
    hotkey: z.string(),
    hyperKey: z.string(),
    button: z.enum(["caps", "rmb"]),
    direction: z.enum(["left", "right", "up", "down"]),
    choice: z.string().min(1, "Pick what it should do."),
    onlyIn: z.string(),
    notIn: z.string(),
  })
  .superRefine((v, ctx) => {
    if (v.kind === "hotkey" && !v.hotkey) {
      ctx.addIssue({ code: "custom", path: ["hotkey"], message: "Click the box, then press the shortcut." });
    }
    if (v.kind === "hyper" && !v.hyperKey) {
      ctx.addIssue({ code: "custom", path: ["hyperKey"], message: "Click the box, then press the key." });
    }
  });

type EditorValues = z.infer<typeof editorSchema>;

const processList = (text: string) => [...new Set(text.split(",").map((p) => p.trim()).filter(Boolean))];

function triggerOf(v: EditorValues): string {
  if (v.kind === "hotkey") return `hotkey:${v.hotkey}`;
  if (v.kind === "hyper") return `hyper:${v.hyperKey}`;
  return `gesture:${v.button}:${v.direction}`;
}

function initialValues(b: Binding | undefined, choices: readonly ActionChoice[]): EditorValues {
  const t = b ? parseTrigger(b.trigger) : null;
  return {
    kind: t?.kind ?? "hotkey",
    hotkey: t?.kind === "hotkey" ? t.shortcut : "",
    hyperKey: t?.kind === "hyper" ? t.key : "",
    button: t?.kind === "gesture" ? t.button : "caps",
    direction: t?.kind === "gesture" ? t.direction : "left",
    choice: b ? (choiceFor(choices, b)?.key ?? `raw:${b.action}`) : "",
    onlyIn: b?.only_in.join(", ") ?? "",
    notIn: b?.not_in.join(", ") ?? "",
  };
}

const DIRECTIONS: GestureDirection[] = ["left", "up", "down", "right"];
const FORM_ID = "binding-form";

function BindingEditor(props: { binding?: Binding; choices: readonly ActionChoice[]; onClose: () => void }) {
  const { binding, choices } = props;
  const form = useForm({
    defaultValues: initialValues(binding, choices),
    validators: { onChange: editorSchema, onSubmit: editorSchema },
    onSubmit: async ({ value }) => {
      const picked = choices.find((c) => c.key === value.choice);
      const action = picked?.action ?? binding?.action ?? "";
      const args = picked ? picked.args : (binding?.with ?? null);
      const input = {
        title: "",
        trigger: triggerOf(value),
        action,
        with: args,
        only_in: processList(value.onlyIn),
        not_in: processList(value.notIn),
        enabled: binding?.enabled ?? true,
      };
      try {
        if (binding) {
          await bindingsCollection.update(binding.id, (d) => Object.assign(d, input)).isPersisted.promise;
        } else {
          const id = await newBindingId();
          await bindingsCollection.insert({ id, updated: Date.now(), ...input }).isPersisted.promise;
        }
        toaster.success({ title: binding ? "Binding saved" : "Binding added" });
        props.onClose();
      } catch (e) {
        toaster.error({ title: "Couldn't save the binding", description: errorMessage(e) });
      }
    },
  });

  const groups = useMemo(() => {
    const order: string[] = [];
    const byGroup = new Map<string, { value: string; label: string }[]>();
    for (const c of choices) {
      if (!byGroup.has(c.group)) {
        byGroup.set(c.group, []);
        order.push(c.group);
      }
      byGroup.get(c.group)!.push({ value: c.key, label: c.title });
    }
    const raw = binding && !choiceFor(choices, binding) ? [{ label: "Current", options: [{ value: `raw:${binding.action}`, label: binding.action }] }] : [];
    return [{ label: "Choose…", options: [{ value: "", label: "Pick an action" }] }, ...raw, ...order.map((g) => ({ label: g, options: byGroup.get(g)! }))];
  }, [choices, binding]);

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && props.onClose()}
      title={binding ? "Edit binding" : "New binding"}
      description="Pick what starts it and what it does."
      footer={
        <>
          <Button variant="ghost" onClick={props.onClose}>
            Cancel
          </Button>
          {/* Never disabled for an incomplete form: pressing it shows what's missing. */}
          <form.Subscribe selector={(s) => s.isSubmitting}>
            {(isSubmitting) => (
              <Button type="submit" form={FORM_ID} variant="primary" busy={isSubmitting}>
                {binding ? "Save changes" : "Add binding"}
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
        <form.Field name="kind">
          {(field) => (
            <ChoiceGroup
              label="Starts with"
              variant="segment"
              value={field.state.value}
              choices={[
                { value: "hotkey", label: "Hotkey" },
                { value: "hyper", label: "CapsLock + key" },
                { value: "gesture", label: "Mouse gesture" },
              ]}
              onValueChange={field.handleChange}
            />
          )}
        </form.Field>

        <form.Subscribe selector={(s) => s.values.kind}>
          {(kind) =>
            kind === "hotkey" ? (
              <form.Field name="hotkey">
                {(field) => (
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs font-medium text-muted">Shortcut</span>
                    <ShortcutButton label="Shortcut" value={field.state.value} onChange={field.handleChange} invalid={field.state.meta.isTouched && field.state.meta.errors.length > 0} />
                    <span className="text-xs text-muted">Needs Ctrl, Alt, Shift or Win, unless it's an F key.</span>
                    {field.state.meta.isTouched && <span className="text-xs text-danger">{issueText(field.state.meta.errors)}</span>}
                  </div>
                )}
              </form.Field>
            ) : kind === "hyper" ? (
              <form.Field name="hyperKey">
                {(field) => (
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs font-medium text-muted">Key to press while holding CapsLock</span>
                    <ShortcutButton label="Key" value={field.state.value} onChange={field.handleChange} allowBare invalid={field.state.meta.isTouched && field.state.meta.errors.length > 0} empty="Click, then press a key" />
                    {field.state.meta.isTouched && <span className="text-xs text-danger">{issueText(field.state.meta.errors)}</span>}
                  </div>
                )}
              </form.Field>
            ) : (
              <div className="flex flex-col gap-3">
                <form.Field name="button">
                  {(field) => (
                    <ChoiceGroup
                      label="Hold"
                      variant="segment"
                      value={field.state.value}
                      choices={[
                        { value: "caps", label: "CapsLock + drag" },
                        { value: "rmb", label: "Right-button drag" },
                      ]}
                      onValueChange={field.handleChange}
                    />
                  )}
                </form.Field>
                <form.Field name="direction">
                  {(field) => (
                    <ChoiceGroup
                      label="Drag"
                      variant="chip"
                      value={field.state.value}
                      choices={DIRECTIONS.map((d) => ({ value: d, label: `${GESTURE_ARROW[d]} ${d[0]!.toUpperCase()}${d.slice(1)}` }))}
                      onValueChange={field.handleChange}
                    />
                  )}
                </form.Field>
              </div>
            )
          }
        </form.Subscribe>

        <form.Field name="choice">
          {(field) => (
            <SelectField
              label="Does this"
              value={field.state.value}
              groups={groups}
              onChange={field.handleChange}
              error={field.state.meta.isTouched ? issueText(field.state.meta.errors) : undefined}
            />
          )}
        </form.Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <form.Field name="onlyIn">
            {(field) => (
              <TextField
                label="Only in (optional)"
                helper="Program names, e.g. Code.exe, chrome"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
              />
            )}
          </form.Field>
          <form.Field name="notIn">
            {(field) => (
              <TextField
                label="Not in (optional)"
                helper="Separate with commas"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
              />
            )}
          </form.Field>
        </div>
      </form>
    </Dialog>
  );
}

// ---- the page --------------------------------------------------------------------

export function BindingsPage() {
  const { data: bindings = [] } = useLiveQuery({
    query: (q) => q.from({ b: bindingsCollection }).orderBy(({ b }) => b.updated, "desc"),
  });
  const { data: snippets = [] } = useLiveQuery({ query: (q) => q.from({ s: snippetsCollection }) });
  const { data: commandList = [] } = useCommands();
  const { data: status } = useInputStatus();
  const choices = useMemo(() => actionChoices(commandList, snippets), [commandList, snippets]);
  const conflicts = useMemo(() => conflictingBindings(bindings), [bindings]);
  const [editing, setEditing] = useState<Binding | "new" | null>(null);
  const [deleting, setDeleting] = useState<Binding | null>(null);

  const remove = async () => {
    if (!deleting) return;
    try {
      await bindingsCollection.delete(deleting.id).isPersisted.promise;
      toaster.success({ title: "Binding deleted" });
      setDeleting(null);
    } catch (e) {
      toaster.error({ title: "Couldn't delete the binding", description: errorMessage(e) });
    }
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 px-6 py-7">
      <PageHeader
        title="Bindings"
        description="Connect a hotkey, a CapsLock key or a mouse gesture to anything MouseComb can do."
        actions={
          <Button variant="primary" onClick={() => setEditing("new")}>
            <AddIcon />
            New binding
          </Button>
        }
      />
      <InputCard />
      <Section title="Your bindings">
        {bindings.length === 0 ? (
          <div className="flex flex-col gap-1 text-sm text-muted">
            <p>Nothing yet. Some ideas:</p>
            <ul className="m-0 list-disc pl-5">
              <li>
                <span className="text-fg">Ctrl + Alt + P</span> starts or pauses the Pomodoro.
              </li>
              <li>
                <span className="text-fg">CapsLock + S</span> types your signature snippet.
              </li>
              <li>
                <span className="text-fg">Right-drag left</span> goes to the previous desktop.
              </li>
            </ul>
          </div>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0" aria-label="Bindings">
            {bindings.map((b) => (
              <BindingRow
                key={b.id}
                binding={b}
                choice={choiceFor(choices, b)}
                conflict={conflicts.has(b.id)}
                issue={status?.issues.find((i) => i.trigger === b.trigger)?.message}
                onEdit={() => setEditing(b)}
                onDelete={() => setDeleting(b)}
              />
            ))}
          </ul>
        )}
      </Section>

      {editing && (
        <BindingEditor
          key={editing === "new" ? "new" : editing.id}
          binding={editing === "new" ? undefined : editing}
          choices={choices}
          onClose={() => setEditing(null)}
        />
      )}
      <Dialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete ${deleting ? triggerWords(deleting.trigger) : "this binding"}?`}
        description="It's removed from this PC and from your other devices the next time they sync."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => void remove()}>
              Delete binding
            </Button>
          </>
        }
      />
    </div>
  );
}

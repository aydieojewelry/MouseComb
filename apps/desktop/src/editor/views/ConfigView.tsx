import { useForm } from "@tanstack/react-form";
import { useMemo, useState } from "react";
import { z } from "zod";

import { Switch, TextField } from "@mousecomb/ui";

import { type ConfigFormat, type Field, iniFields, iniLiteral, patchLine, tomlFields, tomlLiteral } from "../config";
import { issueText } from "../forms";
import CodeView from "./CodeView";

type Props = {
  path: string;
  text: string;
  onChange: (text: string) => void;
  onSave: () => void;
};

type Commit = (input: string) => string | null;

/** The inspector and the text, one above the other. Only top-level TOML keys and INI keys are fields; anything else stays in the text. */
export default function ConfigView({ path, text, onChange, onSave }: Props) {
  const format: ConfigFormat = /\.toml$/i.test(path) ? "toml" : "ini";
  const result = useMemo(() => (format === "toml" ? tomlFields(text) : iniFields(text)), [format, text]);

  const commitTo = (field: Field, input: string): string | null => {
    const literal = format === "toml" ? tomlLiteral(field.kind, input) : iniLiteral(input);
    if (literal === null) return "That value doesn't fit this setting.";
    const patched = patchLine(text, field, literal, format);
    if ("error" in patched) return patched.error;
    if (patched.text !== text) onChange(patched.text);
    return null;
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="max-h-[45%] overflow-auto border-b border-line px-4 py-3">
        {result.error ? (
          <p className="m-0 text-sm text-danger">
            Can't read this TOML yet: {result.error}. Fix it in the text below.
          </p>
        ) : result.fields.length === 0 ? (
          <p className="m-0 text-sm text-muted">No top-level settings here. Use the text below.</p>
        ) : (
          <div className="grid grid-cols-[minmax(8rem,14rem)_1fr] items-start gap-x-4 gap-y-3">
            {result.fields.map((field) => (
              <FieldRow key={`${field.line}:${field.value}`} field={field} commit={(input) => commitTo(field, input)} />
            ))}
          </div>
        )}
      </div>
      <div className="min-h-0 flex-1">
        <CodeView text={text} language="plain" onChange={onChange} onSave={onSave} />
      </div>
    </div>
  );
}

const numberSchema = z.object({
  value: z.string().refine((v) => v.trim() !== "" && Number.isFinite(Number(v)), "Enter a number."),
});
const textSchema = z.object({
  value: z.string().max(10000, "Use at most 10,000 characters."),
});

/** One setting. Numbers and text are a TanStack Form validated with Zod, saved on blur or Enter; booleans save at once. */
function FieldRow({ field, commit }: { field: Field; commit: Commit }) {
  const [refused, setRefused] = useState<string | null>(null);

  if (field.kind === "boolean") {
    return (
      <>
        <span className="pt-2 font-mono text-xs text-muted">{field.label}</span>
        <div className="pt-1">
          <Switch
            label={field.label}
            hideLabel
            checked={field.value === "true"}
            onCheckedChange={(checked) => setRefused(commit(String(checked)))}
          />
          {refused && <p className="m-0 mt-1 text-xs text-danger">{refused}</p>}
        </div>
      </>
    );
  }

  return <TextFieldRow field={field} commit={commit} />;
}

function TextFieldRow({ field, commit }: { field: Field; commit: Commit }) {
  const [refused, setRefused] = useState<string | null>(null);
  const schema = field.kind === "number" ? numberSchema : textSchema;
  const form = useForm({
    defaultValues: { value: field.value },
    validators: { onSubmit: schema },
    onSubmit: ({ value }) => {
      setRefused(commit(value.value));
    },
  });

  return (
    <form
      className="col-span-2"
      onSubmit={(e) => {
        e.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.Field name="value">
        {(f) => (
          <TextField
            label={field.label}
            className="font-mono"
            inputMode={field.kind === "number" ? "decimal" : undefined}
            value={f.state.value}
            onChange={(e) => f.handleChange(e.target.value)}
            onBlur={() => void form.handleSubmit()}
            error={issueText(f.state.meta.errors) ?? refused ?? undefined}
          />
        )}
      </form.Field>
    </form>
  );
}

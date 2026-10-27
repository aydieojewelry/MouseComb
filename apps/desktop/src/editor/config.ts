/**
 * The TOML and INI inspector (FEAT-030). Fields are read from the text and
 * written back by replacing one line's value, so comments and the rest of the
 * file stay exactly as they were.
 */
import { parse } from "smol-toml";

export type FieldKind = "string" | "number" | "boolean";
export type ConfigFormat = "toml" | "ini";

export type Field = {
  /** Zero-based line of the assignment; patches address a field by its line. */
  line: number;
  label: string;
  kind: FieldKind;
  /** The value as shown in the inspector (strings unquoted). */
  value: string;
};

export type FieldsResult = { fields: Field[]; error?: string };

const TOML_ASSIGNMENT = /^(\s*)("[^"]*"|'[^']*'|[A-Za-z0-9_-]+)\s*=\s*(.*)$/;
const TOML_SECTION = /^\s*\[/;
const INI_ASSIGNMENT = /^(\s*)([^=:;#\s][^=:]*?)\s*[=:]\s*(.*)$/;
const INI_SECTION = /^\s*\[([^\]]+)\]/;

/** Splits a value from a trailing comment, looking past quoted text. */
function splitComment(rest: string): { value: string; comment: string } {
  let quote: string | null = null;
  for (let i = 0; i < rest.length; i++) {
    const ch = rest[i];
    if (quote) {
      if (ch === "\\" && quote === '"') i++;
      else if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === "#") {
      return { value: rest.slice(0, i), comment: rest.slice(i) };
    }
  }
  return { value: rest, comment: "" };
}

function unquoteKey(raw: string): string {
  return raw.startsWith('"') || raw.startsWith("'") ? raw.slice(1, -1) : raw;
}

function parsesAsToml(text: string): Record<string, unknown> | null {
  try {
    return parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Top-level scalar fields of a TOML document (the lines above the first [section]). */
export function tomlFields(text: string): FieldsResult {
  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = parse(text) as Record<string, unknown>;
  } catch (e) {
    return { fields: [], error: e instanceof Error ? e.message : "This TOML doesn't parse." };
  }
  const fields: Field[] = [];
  const lines = text.split("\n");
  for (let line = 0; line < lines.length; line++) {
    const body = (lines[line] ?? "").replace(/\r$/, "");
    if (TOML_SECTION.test(body)) break;
    const match = TOML_ASSIGNMENT.exec(body);
    if (!match) continue;
    // Multi-line strings can't be patched line by line, so they stay in the text.
    const rest = match[3] ?? "";
    if (rest.startsWith('"""') || rest.startsWith("'''")) continue;
    const key = unquoteKey(match[2] ?? "");
    const value = parsed[key];
    if (typeof value === "boolean") fields.push({ line, label: key, kind: "boolean", value: String(value) });
    else if (typeof value === "number") fields.push({ line, label: key, kind: "number", value: String(value) });
    else if (typeof value === "string") fields.push({ line, label: key, kind: "string", value });
  }
  return { fields };
}

/** INI: `[section]` headers, `key = value` or `key: value`, `;` or `#` comments. */
export function iniFields(text: string): FieldsResult {
  const fields: Field[] = [];
  let section = "";
  const lines = text.split("\n");
  for (let line = 0; line < lines.length; line++) {
    const body = (lines[line] ?? "").replace(/\r$/, "");
    const header = INI_SECTION.exec(body);
    if (header) {
      section = (header[1] ?? "").trim();
      continue;
    }
    if (/^\s*[;#]/.test(body)) continue;
    const match = INI_ASSIGNMENT.exec(body);
    if (!match) continue;
    const key = (match[2] ?? "").trim();
    fields.push({ line, label: section ? `${section}.${key}` : key, kind: "string", value: (match[3] ?? "").trim() });
  }
  return { fields };
}

/** The TOML literal for what the user typed. Null when it doesn't fit the kind. */
export function tomlLiteral(kind: FieldKind, input: string): string | null {
  if (kind === "boolean") return input === "true" || input === "false" ? input : null;
  if (kind === "number") {
    const n = Number(input);
    return input.trim() !== "" && Number.isFinite(n) ? String(n) : null;
  }
  return JSON.stringify(input);
}

/** INI values are plain text. Null when the input would break the line. */
export function iniLiteral(input: string): string | null {
  return /[\r\n]/.test(input) ? null : input.trim();
}

/**
 * Writes one field's new value, keeping the key, the spacing, the line ending
 * and any trailing comment. A TOML result that wouldn't parse is refused, so a
 * bad value never reaches disk.
 */
export function patchLine(
  text: string,
  field: Field,
  literal: string,
  format: ConfigFormat,
): { text: string } | { error: string } {
  const lines = text.split("\n");
  const original = lines[field.line] ?? "";
  if (original === "") return { error: "That line moved. Reload the file." };
  const cr = original.endsWith("\r") ? "\r" : "";
  const body = cr ? original.slice(0, -1) : original;
  const eq = format === "toml" ? body.indexOf("=") : body.search(/[=:]/);
  if (eq < 0) return { error: "That line moved. Reload the file." };

  const head = body.slice(0, eq + 1);
  const { value, comment } = splitComment(body.slice(eq + 1));
  const lead = value.match(/^\s*/)?.[0] || " ";
  const gap = value.match(/\s*$/)?.[0] || " ";
  const trailing = comment ? gap + comment : "";
  lines[field.line] = head + lead + literal + trailing + cr;

  const next = lines.join("\n");
  if (format === "toml" && !parsesAsToml(next)) return { error: "That value would break the file, so it wasn't saved." };
  return { text: next };
}

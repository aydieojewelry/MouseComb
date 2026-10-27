import { describe, expect, it } from "vitest";

import { iniFields, iniLiteral, patchLine, tomlFields, tomlLiteral, type Field } from "./config";

const TOML = `# app settings
title = "Mouse Comb"   # shown in the header
retries = 3
debug = false

[server]
host = "localhost"
`;

function fieldNamed(text: string, label: string): Field {
  const field = [...tomlFields(text).fields, ...iniFields(text).fields].find((f) => f.label === label);
  if (!field) throw new Error(`no field ${label}`);
  return field;
}

describe("TOML inspector", () => {
  it("lists top-level scalars only, with their kinds", () => {
    const { fields, error } = tomlFields(TOML);
    expect(error).toBeUndefined();
    expect(fields.map((f) => [f.label, f.kind, f.value])).toEqual([
      ["title", "string", "Mouse Comb"],
      ["retries", "number", "3"],
      ["debug", "boolean", "false"],
    ]);
  });

  it("reports a parse error instead of guessing", () => {
    expect(tomlFields("title = ").error).toBeTruthy();
  });

  it("keeps the comment and the rest of the file when a value changes", () => {
    const field = fieldNamed(TOML, "title");
    const literal = tomlLiteral("string", "Mouse Comb 2");
    const result = patchLine(TOML, field, literal!, "toml");
    expect("text" in result && result.text).toBe(TOML.replace('title = "Mouse Comb"   # shown in the header', 'title = "Mouse Comb 2"   # shown in the header'));
  });

  it("patches booleans and numbers in place", () => {
    const text = patchLine(TOML, fieldNamed(TOML, "debug"), "true", "toml");
    expect("text" in text && text.text).toContain("debug = true\n");
    const retries = patchLine(TOML, fieldNamed(TOML, "retries"), "7", "toml");
    expect("text" in retries && retries.text).toContain("retries = 7\n");
  });

  it("refuses a patch that would break the file", () => {
    const field = fieldNamed(TOML, "title");
    const bad = patchLine(TOML, field, '"unterminated', "toml");
    expect("error" in bad).toBe(true);
  });

  it("rejects input that doesn't fit the kind", () => {
    expect(tomlLiteral("number", "abc")).toBeNull();
    expect(tomlLiteral("boolean", "yes")).toBeNull();
    expect(tomlLiteral("string", 'a"b')).toBe('"a\\"b"');
  });
});

describe("INI inspector", () => {
  const INI = "; comment\n[general]\nname = Mouse Comb\n\n[paths]\ncache: /tmp/cache\n";

  it("lists keys with their section", () => {
    expect(iniFields(INI).fields.map((f) => [f.label, f.value])).toEqual([
      ["general.name", "Mouse Comb"],
      ["paths.cache", "/tmp/cache"],
    ]);
  });

  it("patches a value and keeps the key and the separator", () => {
    const field = fieldNamed(INI, "paths.cache");
    const result = patchLine(INI, field, iniLiteral(" /var/cache ")!, "ini");
    expect("text" in result && result.text).toContain("cache: /var/cache\n");
  });
});

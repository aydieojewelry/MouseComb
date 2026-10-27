import { describe, expect, it } from "vitest";

import { detectDelimiter, lineEndingOf, parseCsv, serializeCsv } from "./csv";

describe("CSV delimiter detection", () => {
  it("finds comma, semicolon, tab and pipe", () => {
    expect(detectDelimiter("a,b,c\n1,2,3\n")).toBe(",");
    expect(detectDelimiter("a;b;c\n1;2;3\n")).toBe(";");
    expect(detectDelimiter("a\tb\tc\n1\t2\t3\n")).toBe("\t");
    expect(detectDelimiter("a|b|c\n1|2|3\n")).toBe("|");
  });

  it("ignores delimiters inside quotes", () => {
    expect(detectDelimiter('name;note\n"a, b, c";x\n')).toBe(";");
  });

  it("falls back to a comma for one column", () => {
    expect(detectDelimiter("just one column\nagain\n")).toBe(",");
  });
});

describe("CSV parsing", () => {
  it("handles quoted commas, doubled quotes and line breaks inside quotes", () => {
    const rows = parseCsv('a,"b, c","say ""hi"""\n"line\nbreak",2,3\n', ",");
    expect(rows).toEqual([
      ["a", "b, c", 'say "hi"'],
      ["line\nbreak", "2", "3"],
    ]);
  });

  it("reads CRLF line endings and a last line without a break", () => {
    expect(parseCsv("a,b\r\n1,2", ",")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("returns no rows for an empty file", () => {
    expect(parseCsv("", ",")).toEqual([]);
  });
});

describe("CSV writing", () => {
  it("quotes only what needs quoting and keeps the line ending and trailing break", () => {
    const text = serializeCsv([["a", "b, c"], ["x", 'say "hi"']], ",", "\r\n", true);
    expect(text).toBe('a,"b, c"\r\nx,"say ""hi"""\r\n');
  });

  it("round-trips through parse", () => {
    const rows = [["name", "note"], ["Ada", "likes; semicolons"], ["Lin", "two\nlines"]];
    const text = serializeCsv(rows, ";", "\n", false);
    expect(parseCsv(text, ";")).toEqual(rows);
  });

  it("detects the file's line ending", () => {
    expect(lineEndingOf("a\r\nb")).toBe("\r\n");
    expect(lineEndingOf("a\nb")).toBe("\n");
  });
});

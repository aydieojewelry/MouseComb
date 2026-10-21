// Run: node --test "scripts/*.test.mjs"
// The Windows commands can only be run on Windows; these checks catch the usual slips.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const DIR = fileURLToPath(new URL("./win/", import.meta.url));
const files = readdirSync(DIR).filter((n) => n.endsWith(".bat"));

test("there are Windows commands", () => {
  assert.ok(files.length >= 10);
  assert.ok(files.includes("_need.bat") && files.includes("check.bat"));
});

for (const name of files) {
  const text = readFileSync(DIR + name, "utf8");
  const lines = text.split("\r\n");

  test(`${name}: CRLF, quiet, finds the repo by itself`, () => {
    assert.ok(!/(?<!\r)\n/.test(text), "every line ends with CRLF");
    assert.equal(lines[0], "@echo off");
    assert.match(lines[1], /^rem \S/, "a one-line rem says what it is for");
    if (!name.startsWith("_")) assert.ok(text.includes("%~dp0"), "paths start from the script's own folder");
    assert.ok(!/[A-Za-z]:\\/.test(text), "no drive letters or user folders");
  });

  test(`${name}: no unescaped redirection characters in rem or echo text`, () => {
    for (const line of lines) {
      const m = /^\s*(rem|echo)\s+(.*)$/i.exec(line);
      if (!m || /^echo\.$/i.test(line.trim())) continue;
      const body = m[2].replace(/\^./g, "");
      const redirected = /\s*(>nul|2>nul)\s*$/.test(body);
      if (redirected) continue;
      assert.ok(!/[<>|&]/.test(body), `${name}: "${line.trim()}"`);
    }
  });
}

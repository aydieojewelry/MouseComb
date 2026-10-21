// Run: node --test "scripts/*.test.mjs"
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { checkDocs, slug, toonBlocks } from "./docs-check.mjs";

function repo(files) {
  const root = mkdtempSync(join(tmpdir(), "docs-"));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

test("headings become anchors the way GitHub and Obsidian write them", () => {
  assert.equal(slug("How to write CR (SOP)"), "how-to-write-cr-sop");
  assert.equal(slug("`>resume` and more"), "resume-and-more");
  assert.equal(slug("What's new"), "whats-new");
});

test("finds toon blocks", () => {
  const blocks = toonBlocks("a\n```toon\nk: v\n```\nb\n");
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].body, "k: v\n");
});

test("a good set of docs passes", () => {
  const root = repo({
    "README.md": "# R\n[CR](CR/CR.md#launch) and `CR/Other.md`\n",
    "CR/CR.md":
      "---\ntags: [x]\n---\n# CR\n## Help\n## Launch\nrun `pnpm dev`\n## Versioning\n```toon\ncommands[1]{name,cmd}:\n  dev,pnpm dev\n```\nSee [[Other#Part one]].\n",
    "CR/Other.md": "# Other\n## Part one\n",
  });
  assert.deepEqual(checkDocs({ root, tracked: ["README.md", "CR/CR.md", "CR/Other.md"] }), []);
});

test("broken links, wikilinks, anchors, toon and commands are reported", () => {
  const root = repo({
    "README.md": "# R\n[gone](nope.md) [bad](CR/CR.md#missing)\n",
    "CR/CR.md":
      "---\ntags: [x]\n---\n# CR\n## Help\n## Launch\nrun `pnpm dev`\n## Versioning\n```toon\ncommands[1]{name,cmd}:\n  build,pnpm build\n```\n```toon\nbroken: [unclosed\n  nope\n```\n[[Ghost]] [[Other#Nowhere]]\n",
    "CR/Other.md": "# Other\n",
  });
  const errors = checkDocs({ root, tracked: ["README.md", "CR/CR.md", "CR/Other.md"] }).join("\n");
  assert.match(errors, /broken link \(nope\.md\)/);
  assert.match(errors, /no heading "#missing"/);
  assert.match(errors, /no note called \[\[Ghost\]\]/);
  assert.match(errors, /no heading "Nowhere"/);
  assert.match(errors, /command "pnpm build" is in the TOON block but not in ## Launch/);
  assert.match(errors, /TOON block does not parse/);
  assert.match(errors, /Documents table is missing CR\/Other\.md/);
});

test("links inside code blocks are examples, not links", () => {
  const root = repo({ "README.md": "# R\n```md\n[x](missing.md) [[Nope]]\n```\n" });
  assert.deepEqual(checkDocs({ root, tracked: [] }), []);
});

test("every Windows script has to be described", () => {
  const root = repo({ "README.md": "# R\n", "scripts/win/a.bat": "@echo off\r\n", "scripts/win/README.md": "# win\n" });
  assert.match(checkDocs({ root, tracked: [] }).join("\n"), /does not describe a\.bat/);
});

test("the real docs pass", () => {
  assert.deepEqual(checkDocs({}), []);
});

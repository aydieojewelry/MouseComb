#!/usr/bin/env node
// Checks the human-readable docs (CR/CR.md "How to write CR"):
//   - relative links and [[wikilinks]] resolve, headings included
//   - every ```toon block parses (strict TOON)
//   - the commands in CR.md's TOON `commands` table appear in its Launch section
//   - every scripts/win/*.bat is described in scripts/win/README.md
//   - every tracked .md file is in the README's Documents table
//
//   node scripts/docs-check.mjs          check, exit 1 on a problem
//   node scripts/docs-check.mjs --fmt    also rewrite the TOON blocks in their standard layout
//
// Needs `pnpm install` (the TOON decoder is a dev dependency); Node 22+.

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { decode, encode } from "@toon-format/toon";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SKIP_DIRS = new Set(["node_modules", "target", ".git", "dist", "gen", "pb_data"]);

/** GitHub and Obsidian anchor for a heading: lower case, punctuation dropped, spaces to hyphens. */
export function slug(heading) {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[`*_~]/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s/g, "-");
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (name.endsWith(".md")) out.push(path);
  }
  return out;
}

/** Text with fenced code blocks blanked out, so examples in them aren't read as links. */
function stripFences(text) {
  return text.replace(/^(```|~~~)[^\n]*\n[^]*?^\1[^\n]*$/gm, (m) => m.replace(/[^\n]/g, " "));
}

/** Also blank out inline `code`, where a link or wikilink is only being talked about. */
function stripCode(text) {
  return stripFences(text).replace(/`[^`\n]+`/g, (m) => " ".repeat(m.length));
}

function headingsOf(text) {
  const out = new Set();
  for (const m of stripFences(text).matchAll(/^#{1,6}\s+(.+?)\s*#*\s*$/gm)) out.add(slug(m[1]));
  return out;
}

/** The ```toon blocks of a file: their text and where they start (for --fmt). */
export function toonBlocks(text) {
  const blocks = [];
  for (const m of text.matchAll(/^```toon[^\n]*\n([^]*?)^```[ \t]*$/gm)) {
    blocks.push({ body: m[1], start: m.index + m[0].indexOf("\n") + 1, end: m.index + m[0].length - 3 });
  }
  return blocks;
}

/** Section text under `## <title>` up to the next `## `. */
function section(text, title) {
  const lines = text.split("\n");
  const at = lines.findIndex((l) => l.trim() === `## ${title}`);
  if (at < 0) return null;
  const rest = lines.slice(at + 1);
  const stop = rest.findIndex((l) => l.startsWith("## "));
  return rest.slice(0, stop < 0 ? undefined : stop).join("\n");
}

export function checkDocs({ root = ROOT, tracked = null, fmt = false } = {}) {
  const errors = [];
  const files = walk(root);
  const rel = (p) => relative(root, p).split("\\").join("/");
  const texts = new Map(files.map((f) => [f, readFileSync(f, "utf8")]));
  const byName = new Map();
  for (const f of files) byName.set(basename(f, ".md").toLowerCase(), f);
  const anchors = new Map([...texts].map(([f, t]) => [f, headingsOf(t)]));

  for (const [file, text] of texts) {
    const where = rel(file);
    const prose = stripCode(text);

    // [text](target), skipping web, mail and image-less anchors-only targets handled below.
    for (const m of prose.matchAll(/(?<!!)\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      const target = m[1];
      if (/^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
      const [path, hash] = target.split("#");
      const dest = path ? resolve(dirname(file), decodeURIComponent(path)) : file;
      if (!existsSync(dest)) {
        errors.push(`${where}: broken link (${target})`);
        continue;
      }
      if (hash && dest.endsWith(".md") && !anchors.get(dest)?.has(hash.toLowerCase())) {
        errors.push(`${where}: no heading "#${hash}" in ${rel(dest)}`);
      }
    }

    // [[Note]], [[Note#Heading]], [[Note|label]]
    for (const m of prose.matchAll(/\[\[([^\]|#]*)(?:#([^\]|]+))?(?:\|[^\]]*)?\]\]/g)) {
      const name = m[1].trim().toLowerCase();
      // [[folder/Note]] matches by path, [[Note]] by file name alone.
      const dest = name === "" ? file : name.includes("/") ? files.find((f) => rel(f).toLowerCase().replace(/\.md$/, "").endsWith(name)) : byName.get(name);
      if (!dest) errors.push(`${where}: no note called [[${m[1]}]]`);
      else if (m[2] && !anchors.get(dest)?.has(slug(m[2]))) errors.push(`${where}: no heading "${m[2]}" in [[${m[1]}]]`);
    }

    // TOON blocks parse strictly; --fmt rewrites them in the encoder's layout.
    let rewritten = text;
    for (const block of toonBlocks(text).reverse()) {
      try {
        const data = decode(block.body);
        if (fmt) {
          const tidy = encode(data) + "\n";
          rewritten = rewritten.slice(0, block.start) + tidy + rewritten.slice(block.end);
        }
      } catch (e) {
        errors.push(`${where}: TOON block does not parse: ${e instanceof Error ? e.message : e}`);
      }
    }
    if (fmt && rewritten !== text) writeFileSync(file, rewritten);
  }

  // CR.md lists commands in TOON; the human Launch section must show the same ones.
  const cr = join(root, "CR", "CR.md");
  if (existsSync(cr)) {
    const text = readFileSync(cr, "utf8");
    const launch = section(text, "Launch") ?? "";
    if (!launch) errors.push("CR/CR.md: no ## Launch section");
    for (const block of toonBlocks(text)) {
      let data;
      try {
        data = decode(block.body);
      } catch {
        continue;
      }
      for (const row of data.commands ?? []) {
        if (row.cmd && !launch.includes(row.cmd)) errors.push(`CR/CR.md: command "${row.cmd}" is in the TOON block but not in ## Launch`);
      }
    }
    for (const needed of ["Launch", "Versioning", "Help"]) {
      if (section(text, needed) === null) errors.push(`CR/CR.md: no ## ${needed} section`);
    }
    if (!/^---\n[^]*?\n---\n/.test(text)) errors.push("CR/CR.md: no front matter");
  }

  // Every Windows script is described.
  const win = join(root, "scripts", "win");
  if (existsSync(win)) {
    const readme = existsSync(join(win, "README.md")) ? readFileSync(join(win, "README.md"), "utf8") : "";
    for (const name of readdirSync(win).filter((n) => n.endsWith(".bat") && !n.startsWith("_"))) {
      if (!readme.includes(name)) errors.push(`scripts/win/README.md: does not describe ${name}`);
    }
  }

  // Every tracked .md file is in the README's Documents table.
  const readmePath = join(root, "README.md");
  if (existsSync(readmePath)) {
    const readme = readFileSync(readmePath, "utf8");
    const docs = tracked ?? trackedMarkdown(root);
    for (const doc of docs.filter((d) => d !== "README.md")) {
      if (!readme.includes(doc)) errors.push(`README.md: Documents table is missing ${doc}`);
    }
  }
  return errors;
}

function trackedMarkdown(root) {
  try {
    return execFileSync("git", ["ls-files", "*.md"], { cwd: root, encoding: "utf8" })
      .split("\n")
      .filter(Boolean)
      .filter((p) => !p.startsWith("node_modules/"));
  } catch {
    return [];
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const errors = checkDocs({ fmt: process.argv.includes("--fmt") });
  if (errors.length) {
    console.error(errors.map((e) => `✗ ${e}`).join("\n"));
    console.error(`\n${errors.length} problem${errors.length === 1 ? "" : "s"} in the docs.`);
    process.exit(1);
  }
  console.log("Docs OK: links, wikilinks, TOON blocks, commands and the Documents table all line up.");
}

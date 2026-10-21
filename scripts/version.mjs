#!/usr/bin/env node
// MouseComb release versions: x.y.z+b (CR/CR.md "Versioning").
// CHANGELOG.md decides the version: what is under "## Next" and which
// sub-headings it sits under.
//
//   node scripts/version.mjs status                    last release, and what "## Next" would become
//   node scripts/version.mjs release [--dry] [--name "title"]
//                                                      turn "## Next" into the next numbered section
//   node scripts/version.mjs plan                      what the Release workflow should publish
//   node scripts/version.mjs apply <x.y.z+b>           write the version into the app manifests
//
// No dependencies; Node 22+.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const ORDER = ["x", "y", "z"];

/** Test releases that don't count: the first prototype, before numbering restarted at 0.0.0+1. */
export const RETIRED_TAGS = new Set(["v0.1.0+11"]);

/** "0.2.3+36" or "v0.2.3+36" → { x, y, z, b } */
export function parseVersion(text) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:\+(\d+))?$/.exec(text.trim());
  if (!m) return null;
  const [x, y, z, b] = m.slice(1).map((part) => (part === undefined ? 0 : Number(part)));
  return { x, y, z, b };
}

/** Order by x, y, z, then build. */
export function compare(a, b) {
  for (const k of [...ORDER, "b"]) if (a[k] !== b[k]) return a[k] - b[k];
  return 0;
}

/**
 * How big each "## Next" sub-heading is. Features and core ideas are main
 * features, functionality, hotkeys and changes are minor changes, fixes are fixes.
 * Other headings ("Known limits") don't change the version.
 */
const SIZE = {
  features: "main",
  new: "main",
  "core ideas": "main",
  functionality: "minor",
  hotkeys: "minor",
  changes: "minor",
  improved: "minor",
  changed: "minor",
  fixes: "fix",
  fixed: "fix",
};
const RANK = { main: 0, minor: 1, fix: 2 };

/** Which of x, y, z a change of this size bumps. A prototype (x = 0) shifts one place down. */
export function partFor(size, x) {
  const part = { main: "x", minor: "y", fix: "z" }[size];
  if (x === 0 && part !== "z") return ORDER[ORDER.indexOf(part) + 1];
  return part;
}

/** The next version: bump `part` (lower parts reset) and the build number by one. */
export function bumpVersion(last, part) {
  const next = { ...last, b: last.b + 1 };
  if (part === null) return next; // a hotfix rebuild: same x.y.z, new build
  const i = ORDER.indexOf(part);
  next[part] += 1;
  for (const k of ORDER.slice(i + 1)) next[k] = 0;
  return next;
}

/** The spellings one release needs; throws past what the MSI installer can hold. */
export function forms(v) {
  if (v.x > 255 || v.y > 255) throw new Error("x and y must stay <= 255 for the MSI installer");
  if (v.z > 65535) throw new Error("z must stay <= 65535 for the MSI installer");
  const semver = `${v.x}.${v.y}.${v.z}`;
  const display = `${semver}+${v.b}`;
  return { display, tag: `v${display}`, semver, msi: semver, build: v.b, prerelease: v.x === 0 };
}

// ---- CHANGELOG.md -------------------------------------------------------------

/** The notes under `## <display>` in CHANGELOG.md, or null. */
export function changelogSection(changelog, display) {
  const lines = changelog.split("\n");
  const at = lines.findIndex((l) => l.startsWith(`## ${display} `) || l.trim() === `## ${display}`);
  if (at < 0) return null;
  const rest = lines.slice(at + 1);
  const stop = rest.findIndex((l) => l.startsWith("## "));
  return rest.slice(0, stop < 0 ? undefined : stop).join("\n").trim();
}

/** The newest version CHANGELOG.md has a section for ("## 0.1.0+2 — …"), or null. */
export function latestInChangelog(changelog) {
  const m = /^## v?(\d+\.\d+\.\d+\+\d+)\b/m.exec(changelog);
  return m ? m[1] : null;
}

/** What "## Next" holds: its sub-headings with their bullets, and the biggest change among them. */
export function readNext(changelog) {
  const body = changelogSection(changelog, "Next");
  if (body === null) return { found: false, groups: [], size: null };
  const groups = [];
  let current = null;
  for (const line of body.split("\n")) {
    const heading = /^###\s+(.+?)\s*$/.exec(line);
    if (heading) {
      current = { title: heading[1], items: [] };
      groups.push(current);
    } else if (current && /^[-*]\s+\S/.test(line)) {
      current.items.push(line.replace(/^[-*]\s+/, ""));
    }
  }
  let size = null;
  for (const g of groups) {
    const s = SIZE[g.title.toLowerCase()];
    if (s && g.items.length && (size === null || RANK[s] < RANK[size])) size = s;
  }
  return { found: true, groups, size };
}

const NEXT_HINT =
  "<!-- Owner: write what you want next as bullets here, under any sub-heading (Features, Functionality, Hotkeys, Core ideas, Changes, Fixes). Agent: build it, then keep these sub-headings and run `node scripts/version.mjs release`. -->";

/**
 * Turn "## Next" into the next numbered section and leave a fresh, empty
 * "## Next" above it. Returns the new version and the new CHANGELOG text.
 */
export function cutRelease({ changelog, last, date, name }) {
  const next = readNext(changelog);
  if (!next.found) throw new Error('CHANGELOG.md has no "## Next" section.');
  if (next.size === null) {
    throw new Error('Nothing to release: put bullets under Features, Functionality, Hotkeys, Core ideas, Changes or Fixes in "## Next".');
  }
  const base = last ?? { x: 0, y: 0, z: 0, b: 0 };
  const version = bumpVersion(base, partFor(next.size, base.x));
  const f = forms(version);
  const title = [f.display, date, name].filter(Boolean).join(" — ");
  const lines = changelog.split("\n");
  const at = lines.findIndex((l) => l.trim() === "## Next");
  // The hint is for whoever writes "## Next"; it doesn't belong in a release.
  const end = lines.findIndex((l, i) => i > at && l.startsWith("## "));
  const kept = lines.filter((l, i) => !(i > at && (end < 0 || i < end) && /^<!--.*-->$/.test(l.trim())));
  kept.splice(at, 1, `## Next\n\n${NEXT_HINT}\n\n## ${title}`);
  return { version, ...f, size: next.size, changelog: kept.join("\n").replace(/\n{3,}/g, "\n\n") };
}

// ---- what to release ------------------------------------------------------------------

/**
 * What the Release workflow should publish:
 * - a hotfix (`hotfix` = the reason): the last release's x.y.z again, build + 1;
 * - a pushed tag: that version;
 * - a push or run on `main`: the newest CHANGELOG.md version, if it isn't tagged yet.
 * Releases come from `main` only.
 */
export function plan({ tag, branch, changelog, tags, hotfix, last }) {
  const known = new Set(tags);
  const describe = (display, fallback) => {
    const v = parseVersion(display);
    return { release: true, ...forms(v), notes: changelogSection(changelog, forms(v).display) ?? fallback };
  };
  if (hotfix) {
    if (branch !== "main") return { release: false, reason: "a hotfix rebuilds main: run it on main" };
    if (!last) return { release: false, reason: "no release to rebuild yet" };
    const v = bumpVersion(last, null);
    return {
      release: true,
      ...forms(v),
      notes: `**Hotfix.** ${hotfix.trim()}\n\nThe same version as ${forms(last).display}, rebuilt.`,
    };
  }
  if (tag) {
    if (!parseVersion(tag)) throw new Error(`Tag ${tag} is not vX.Y.Z+B (CR/CR.md "Versioning").`);
    return describe(tag.replace(/^v/, ""), "See CHANGELOG.md.");
  }
  if (branch) {
    if (branch !== "main") return { release: false, reason: "releases come from main only" };
    const display = latestInChangelog(changelog);
    if (!display) return { release: false, reason: "CHANGELOG.md names no version" };
    const v = parseVersion(display);
    if (known.has(forms(v).tag)) return { release: false, reason: `${forms(v).tag} is already released` };
    if (last && compare(v, last) <= 0) return { release: false, reason: `${display} is not newer than ${forms(last).display}` };
    return describe(display, "See CHANGELOG.md.");
  }
  return { release: false, reason: "nothing to release" };
}

// ---- git and files ---------------------------------------------------------------------

function git(...args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
}

function releaseTags() {
  return git("tag", "--list", "v*").split("\n").filter(Boolean);
}

/** The newest real release (retired tags don't count), or null. */
export function lastRelease(tags) {
  let best = null;
  for (const tag of tags) {
    const v = RETIRED_TAGS.has(tag) ? null : parseVersion(tag);
    if (v && (!best || compare(v, best) > 0)) best = v;
  }
  return best;
}

function readChangelog() {
  return existsSync(`${ROOT}/CHANGELOG.md`) ? readFileSync(`${ROOT}/CHANGELOG.md`, "utf8") : "";
}

function apply(text) {
  const v = parseVersion(text);
  if (!v) throw new Error(`not an x.y.z+b version: ${text}`);
  const { semver } = forms(v);
  const edit = (file, fn) => {
    const path = `${ROOT}/${file}`;
    writeFileSync(path, fn(readFileSync(path, "utf8")));
  };
  edit("apps/desktop/src-tauri/tauri.conf.json", (s) => s.replace(/"version": "[^"]*"/, `"version": "${semver}"`));
  edit("apps/desktop/package.json", (s) => s.replace(/"version": "[^"]*"/, `"version": "${semver}"`));
  edit("apps/desktop/src-tauri/Cargo.toml", (s) => s.replace(/^version = "[^"]*"/m, `version = "${semver}"`));
  return { applied: semver, build: v.b };
}

function flag(args, name) {
  const at = args.indexOf(name);
  return at < 0 ? null : (args[at + 1] ?? "");
}

function main(argv) {
  const [cmd, ...args] = argv;
  const tags = releaseTags();
  const last = lastRelease(tags);
  const changelog = readChangelog();
  if (cmd === "status") {
    const next = readNext(changelog);
    const out = { last: last ? forms(last).display : null, next: next.found ? next.groups.filter((g) => g.items.length).map((g) => `${g.title}: ${g.items.length}`) : "no ## Next section" };
    if (next.size) out.would_release = cutRelease({ changelog, last, date: "today" }).display;
    return out;
  }
  if (cmd === "release") {
    const dry = args.includes("--dry");
    const date = new Date().toISOString().slice(0, 10);
    const cut = cutRelease({ changelog, last, date, name: flag(args, "--name") });
    if (!dry) writeFileSync(`${ROOT}/CHANGELOG.md`, cut.changelog);
    return { version: cut.display, tag: cut.tag, size: cut.size, written: !dry };
  }
  if (cmd === "plan") {
    // Inputs from the Release workflow: PUSHED_TAG or PUSHED_BRANCH, and HOTFIX (the reason) for a hotfix run.
    return plan({
      tag: process.env.PUSHED_TAG || null,
      branch: process.env.PUSHED_BRANCH || null,
      hotfix: process.env.HOTFIX || null,
      changelog,
      tags,
      last,
    });
  }
  if (cmd === "apply") return apply(args[0]);
  console.error('usage: version.mjs status | release [--dry] [--name "title"] | plan | apply <x.y.z+b>');
  process.exit(2);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    console.log(JSON.stringify(main(process.argv.slice(2)), null, 2));
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
}

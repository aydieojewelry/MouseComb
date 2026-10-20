#!/usr/bin/env node
// MouseComb release versions (VERSIONING.md): x.y.z+b.
//
//   node scripts/version.mjs next               JSON for the next release, or {"release":false}
//   node scripts/version.mjs apply <x.y.z+b>    write the version into the app manifests
//   node scripts/version.mjs notes              Markdown release notes since the last tag
//
// No dependencies; Node 22+.

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const ORDER = ["x", "y", "z"];

/** "0.2.3+36" or "v0.2.3+36" → { x, y, z, b } */
export function parseVersion(text) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:\+(\d+))?$/.exec(text.trim());
  if (!m) return null;
  const [x, y, z, b] = m.slice(1).map((part) => (part === undefined ? 0 : Number(part)));
  return { x, y, z, b };
}

export function compare(a, b) {
  for (const k of ORDER) if (a[k] !== b[k]) return a[k] - b[k];
  return 0;
}

/** Which part a commit bumps, from its message (VERSIONING.md "How the next version is chosen"). */
export function bumpOf(subject, body = "") {
  const m = /^(\w+)(?:\([^)]*\))?(!)?:/.exec(subject.trim());
  if (/^BREAKING(?: CHANGE)?:/m.test(body)) return "x";
  if (!m) return null;
  const [, type, bang] = m;
  if (type === "uplift" || bang || type === "feat") return "x";
  if (type === "patch" || type === "perf") return "y";
  if (type === "fix") return "z";
  return null;
}

/** The biggest bump among commits, or null if none of them ships. */
export function biggestBump(commits) {
  let best = null;
  for (const c of commits) {
    const bump = bumpOf(c.subject, c.body);
    if (bump && (best === null || ORDER.indexOf(bump) < ORDER.indexOf(best))) best = bump;
  }
  return best;
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

function git(...args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
}

function lastTag() {
  const tags = git("tag", "--list", "v*").split("\n").filter(Boolean);
  let best = null;
  for (const tag of tags) {
    const v = parseVersion(tag);
    if (v && (!best || compare(v, best.v) > 0)) best = { tag, v };
  }
  return best;
}

function commitsSince(tag) {
  const range = tag ? [`${tag}..HEAD`] : ["HEAD"];
  const raw = git("log", ...range, "--format=%s%x1f%b%x1e");
  return raw
    .split("\x1e")
    .map((r) => r.trim())
    .filter(Boolean)
    .map((r) => {
      const [subject, body = ""] = r.split("\x1f");
      return { subject: subject.trim(), body: body.trim() };
    });
}

export function releaseNotes(commits) {
  const groups = { x: "New", y: "Improved", z: "Fixed" };
  const lines = [];
  for (const part of ORDER) {
    const items = commits.filter((c) => bumpOf(c.subject, c.body) === part);
    if (!items.length) continue;
    lines.push(`### ${groups[part]}`);
    for (const c of items) lines.push(`- ${c.subject.replace(/^\w+(\([^)]*\))?!?:\s*/, "")}`);
    lines.push("");
  }
  return lines.join("\n").trim();
}

function next() {
  const last = lastTag();
  const commits = commitsSince(last?.tag);
  const bump = biggestBump(commits);
  if (!bump) return { release: false, since: last?.tag ?? null };
  const base = last?.v ?? { x: 0, y: 0, z: 0, b: 0 };
  const v = bumpVersion(base, bump);
  return { release: true, bump, since: last?.tag ?? null, ...forms(v), notes: releaseNotes(commits) };
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

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [cmd, arg] = process.argv.slice(2);
  if (cmd === "next") console.log(JSON.stringify(next(), null, 2));
  else if (cmd === "apply") console.log(JSON.stringify(apply(arg)));
  else if (cmd === "notes") console.log(releaseNotes(commitsSince(lastTag()?.tag)));
  else {
    console.error("usage: version.mjs next | apply <x.y.z+b> | notes");
    process.exit(2);
  }
}

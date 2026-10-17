#!/usr/bin/env node
// MouseComb release versions (VERSIONING.md): w.x.y.z+b.
//
//   node scripts/version.mjs next [--build N]   JSON for the next release, or {"release":false}
//   node scripts/version.mjs apply <w.x.y.z+b>  write the version into the app manifests
//   node scripts/version.mjs notes              Markdown release notes since the last tag
//
// No dependencies; Node 22+.

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const ORDER = ["w", "x", "y", "z"];

/** "0.2.1.3+36" or "v0.2.1.3+36" → { w, x, y, z, b } */
export function parseVersion(text) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)\.(\d+)(?:\+(\d+))?$/.exec(text.trim());
  if (!m) return null;
  const [w, x, y, z, b] = m.slice(1).map((part) => (part === undefined ? 0 : Number(part)));
  return { w, x, y, z, b };
}

export function compare(a, b) {
  for (const k of ORDER) if (a[k] !== b[k]) return a[k] - b[k];
  return 0;
}

/** Which part a commit bumps, from its message (VERSIONING.md "How the next version is chosen"). */
export function bumpOf(subject, body = "") {
  const m = /^(\w+)(?:\([^)]*\))?(!)?:/.exec(subject.trim());
  if (/^BREAKING(?: CHANGE)?:/m.test(body)) return "w";
  if (!m) return null;
  const [, type, bang] = m;
  if (type === "uplift" || bang) return "w";
  if (type === "feat") return "x";
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

export function bumpVersion(last, part, build) {
  const next = { ...last, b: build };
  const i = ORDER.indexOf(part);
  next[part] += 1;
  for (const k of ORDER.slice(i + 1)) next[k] = 0;
  return next;
}

/** The spellings one release needs; throws if the 3-part Windows form can't hold it. */
export function forms(v) {
  if (v.z > 99) throw new Error(`fix number ${v.z} > 99: release a patch (y) instead`);
  if (v.y > 654) throw new Error(`patch number ${v.y} > 654: release a feature update (x) instead`);
  if (v.w > 255 || v.x > 255) throw new Error("major and feature numbers must stay <= 255 for MSI");
  const display = `${v.w}.${v.x}.${v.y}.${v.z}+${v.b}`;
  const three = `${v.w}.${v.x}.${v.y * 100 + v.z}`;
  return { display, tag: `v${display}`, semver: three, msi: three, build: v.b };
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
  const groups = { w: "Breaking changes", x: "New", y: "Improved", z: "Fixed" };
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

function next(build) {
  const last = lastTag();
  const commits = commitsSince(last?.tag);
  const bump = biggestBump(commits);
  if (!bump) return { release: false, since: last?.tag ?? null };
  const base = last?.v ?? { w: 0, x: 0, y: 0, z: 0, b: 0 };
  const v = bumpVersion(base, bump, build);
  return { release: true, bump, since: last?.tag ?? null, ...forms(v), notes: releaseNotes(commits) };
}

function apply(text) {
  const v = parseVersion(text);
  if (!v) throw new Error(`not a w.x.y.z+b version: ${text}`);
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
  const [cmd, arg, value] = process.argv.slice(2);
  const build = Number(arg === "--build" ? value : process.env.GITHUB_RUN_NUMBER ?? 0);
  if (cmd === "next") console.log(JSON.stringify(next(build), null, 2));
  else if (cmd === "apply") console.log(JSON.stringify(apply(arg)));
  else if (cmd === "notes") console.log(releaseNotes(commitsSince(lastTag()?.tag)));
  else {
    console.error("usage: version.mjs next [--build N] | apply <w.x.y.z+b> | notes");
    process.exit(2);
  }
}

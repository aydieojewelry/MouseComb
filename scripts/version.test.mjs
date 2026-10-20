// Run: node --test "scripts/*.test.mjs"
import assert from "node:assert/strict";
import { test } from "node:test";

import { biggestBump, bumpOf, bumpVersion, changelogSection, forms, latestInChangelog, parseVersion, plan, releaseNotes } from "./version.mjs";

test("parses x.y.z+b with or without v and build", () => {
  assert.deepEqual(parseVersion("v0.2.3+36"), { x: 0, y: 2, z: 3, b: 36 });
  assert.deepEqual(parseVersion("1.0.0"), { x: 1, y: 0, z: 0, b: 0 });
  assert.equal(parseVersion("1.2.3.4"), null);
  assert.equal(parseVersion("v1.2.3-beta"), null);
});

test("commit prefixes pick the part", () => {
  assert.equal(bumpOf("feat(omnibar): calculator"), "x");
  assert.equal(bumpOf("uplift!: new sync protocol"), "x");
  assert.equal(bumpOf("chore: tidy", "BREAKING: settings file moved"), "x");
  assert.equal(bumpOf("patch: faster OmniBar"), "y");
  assert.equal(bumpOf("perf: cache icons"), "y");
  assert.equal(bumpOf("fix: tray icon"), "z");
  assert.equal(bumpOf("docs: readme"), null);
  assert.equal(bumpOf("Merge pull request #3"), null);
});

test("the biggest bump wins, lower parts reset, the build always grows", () => {
  const commits = [{ subject: "fix: a" }, { subject: "feat: b" }, { subject: "patch: c" }];
  assert.equal(biggestBump(commits), "x");
  assert.equal(biggestBump([{ subject: "docs: only docs" }]), null);
  const last = parseVersion("0.2.3+36");
  assert.deepEqual(bumpVersion(last, "x"), { x: 1, y: 0, z: 0, b: 37 });
  assert.deepEqual(bumpVersion(last, "y"), { x: 0, y: 3, z: 0, b: 37 });
  assert.deepEqual(bumpVersion(last, "z"), { x: 0, y: 2, z: 4, b: 37 });
  assert.deepEqual(bumpVersion(last, null), { x: 0, y: 2, z: 3, b: 37 }, "hotfix rebuild");
});

test("installers use x.y.z as is; 0.y.z is a prototype", () => {
  const f = forms(parseVersion("0.1.0+11"));
  assert.deepEqual(f, { display: "0.1.0+11", tag: "v0.1.0+11", semver: "0.1.0", msi: "0.1.0", build: 11, prerelease: true });
  assert.equal(forms(parseVersion("1.4.2+90")).prerelease, false);
  assert.throws(() => forms(parseVersion("0.256.0")), /255/);
  assert.throws(() => forms(parseVersion("0.1.65536")), /65535/);
});

test("release notes group by kind and drop prefixes", () => {
  const notes = releaseNotes([
    { subject: "fix: tray icon" },
    { subject: "feat(omnibar): calculator" },
    { subject: "docs: readme" },
  ]);
  assert.equal(notes, "### New\n- calculator\n\n### Fixed\n- tray icon");
});

const CHANGELOG = "# Changelog\n\nIntro.\n\n## 0.2.0+12 — 2026-11-01\n\n### New\n- Thing\n\n## 0.1.0+11 — 2026-10-20 — first prototype\n\nOld notes.\n";

test("CHANGELOG.md names the version to release and its notes", () => {
  assert.equal(latestInChangelog(CHANGELOG), "0.2.0+12");
  assert.equal(changelogSection(CHANGELOG, "0.2.0+12"), "### New\n- Thing");
  assert.equal(changelogSection(CHANGELOG, "0.1.0+11"), "Old notes.");
  assert.equal(changelogSection(CHANGELOG, "0.1.0+1"), null);
});

test("a push releases the newest CHANGELOG version once; 1.0+ only from main", () => {
  const base = { tag: null, changelog: CHANGELOG, commits: [{ subject: "feat: thing" }] };
  const p = plan({ ...base, branch: "claude/x", tags: ["v0.1.0+11"] });
  assert.equal(p.release, true);
  assert.equal(p.tag, "v0.2.0+12");
  assert.equal(p.prerelease, true);
  assert.equal(p.notes, "### New\n- Thing");
  assert.equal(plan({ ...base, branch: "main", tags: ["v0.2.0+12"] }).release, false);
  const prod = { ...base, changelog: "## 1.0.0+40\n\nHello" };
  assert.equal(plan({ ...prod, branch: "claude/x", tags: [] }).release, false);
  assert.equal(plan({ ...prod, branch: "main", tags: [] }).tag, "v1.0.0+40");
  assert.equal(plan({ ...base, tag: "v0.1.0+11", branch: null, tags: [] }).notes, "Old notes.");
  assert.equal(plan({ ...base, tag: null, branch: null, tags: [] }), null, "weekly train decides itself");
});

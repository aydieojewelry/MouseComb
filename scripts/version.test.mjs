// Run: node --test "scripts/*.test.mjs"
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  bumpVersion,
  changelogSection,
  compare,
  cutRelease,
  forms,
  lastRelease,
  latestInChangelog,
  parseVersion,
  partFor,
  plan,
  readNext,
} from "./version.mjs";

test("parses x.y.z+b with or without v and build", () => {
  assert.deepEqual(parseVersion("v0.2.3+36"), { x: 0, y: 2, z: 3, b: 36 });
  assert.deepEqual(parseVersion("1.0.0"), { x: 1, y: 0, z: 0, b: 0 });
  assert.equal(parseVersion("1.2.3.4"), null);
  assert.equal(parseVersion("v1.2.3-beta"), null);
});

test("lower parts reset, the build always grows, a hotfix only grows the build", () => {
  const last = parseVersion("1.2.3+36");
  assert.deepEqual(bumpVersion(last, "x"), { x: 2, y: 0, z: 0, b: 37 });
  assert.deepEqual(bumpVersion(last, "y"), { x: 1, y: 3, z: 0, b: 37 });
  assert.deepEqual(bumpVersion(last, "z"), { x: 1, y: 2, z: 4, b: 37 });
  assert.deepEqual(bumpVersion(last, null), { x: 1, y: 2, z: 3, b: 37 });
});

test("installers use x.y.z as is; 0.y.z is a prototype", () => {
  const f = forms(parseVersion("0.1.0+11"));
  assert.deepEqual(f, { display: "0.1.0+11", tag: "v0.1.0+11", semver: "0.1.0", msi: "0.1.0", build: 11, prerelease: true });
  assert.equal(forms(parseVersion("1.4.2+90")).prerelease, false);
  assert.throws(() => forms(parseVersion("0.256.0")), /255/);
  assert.throws(() => forms(parseVersion("0.1.65536")), /65535/);
});

test("a prototype (x = 0) shifts every change one place down; 1.0.0 is the owner's call", () => {
  assert.equal(partFor("main", 1), "x");
  assert.equal(partFor("minor", 1), "y");
  assert.equal(partFor("fix", 1), "z");
  assert.equal(partFor("main", 0), "y");
  assert.equal(partFor("minor", 0), "z");
  assert.equal(partFor("fix", 0), "z");
});

test("the last release ignores the retired test prototype and orders by build", () => {
  assert.deepEqual(lastRelease(["v0.0.0+1", "v0.1.0+11"]), { x: 0, y: 0, z: 0, b: 1 });
  assert.deepEqual(lastRelease(["v0.1.0+2", "v0.1.0+3", "v0.0.9+1"]), { x: 0, y: 1, z: 0, b: 3 });
  assert.equal(lastRelease([]), null);
  assert.ok(compare(parseVersion("0.1.0+3"), parseVersion("0.1.0+2")) > 0);
});

const CHANGELOG = `# Changelog

Intro.

## Next

<!-- hint -->

### Features
- **Bangs:** search sites from the OmniBar.

### Fixes
- A typo.

### Known limits
- Windows only.

## 0.1.0+2 — 2026-10-21 — hotkeys

### Features
- Hotkeys

## 0.0.0+1 — 2026-10-20

Old notes.
`;

test("## Next: the biggest sub-heading with bullets decides the size", () => {
  const next = readNext(CHANGELOG);
  assert.equal(next.found, true);
  assert.equal(next.size, "main");
  assert.deepEqual(
    next.groups.map((g) => [g.title, g.items.length]),
    [["Features", 1], ["Fixes", 1], ["Known limits", 1]],
  );
  const only = (heading) => `## Next\n\n### ${heading}\n- x\n\n### Features\n\n## 0.0.0+1`;
  assert.equal(readNext(only("Hotkeys")).size, "minor");
  assert.equal(readNext(only("Fixes")).size, "fix");
  assert.equal(readNext(only("Known limits")).size, null, "limits alone don't release");
  assert.equal(readNext("## 0.0.0+1\n").found, false);
});

test("cutting a release names the version, dates the section and leaves a fresh ## Next", () => {
  const last = parseVersion("0.1.0+2");
  const cut = cutRelease({ changelog: CHANGELOG, last, date: "2026-10-25", name: "bangs" });
  assert.equal(cut.display, "0.2.0+3", "a main feature in a prototype bumps y");
  assert.equal(latestInChangelog(cut.changelog), "0.2.0+3");
  assert.match(cut.changelog, /## Next\n\n<!--[^]*?-->\n\n## 0\.2\.0\+3 — 2026-10-25 — bangs\n\n### Features/);
  assert.equal(readNext(cut.changelog).size, null, "the new ## Next is empty");
  assert.equal(changelogSection(cut.changelog, "0.2.0+3").includes("**Bangs:**"), true);
  assert.throws(() => cutRelease({ changelog: cut.changelog, last, date: "x" }), /Nothing to release/);
  assert.throws(() => cutRelease({ changelog: "# none", last, date: "x" }), /no "## Next"/);
});

test("CHANGELOG.md names the version to release and its notes", () => {
  assert.equal(latestInChangelog(CHANGELOG), "0.1.0+2");
  assert.equal(changelogSection(CHANGELOG, "0.1.0+2"), "### Features\n- Hotkeys");
  assert.equal(changelogSection(CHANGELOG, "0.0.0+1"), "Old notes.");
  assert.equal(changelogSection(CHANGELOG, "0.9.0+1"), null);
});

test("a push to main releases the newest CHANGELOG version once", () => {
  const base = { tag: null, changelog: CHANGELOG, last: parseVersion("0.0.0+1"), hotfix: null };
  const p = plan({ ...base, branch: "main", tags: ["v0.0.0+1"] });
  assert.equal(p.release, true);
  assert.equal(p.tag, "v0.1.0+2");
  assert.equal(p.prerelease, true);
  assert.equal(p.notes, "### Features\n- Hotkeys");
  assert.equal(plan({ ...base, branch: "main", tags: ["v0.1.0+2"] }).release, false, "already tagged");
  assert.equal(plan({ ...base, branch: "claude/x", tags: [] }).release, false, "releases come from main only");
  assert.equal(plan({ ...base, branch: "main", last: parseVersion("0.1.0+9"), tags: [] }).release, false, "not newer");
  assert.equal(plan({ ...base, branch: null, tags: [] }).release, false);
});

test("a tag releases exactly that version", () => {
  const p = plan({ tag: "v0.0.0+1", branch: null, changelog: CHANGELOG, tags: [], last: null, hotfix: null });
  assert.equal(p.tag, "v0.0.0+1");
  assert.equal(p.notes, "Old notes.");
  assert.throws(() => plan({ tag: "v1", branch: null, changelog: "", tags: [], last: null, hotfix: null }), /not vX\.Y\.Z\+B/);
});

test("a hotfix is the same x.y.z with the build + 1, from main, no branch", () => {
  const last = parseVersion("0.1.0+2");
  const p = plan({ tag: null, branch: "main", changelog: CHANGELOG, tags: [], last, hotfix: "Installer did not start." });
  assert.equal(p.tag, "v0.1.0+3");
  assert.equal(p.build, 3);
  assert.equal(p.semver, "0.1.0");
  assert.match(p.notes, /\*\*Hotfix\.\*\* Installer did not start\./);
  assert.match(p.notes, /same version as 0\.1\.0\+2/);
  assert.equal(plan({ tag: null, branch: "feature", changelog: "", tags: [], last, hotfix: "x" }).release, false);
  assert.equal(plan({ tag: null, branch: "main", changelog: "", tags: [], last: null, hotfix: "x" }).release, false);
});

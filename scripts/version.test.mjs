// Run: node --test "scripts/*.test.mjs"
import assert from "node:assert/strict";
import { test } from "node:test";

import { biggestBump, bumpOf, bumpVersion, forms, parseVersion, releaseNotes } from "./version.mjs";

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

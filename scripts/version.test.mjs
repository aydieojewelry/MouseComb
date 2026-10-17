// Run: node --test "scripts/*.test.mjs"
import assert from "node:assert/strict";
import { test } from "node:test";

import { biggestBump, bumpOf, bumpVersion, forms, parseVersion, releaseNotes } from "./version.mjs";

test("parses w.x.y.z+b with or without v and build", () => {
  assert.deepEqual(parseVersion("v0.2.1.3+36"), { w: 0, x: 2, y: 1, z: 3, b: 36 });
  assert.deepEqual(parseVersion("1.0.0.0"), { w: 1, x: 0, y: 0, z: 0, b: 0 });
  assert.equal(parseVersion("1.2.3"), null);
  assert.equal(parseVersion("v1.2.3.4-beta"), null);
});

test("commit prefixes pick the part", () => {
  assert.equal(bumpOf("uplift!: new sync protocol"), "w");
  assert.equal(bumpOf("feat!: drop old settings"), "w");
  assert.equal(bumpOf("chore: tidy", "BREAKING: settings file moved"), "w");
  assert.equal(bumpOf("feat(omnibar): calculator"), "x");
  assert.equal(bumpOf("patch: faster OmniBar"), "y");
  assert.equal(bumpOf("perf: cache icons"), "y");
  assert.equal(bumpOf("fix: tray icon"), "z");
  assert.equal(bumpOf("docs: readme"), null);
  assert.equal(bumpOf("Merge pull request #3"), null);
});

test("the biggest bump wins and lower parts reset", () => {
  const commits = [{ subject: "fix: a" }, { subject: "feat: b" }, { subject: "patch: c" }];
  assert.equal(biggestBump(commits), "x");
  assert.equal(biggestBump([{ subject: "docs: only docs" }]), null);
  const last = parseVersion("0.2.1.3+36");
  assert.deepEqual(bumpVersion(last, "x", 40), { w: 0, x: 3, y: 0, z: 0, b: 40 });
  assert.deepEqual(bumpVersion(last, "z", 41), { w: 0, x: 2, y: 1, z: 4, b: 41 });
  assert.deepEqual(bumpVersion(last, "w", 42), { w: 1, x: 0, y: 0, z: 0, b: 42 });
});

test("first feature after nothing is 0.1.0.0", () => {
  const v = bumpVersion({ w: 0, x: 0, y: 0, z: 0, b: 0 }, "x", 12);
  assert.equal(forms(v).tag, "v0.1.0.0+12");
});

test("installer forms pack patch and fix into the third number", () => {
  const f = forms(parseVersion("0.2.1.3+36"));
  assert.deepEqual(f, { display: "0.2.1.3+36", tag: "v0.2.1.3+36", semver: "0.2.103", msi: "0.2.103", build: 36 });
  // Ordering survives packing: 0.2.1.99 < 0.2.2.0
  assert.equal(forms(parseVersion("0.2.1.99")).semver, "0.2.199");
  assert.equal(forms(parseVersion("0.2.2.0")).semver, "0.2.200");
  assert.throws(() => forms(parseVersion("0.2.1.100")), /> 99/);
  assert.throws(() => forms(parseVersion("0.2.655.0")), /> 654/);
});

test("release notes group by kind and drop prefixes", () => {
  const notes = releaseNotes([
    { subject: "fix: tray icon" },
    { subject: "feat(omnibar): calculator" },
    { subject: "docs: readme" },
  ]);
  assert.equal(notes, "### New\n- calculator\n\n### Fixed\n- tray icon");
});

import { describe, expect, it } from "vitest";

import { EditorError } from "./api";
import { createMemoryApi, hashText, PREVIEW_SEED } from "./memoryApi";

const WS = "preview";

describe("the preview's file service", () => {
  it("lists folders first, then files, by name", async () => {
    const api = createMemoryApi(PREVIEW_SEED);
    const root = await api.list(WS, "");
    expect(root.entries.map((e) => [e.name, e.dir])).toEqual([
      ["Config", true],
      ["Data", true],
      ["Projects", true],
      ["README.md", false],
    ]);
  });

  it("saves only against the hash it was read with", async () => {
    const api = createMemoryApi({ "a.md": "one" });
    const doc = await api.read(WS, "a.md");
    await api.save(WS, "a.md", "two", doc.hash);
    const again = await api.read(WS, "a.md");
    expect(again.content).toBe("two");

    const stale = api.save(WS, "a.md", "three", doc.hash);
    await expect(stale).rejects.toBeInstanceOf(EditorError);
    await expect(stale).rejects.toMatchObject({ status: 409, hashOnDisk: hashText("two") });
  });

  it("refuses paths that leave the workspace", async () => {
    const api = createMemoryApi({});
    await expect(api.read(WS, "../secret.md")).rejects.toMatchObject({ status: 403 });
    await expect(api.create(WS, "a\\b.md", "x")).rejects.toMatchObject({ status: 400 });
  });

  it("creates, renames and removes, with folder contents moving along", async () => {
    const api = createMemoryApi({ "notes/a.md": "x" });
    await api.rename(WS, "notes", "archive");
    expect((await api.read(WS, "archive/a.md")).content).toBe("x");
    await expect(api.read(WS, "notes/a.md")).rejects.toMatchObject({ status: 404 });

    await api.create(WS, "archive/b.md", "y");
    await expect(api.create(WS, "archive/b.md", "z")).rejects.toMatchObject({ status: 409 });

    await api.remove(WS, "archive");
    const root = await api.list(WS, "");
    expect(root.entries).toEqual([]);
  });
});

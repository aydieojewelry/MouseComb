// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { createItemCollection } from "./items";
import { previewSnippet, snippetInputSchema } from "./snippets";
import { installMockBackend, type MockBackend } from "./testing/mockBackend";

type Row = { id: string; title: string };

const until = async (check: () => boolean, ms = 2000) => {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > ms) throw new Error("timed out waiting for condition");
    await new Promise((r) => setTimeout(r, 10));
  }
};

let mock: MockBackend | undefined;
afterEach(() => mock?.reset());

function makeCollection(id: string) {
  return createItemCollection<Row>({
    id,
    kind: "snippet",
    getKey: (r) => r.id,
    fromItem: (item) => ({ id: item.key, title: (item.data as { title: string }).title }),
    toData: (r) => ({ title: r.title }),
  });
}

describe("item collections", () => {
  it("loads stored items, then follows local and remote changes", async () => {
    mock = installMockBackend({
      seed: [{ kind: "snippet", key: "a", data: { title: "Seeded" }, mtime: 1, deleted: false, device: "d" }],
    });
    const col = makeCollection("test-1");
    await col.preload();
    expect(col.get("a")?.title).toBe("Seeded");

    // Local insert goes through the Rust command and stays after reload.
    const tx = col.insert({ id: "b", title: "Mine" });
    await tx.isPersisted.promise;
    expect(mock.items("snippet").map((i) => i.key).sort()).toEqual(["a", "b"]);
    expect(col.get("b")?.title).toBe("Mine");

    // A change from another device shows up through the items-changed event.
    mock.putRemote("snippet", "a", { title: "Edited on laptop" });
    await until(() => col.get("a")?.title === "Edited on laptop");

    // Delete removes it from the store and the collection.
    await col.delete("b").isPersisted.promise;
    expect(col.has("b")).toBe(false);
    expect(mock.items("snippet").map((i) => i.key)).toEqual(["a"]);
  });

  it("ignores events for other kinds", async () => {
    mock = installMockBackend();
    const col = makeCollection("test-2");
    await col.preload();
    mock.putRemote("setting", "x", 1);
    await new Promise((r) => setTimeout(r, 50));
    expect(col.size).toBe(0);
  });
});

describe("snippets", () => {
  it("validates input with friendly messages", () => {
    const bad = snippetInputSchema.safeParse({ title: " ", text: "", tags: [] });
    expect(bad.success).toBe(false);
    const messages = bad.error?.issues.map((i) => i.message) ?? [];
    expect(messages).toContain("Give the snippet a name.");
    expect(messages).toContain("Add the text to insert.");
  });

  it("previews tokens", () => {
    const at = new Date(2026, 9, 17, 9, 5, 3);
    expect(previewSnippet("[{TIME}] {DATE} {USER}", at, "aydie")).toBe("[09:05:03] 2026-10-17 aydie");
  });
});

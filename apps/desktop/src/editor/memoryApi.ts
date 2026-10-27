/**
 * An in-memory stand-in for the local service, used in the browser preview and
 * in tests (the same interface as createHttpApi). It keeps the same checks for
 * paths and hashes; it doesn't check frontmatter or status moves, which the
 * real service does.
 */
import { EditorError, type Entry, type EditorApi, type Listing, type Workspace } from "./api";

/** A small, stable hash (FNV-1a). Only needs to change when the content does. */
export function hashText(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

function cleanPath(path: string): string {
  if (path.includes("\\")) throw new EditorError(400, "Use / between folders.");
  const clean = path.replace(/^\/+|\/+$/g, "");
  if (clean.split("/").some((seg) => seg === "..")) throw new EditorError(403, "That path isn't allowed.");
  return clean;
}

export const PREVIEW_WORKSPACE: Workspace = { id: "preview", name: "Example notes", root: "/example" };

export function createMemoryApi(seed: Record<string, string>): EditorApi {
  const files = new Map<string, { content: string; mtime: number }>(
    Object.entries(seed).map(([path, content]) => [path, { content, mtime: Date.now() }]),
  );
  const dirs = new Set<string>();
  for (const path of files.keys()) {
    const parts = path.split("/");
    for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join("/"));
  }
  const workspaces = [PREVIEW_WORKSPACE];

  const exists = (path: string) => files.has(path) || dirs.has(path);

  return {
    async workspaces() {
      return workspaces;
    },
    async addWorkspace(root) {
      const ws: Workspace = { id: `memory-${workspaces.length}`, name: root.split("/").at(-1) ?? root, root };
      workspaces.push(ws);
      return ws;
    },
    async list(_workspace, path): Promise<Listing> {
      const dir = cleanPath(path);
      if (dir !== "" && !dirs.has(dir)) throw new EditorError(404, "That folder doesn't exist any more.");
      const prefix = dir === "" ? "" : `${dir}/`;
      const entries = new Map<string, Entry>();
      for (const folder of dirs) {
        if (!folder.startsWith(prefix) || folder === dir) continue;
        const name = folder.slice(prefix.length).split("/")[0] ?? "";
        if (name !== "") entries.set(name, { name, path: prefix + name, dir: true, link: false, size: 0, mtime: 0 });
      }
      for (const [file, meta] of files) {
        if (!file.startsWith(prefix)) continue;
        const rest = file.slice(prefix.length);
        if (rest.includes("/")) continue;
        entries.set(rest, { name: rest, path: file, dir: false, link: false, size: meta.content.length, mtime: meta.mtime });
      }
      const sorted = [...entries.values()].sort((a, b) =>
        a.dir !== b.dir ? (a.dir ? -1 : 1) : a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
      );
      return { path: dir, entries: sorted, truncated: false };
    },
    async read(_workspace, path) {
      const clean = cleanPath(path);
      const file = files.get(clean);
      if (!file) throw new EditorError(404, "That file doesn't exist any more.");
      return { path: clean, content: file.content, hash: hashText(file.content), size: file.content.length, mtime: file.mtime, binary: false };
    },
    async save(_workspace, path, content, expectedHash) {
      const clean = cleanPath(path);
      const file = files.get(clean);
      if (!file) throw new EditorError(409, "This file was deleted or renamed since you opened it.", { hash: "" });
      const onDisk = hashText(file.content);
      if (onDisk !== expectedHash) {
        throw new EditorError(409, "This file changed on disk since you opened it. Reload it, or save as a new file.", { hash: onDisk });
      }
      files.set(clean, { content, mtime: Date.now() });
      return { path: clean, hash: hashText(content), size: content.length, mtime: Date.now() };
    },
    async create(_workspace, path, content) {
      const clean = cleanPath(path);
      if (exists(clean)) throw new EditorError(409, "A file or folder with that name already exists.");
      files.set(clean, { content, mtime: Date.now() });
      const parts = clean.split("/");
      for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join("/"));
      return { path: clean, hash: hashText(content), size: content.length, mtime: Date.now() };
    },
    async mkdir(_workspace, path) {
      const clean = cleanPath(path);
      if (exists(clean)) throw new EditorError(409, "A file or folder with that name already exists.");
      dirs.add(clean);
    },
    async rename(_workspace, from, to) {
      const src = cleanPath(from);
      const dst = cleanPath(to);
      if (!exists(src)) throw new EditorError(404, "That file or folder doesn't exist any more.");
      if (exists(dst)) throw new EditorError(409, "A file or folder with the new name already exists.");
      for (const [key, value] of [...files]) {
        if (key === src || key.startsWith(`${src}/`)) {
          files.delete(key);
          files.set(dst + key.slice(src.length), value);
        }
      }
      for (const folder of [...dirs]) {
        if (folder === src || folder.startsWith(`${src}/`)) {
          dirs.delete(folder);
          dirs.add(dst + folder.slice(src.length));
        }
      }
    },
    async remove(_workspace, path) {
      const clean = cleanPath(path);
      if (clean === "") throw new EditorError(400, "The workspace folder itself can't be deleted here.");
      if (!exists(clean)) throw new EditorError(404, "That file or folder doesn't exist any more.");
      for (const key of [...files.keys()]) if (key === clean || key.startsWith(`${clean}/`)) files.delete(key);
      for (const folder of [...dirs]) if (folder === clean || folder.startsWith(`${clean}/`)) dirs.delete(folder);
    },
  };
}

/** What the preview shows: a few files of each kind the editor handles. */
export const PREVIEW_SEED: Record<string, string> = {
  "README.md": "# Example notes\n\nOpen a file on the left. Save with Ctrl+S.\n",
  "Projects/launch.md":
    "---\ntitle: Launch plan\nstatus: draft\ntags: [launch]\n---\n\n# Launch plan\n\n- [ ] write the notes\n- [x] pick a date\n",
  "Data/prices.csv": "item,price,note\nCoffee,2.50,\"fair trade, medium\"\nTea,1.80,\n",
  "Config/app.toml": '# app settings\ntitle = "Mouse Comb"   # shown in the header\nretries = 3\ndebug = false\n\n[server]\nhost = "localhost"\n',
  "Config/app.ini": "; desktop settings\n[general]\nname = Mouse Comb\n\n[paths]\ncache: /tmp/cache\n",
};

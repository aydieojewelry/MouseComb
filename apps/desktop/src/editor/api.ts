/**
 * The editor's calls to the local service (services/mc-local, FEAT-030). The
 * app gives the window a port and a token for this run; the token goes on
 * every request as a header, never in a URL.
 */

export type Workspace = { id: string; name: string; root: string };
export type Entry = { name: string; path: string; dir: boolean; link: boolean; size: number; mtime: number };
export type Listing = { path: string; entries: Entry[]; truncated: boolean };
export type Doc = { path: string; content: string; hash: string; size: number; mtime: number; binary: boolean };
export type Meta = { path: string; hash: string; size: number; mtime: number };
export type Problem = { path: string; message: string };

/** An error from the service: the status, the sentence to show, and any data (problems, the hash on disk). */
export class EditorError extends Error {
  readonly status: number;
  readonly data: Record<string, unknown>;

  constructor(status: number, message: string, data: Record<string, unknown> = {}) {
    super(message);
    this.name = "EditorError";
    this.status = status;
    this.data = data;
  }

  get problems(): Problem[] {
    const problems = this.data.problems;
    return Array.isArray(problems) ? (problems as Problem[]) : [];
  }

  /** On a 409 conflict: the hash of the file as it is on disk now. */
  get hashOnDisk(): string | undefined {
    return typeof this.data.hash === "string" ? this.data.hash : undefined;
  }
}

export interface EditorApi {
  workspaces(): Promise<Workspace[]>;
  addWorkspace(root: string): Promise<Workspace>;
  list(workspace: string, path: string): Promise<Listing>;
  read(workspace: string, path: string): Promise<Doc>;
  save(workspace: string, path: string, content: string, expectedHash: string): Promise<Meta & { warning?: string }>;
  create(workspace: string, path: string, content: string): Promise<Meta>;
  mkdir(workspace: string, path: string): Promise<void>;
  rename(workspace: string, from: string, to: string): Promise<void>;
  remove(workspace: string, path: string): Promise<void>;
}

export function createHttpApi(port: number, token: string): EditorApi {
  const base = `http://127.0.0.1:${port}/api/mc`;

  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { "X-MC-Token": token };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const res = await fetch(base + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.status === 204) return undefined as T;
    const json = (await res.json().catch(() => ({}))) as { message?: string; data?: Record<string, unknown> };
    if (!res.ok) {
      throw new EditorError(res.status, json.message ?? `The editor's service answered ${res.status}.`, json.data ?? {});
    }
    return json as T;
  }

  const query = (params: Record<string, string>) => `?${new URLSearchParams(params).toString()}`;

  return {
    workspaces: () => call<Workspace[]>("GET", "/workspaces"),
    addWorkspace: (root) => call<Workspace>("POST", "/workspaces", { path: root }),
    list: (workspace, path) => call<Listing>("GET", `/tree${query({ workspace, path })}`),
    read: (workspace, path) => call<Doc>("GET", `/file${query({ workspace, path })}`),
    save: (workspace, path, content, expectedHash) =>
      call("PUT", "/file", { workspace, path, content, expected_hash: expectedHash }),
    create: (workspace, path, content) => call<Meta>("POST", "/fs/create", { workspace, path, content }),
    mkdir: (workspace, path) => call<void>("POST", "/fs/mkdir", { workspace, path }),
    rename: (workspace, from, to) => call<void>("POST", "/fs/rename", { workspace, from, to }),
    remove: (workspace, path) => call<void>("POST", "/fs/delete", { workspace, path }),
  };
}

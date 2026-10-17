/**
 * An in-memory stand-in for the Rust commands and events, for tests and for
 * previewing the UI in a plain browser (`pnpm --filter @mousecomb/desktop dev`
 * outside Tauri). Never shipped in the app.
 */
import type { Account, AppInfo, CommandError, Item, SyncStatus } from "@mousecomb/bindings";
import { emit } from "@tauri-apps/api/event";
import { clearMocks, mockIPC, mockWindows } from "@tauri-apps/api/mocks";

type Args = Record<string, unknown>;

export type MockBackend = {
  /** Simulate a change arriving from another device. */
  putRemote(kind: string, key: string, data: unknown): void;
  items(kind: string): Item[];
  reset(): void;
};

const fail = (code: CommandError["code"], message: string): never => {
  throw { code, message } satisfies CommandError;
};

export function installMockBackend(options: { seed?: Item[]; account?: Account | null } = {}): MockBackend {
  const items = new Map<string, Item>();
  const local = new Map<string, unknown>();
  let account: Account | null = options.account ?? null;
  let autostart = false;
  let mtime = Date.now();
  let status: SyncStatus = {
    state: account ? "idle" : "signed_out",
    last_synced_at: account ? Date.now() - 120_000 : null,
    message: null,
    pending: 0,
  };

  const id = (kind: string, key: string) => `${kind}\u0000${key}`;
  const changed = (kind: string) => void emit("items-changed", { kind });
  const setStatus = (next: Partial<SyncStatus>) => {
    status = { ...status, ...next };
    void emit("sync-status-changed", status);
  };
  const put = (kind: string, key: string, data: unknown, device = "dev_mock") => {
    mtime = Math.max(Date.now(), mtime + 1);
    const item: Item = { kind, key, data, mtime, deleted: false, device };
    items.set(id(kind, key), item);
    changed(kind);
    return item;
  };

  for (const item of options.seed ?? []) items.set(id(item.kind, item.key), item);

  mockWindows("main");
  mockIPC(
    async (cmd, raw) => {
      const args = (raw ?? {}) as Args;
      switch (cmd) {
        case "items_list":
          return [...items.values()]
            .filter((i) => i.kind === args.kind && !i.deleted)
            .sort((a, b) => b.mtime - a.mtime);
        case "item_put":
          if (typeof args.key !== "string" || !args.key) return fail("validation", "Item keys must be 1 to 255 characters.");
          return put(String(args.kind), args.key, args.data);
        case "item_delete": {
          const existing = items.get(id(String(args.kind), String(args.key)));
          if (existing) {
            items.set(id(existing.kind, existing.key), { ...existing, deleted: true, data: null, mtime: Date.now() });
            changed(existing.kind);
          }
          return null;
        }
        case "item_new_key":
          return Math.random().toString(36).slice(2, 17).padEnd(15, "0");
        case "local_setting_get":
          return local.get(String(args.key)) ?? null;
        case "local_setting_set":
          local.set(String(args.key), args.value);
          changed("local_setting");
          return null;
        case "server_url_get":
          return (local.get("sync.server_url") as string | undefined) ?? "http://127.0.0.1:8090";
        case "server_url_set":
          if (!/^https?:\/\//.test(String(args.url))) return fail("validation", "The server address must start with https://");
          local.set("sync.server_url", String(args.url).replace(/\/+$/, ""));
          return null;
        case "account_get":
          return account;
        case "account_sign_in":
        case "account_sign_up": {
          const email = String(args.email).trim();
          const password = String(args.password);
          if (cmd === "account_sign_in" && password === "wrong-password") return fail("invalid_credentials", "Email or password is incorrect.");
          if (password.length < 8) return fail("validation", "Password: Must be at least 8 character(s).");
          account = { backend_url: "http://127.0.0.1:8090", user_id: "mockuser0000001", email };
          void emit("account-changed", { account });
          setStatus({ state: "idle", last_synced_at: Date.now(), message: null });
          return account;
        }
        case "account_sign_out":
          account = null;
          if (args.keepData === false) {
            const kinds = new Set([...items.values()].map((i) => i.kind));
            items.clear();
            kinds.forEach(changed);
          }
          void emit("account-changed", { account: null });
          setStatus({ state: "signed_out", message: null });
          return null;
        case "sync_status_get":
          return status;
        case "sync_now":
          if (!account) return fail("signed_out", "Sign in to sync.");
          setStatus({ state: "syncing" });
          await new Promise((r) => setTimeout(r, 400));
          setStatus({ state: "idle", last_synced_at: Date.now(), pending: 0 });
          return { pulled: 0, pushed: 0, stale: 0 };
        case "app_info":
          return { version: "0.0.0", device_id: "dev_mock", data_dir: "C:\\Users\\you\\AppData\\Roaming\\com.mousecomb.app" } satisfies AppInfo;
        case "plugin:autostart|is_enabled":
          return autostart;
        case "plugin:autostart|enable":
          autostart = true;
          return null;
        case "plugin:autostart|disable":
          autostart = false;
          return null;
        default:
          throw new Error(`mock backend: unknown command ${cmd}`);
      }
    },
    { shouldMockEvents: true },
  );

  return {
    putRemote: (kind, key, data) => void put(kind, key, data, "dev_other_pc"),
    items: (kind) => [...items.values()].filter((i) => i.kind === kind && !i.deleted),
    reset: () => clearMocks(),
  };
}

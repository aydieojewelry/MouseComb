/**
 * An in-memory stand-in for the Rust commands and events, for tests and for
 * previewing the UI in a plain browser (`pnpm --filter @mousecomb/desktop dev`
 * outside Tauri). Never shipped in the app.
 */
import type {
  Account,
  ActionResult,
  App,
  AppInfo,
  Command,
  CommandError,
  HotkeyStatus,
  Item,
  Pomodoro,
  SyncStatus,
  UpdateStatus,
} from "@mousecomb/bindings";
import { emit } from "@tauri-apps/api/event";
import { clearMocks, mockIPC, mockWindows } from "@tauri-apps/api/mocks";

type Args = Record<string, unknown>;

export type MockBackend = {
  /** Simulate a change arriving from another device. */
  putRemote(kind: string, key: string, data: unknown): void;
  items(kind: string): Item[];
  localSetting(key: string): unknown;
  reset(): void;
};

const fail = (code: CommandError["code"], message: string): never => {
  throw { code, message } satisfies CommandError;
};

const cmd = (key: string, action: string, args: unknown, title: string, hint: string, keywords: string[], group: Command["group"], confirm = false): Command => ({
  key,
  action,
  with: args,
  title,
  hint,
  keywords,
  group,
  confirm,
});

/** A slice of `mc_core::actions::catalog()`, enough to exercise every kind of entry. */
const CATALOG: Command[] = [
  cmd("mc.settings.open", "mc.settings.open", {}, "Open Settings", "MouseComb", ["preferences", "options"], "mouse_comb"),
  cmd("mc.settings.open:general", "mc.settings.open", { page: "general" }, "General settings", "MouseComb settings", ["hotkey", "clock"], "mouse_comb"),
  cmd("mc.settings.open:pomodoro", "mc.settings.open", { page: "pomodoro" }, "Pomodoro settings", "MouseComb settings", ["timer", "focus"], "mouse_comb"),
  cmd("mc.settings.open:snippets", "mc.settings.open", { page: "snippets" }, "Snippets", "MouseComb settings", ["text"], "mouse_comb"),
  cmd("mc.settings.open:account", "mc.settings.open", { page: "account" }, "Account & sync", "MouseComb settings", ["sign in", "login"], "mouse_comb"),
  cmd("mc.settings.open:about", "mc.settings.open", { page: "about" }, "About MouseComb", "MouseComb settings", ["version"], "mouse_comb"),
  cmd("mc.sync.now", "mc.sync.now", null, "Sync now", "MouseComb", ["refresh"], "mouse_comb"),
  cmd("mc.update.check", "mc.update.check", null, "Check for updates", "MouseComb", ["upgrade"], "mouse_comb"),
  cmd("setting.toggle:hud.enabled", "setting.toggle", { key: "hud.enabled" }, "Show or hide the clock", "HUD", ["hud", "clock"], "mouse_comb"),
  cmd("mc.quit", "mc.quit", null, "Quit MouseComb", "MouseComb", ["exit"], "mouse_comb"),
  cmd("ext.mc.pomodoro.toggle", "ext.mc.pomodoro.toggle", null, "Start or pause Pomodoro", "Pomodoro", ["timer", "focus"], "pomodoro"),
  cmd("ext.mc.pomodoro.skip", "ext.mc.pomodoro.skip", null, "Skip to the next Pomodoro phase", "Pomodoro", ["break"], "pomodoro"),
  cmd("ext.mc.pomodoro.reset", "ext.mc.pomodoro.reset", null, "Reset Pomodoro", "Pomodoro", ["stop"], "pomodoro"),
  cmd("core.os.settings.open:display", "core.os.settings.open", { page: "display" }, "Display settings", "Windows Settings", ["screen"], "windows"),
  cmd("core.os.settings.open:bluetooth", "core.os.settings.open", { page: "bluetooth" }, "Bluetooth & devices", "Windows Settings", ["pair"], "windows"),
  cmd("core.os.power.lock", "core.os.power.lock", null, "Lock screen", "Windows", ["lock"], "windows"),
  cmd("core.os.power.restart", "core.os.power.restart", null, "Restart", "Windows", ["reboot"], "windows", true),
  cmd("core.os.power.shut_down", "core.os.power.shut_down", null, "Shut down", "Windows", ["power off"], "windows", true),
];

const EXAMPLE_APPS: App[] = [
  { name: "Calculator", id: "Microsoft.WindowsCalculator_8wekyb3d8bbwe!App" },
  { name: "File Explorer", id: "Microsoft.Windows.Explorer" },
  { name: "Notepad", id: "Microsoft.WindowsNotepad_8wekyb3d8bbwe!App" },
  { name: "Spotify", id: "SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify" },
  { name: "Visual Studio Code", id: "Microsoft.VisualStudioCode" },
  { name: "Windows Terminal", id: "Microsoft.WindowsTerminal_8wekyb3d8bbwe!App" },
];

const MINUTE = 60_000;

export function installMockBackend(options: { seed?: Item[]; account?: Account | null; apps?: App[] } = {}): MockBackend {
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

  let pomodoro: Pomodoro = {
    phase: "focus",
    running: false,
    ends_at: null,
    remaining_ms: 25 * MINUTE,
    total_ms: 25 * MINUTE,
    completed: 0,
    fresh: true,
    started_at: null,
  };
  const update: UpdateStatus = {
    state: "up_to_date",
    version: null,
    notes: null,
    progress: null,
    checked_at: Date.now() - 3_600_000,
    message: null,
  };
  const hotkey: HotkeyStatus = { hotkey: "Alt+Space", registered: true, message: null };
  const apps = options.apps ?? EXAMPLE_APPS;

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

  const setPomodoro = (next: Partial<Pomodoro>) => {
    pomodoro = { ...pomodoro, ...next };
    void emit("pomodoro-changed", pomodoro);
  };
  const runAction = (action: string, args: Record<string, unknown>, confirmed: boolean): ActionResult => {
    const confirm = CATALOG.find((c) => c.action === action)?.confirm ?? false;
    if (confirm && !confirmed) return fail("validation", "Confirm this action first.");
    const now = Date.now();
    switch (action) {
      case "ext.mc.pomodoro.toggle":
        if (pomodoro.running) {
          setPomodoro({ running: false, ends_at: null, remaining_ms: Math.max(0, (pomodoro.ends_at ?? now) - now) });
          return { message: "Focus paused" };
        }
        setPomodoro({ running: true, fresh: false, ends_at: now + pomodoro.remaining_ms, started_at: pomodoro.started_at ?? now });
        return { message: "Focus started" };
      case "ext.mc.pomodoro.reset":
        setPomodoro({ phase: "focus", running: false, ends_at: null, remaining_ms: 25 * MINUTE, total_ms: 25 * MINUTE, completed: 0, fresh: true, started_at: null });
        return { message: "Pomodoro reset" };
      case "ext.mc.pomodoro.skip": {
        const phase = pomodoro.phase === "focus" ? "short_break" : "focus";
        const total = (phase === "focus" ? 25 : 5) * MINUTE;
        setPomodoro({ phase, total_ms: total, remaining_ms: total, ends_at: pomodoro.running ? now + total : null, fresh: !pomodoro.running });
        return { message: `${phase === "focus" ? "Focus" : "Short break"} ${pomodoro.running ? "started" : "paused"}` };
      }
      case "setting.toggle": {
        const key = String(args.key);
        const current = items.get(id("setting", key));
        put("setting", key, !(current && !current.deleted ? current.data !== false : key === "hud.enabled"));
        return { message: null };
      }
      case "core.os.clipboard.set_text":
      case "ext.mc.snippets.copy":
        return { message: "Copied" };
      case "mc.update.check":
        return { message: "MouseComb is up to date" };
      default:
        if (!CATALOG.some((c) => c.action === action) && !["core.os.apps.launch", "core.os.shell.open_url", "mc.omnibar.open"].includes(action)) {
          return fail("validation", `There's no action called ${action}.`);
        }
        return { message: null };
    }
  };

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
        case "account_request_password_reset":
          if (!String(args.email).includes("@")) return fail("validation", "Enter the email you signed up with.");
          return null;
        case "commands_list":
          return CATALOG;
        case "apps_list":
          return apps;
        case "pomodoro_get":
          return pomodoro;
        case "update_status_get":
          return update;
        case "hotkey_status_get":
          return hotkey;
        case "omnibar_hide":
          return null;
        case "action_run":
          return runAction(String(args.action), (args.args ?? {}) as Record<string, unknown>, Boolean(args.confirmed));
        case "app_info":
          return { version: "0.0.0.0+0", device_id: "dev_mock", data_dir: "C:\\Users\\you\\AppData\\Roaming\\com.mousecomb.app" } satisfies AppInfo;
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
    localSetting: (key) => local.get(key),
    items: (kind) => [...items.values()].filter((i) => i.kind === kind && !i.deleted),
    reset: () => clearMocks(),
  };
}

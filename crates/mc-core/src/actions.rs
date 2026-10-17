//! Action ids and the commands the OmniBar lists (FEAT-013, FEAT-004, FEAT-023).
//!
//! An action is anything MouseComb can do, named by a stable id. The desktop
//! runs them; this crate only describes them, so the phone and extensions see
//! the same list. M1 ships the actions the OmniBar needs; the full native
//! catalog arrives with the engine in M3.

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

/// Every action id the desktop can run today.
pub mod id {
    pub const OMNIBAR_OPEN: &str = "mc.omnibar.open";
    pub const SETTINGS_OPEN: &str = "mc.settings.open";
    pub const SYNC_NOW: &str = "mc.sync.now";
    pub const UPDATE_CHECK: &str = "mc.update.check";
    pub const UPDATE_INSTALL: &str = "mc.update.install";
    pub const QUIT: &str = "mc.quit";
    pub const SETTING_TOGGLE: &str = "setting.toggle";
    pub const POMODORO_START: &str = "ext.mc.pomodoro.start";
    pub const POMODORO_PAUSE: &str = "ext.mc.pomodoro.pause";
    pub const POMODORO_TOGGLE: &str = "ext.mc.pomodoro.toggle";
    pub const POMODORO_SKIP: &str = "ext.mc.pomodoro.skip";
    pub const POMODORO_RESET: &str = "ext.mc.pomodoro.reset";
    pub const SNIPPET_COPY: &str = "ext.mc.snippets.copy";
    pub const APP_LAUNCH: &str = "core.os.apps.launch";
    pub const OPEN_URL: &str = "core.os.shell.open_url";
    pub const CLIPBOARD_SET: &str = "core.os.clipboard.set_text";
    pub const WINDOWS_SETTINGS: &str = "core.os.settings.open";
    pub const LOCK: &str = "core.os.power.lock";
    pub const SLEEP: &str = "core.os.power.sleep";
    pub const SIGN_OUT: &str = "core.os.power.sign_out";
    pub const RESTART: &str = "core.os.power.restart";
    pub const SHUT_DOWN: &str = "core.os.power.shut_down";
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "specta", derive(specta::Type))]
#[serde(rename_all = "snake_case")]
pub enum CommandGroup {
    MouseComb,
    Pomodoro,
    Windows,
}

/// One OmniBar entry: an action with fixed arguments and the words that find it.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "specta", derive(specta::Type))]
pub struct Command {
    /// Unique per entry, e.g. `mc.settings.open:pomodoro`.
    pub key: String,
    pub action: String,
    #[cfg_attr(feature = "specta", specta(type = specta_typescript::Unknown))]
    pub with: Value,
    pub title: String,
    pub hint: String,
    pub keywords: Vec<String>,
    pub group: CommandGroup,
    /// Destructive: the OmniBar asks for a second Enter.
    pub confirm: bool,
}

fn command(action: &str, with: Value, title: &str, hint: &str, keywords: &[&str], group: CommandGroup) -> Command {
    let suffix = with.get("page").or_else(|| with.get("key")).and_then(Value::as_str);
    Command {
        key: suffix.map_or_else(|| action.to_owned(), |s| format!("{action}:{s}")),
        action: action.to_owned(),
        with,
        title: title.to_owned(),
        hint: hint.to_owned(),
        keywords: keywords.iter().map(|k| (*k).to_owned()).collect(),
        group,
        confirm: false,
    }
}

/// Settings pages the OmniBar can open (routes in `apps/desktop`).
pub const SETTINGS_PAGES: &[(&str, &str, &[&str])] = &[
    ("general", "General settings", &["preferences", "options", "hotkey", "startup", "clock", "hud"]),
    ("pomodoro", "Pomodoro settings", &["durations", "break length", "stats"]),
    ("snippets", "Snippets", &["text", "templates", "expand"]),
    ("account", "Account & sync", &["sign in", "login", "log in", "sign out", "sync", "server"]),
    ("about", "About MouseComb", &["version", "updates", "help"]),
];

/// Windows Settings pages offered in M1 (`ms-settings:` URIs).
pub const WINDOWS_SETTINGS_PAGES: &[(&str, &str, &[&str])] = &[
    ("display", "Display settings", &["screen", "resolution", "brightness", "night light", "scale"]),
    ("sound", "Sound settings", &["audio", "volume", "speakers", "microphone"]),
    ("bluetooth", "Bluetooth & devices", &["devices", "pair", "mouse", "headphones"]),
    ("network-wifi", "Wi-Fi settings", &["wifi", "wireless", "internet", "network"]),
    ("windowsupdate", "Windows Update", &["updates", "patch"]),
    ("appsfeatures", "Installed apps", &["uninstall", "programs", "apps"]),
    ("personalization-background", "Background & wallpaper", &["personalize", "wallpaper", "theme"]),
    ("powersleep", "Power & battery", &["battery", "sleep", "power plan"]),
];

/// Everything the OmniBar lists besides apps, snippets and typed-in results.
pub fn catalog() -> Vec<Command> {
    use CommandGroup::*;
    let mut out = vec![command(
        id::SETTINGS_OPEN,
        json!({}),
        "Open Settings",
        "MouseComb",
        &["preferences", "config", "options"],
        MouseComb,
    )];
    for (page, title, words) in SETTINGS_PAGES {
        out.push(command(id::SETTINGS_OPEN, json!({ "page": page }), title, "MouseComb settings", words, MouseComb));
    }
    out.extend([
        command(id::SYNC_NOW, Value::Null, "Sync now", "MouseComb", &["refresh", "upload", "cloud"], MouseComb),
        command(
            id::UPDATE_CHECK,
            Value::Null,
            "Check for updates",
            "MouseComb",
            &["upgrade", "version", "new"],
            MouseComb,
        ),
        command(
            id::SETTING_TOGGLE,
            json!({ "key": "hud.enabled" }),
            "Show or hide the clock",
            "HUD",
            &["hud", "clock", "time", "overlay"],
            MouseComb,
        ),
        command(id::QUIT, Value::Null, "Quit MouseComb", "MouseComb", &["exit", "close"], MouseComb),
        command(
            id::POMODORO_TOGGLE,
            Value::Null,
            "Start or pause Pomodoro",
            "Pomodoro",
            &["timer", "focus", "tomato"],
            Pomodoro,
        ),
        command(
            id::POMODORO_SKIP,
            Value::Null,
            "Skip to the next Pomodoro phase",
            "Pomodoro",
            &["break", "next", "timer"],
            Pomodoro,
        ),
        command(id::POMODORO_RESET, Value::Null, "Reset Pomodoro", "Pomodoro", &["stop", "timer", "restart"], Pomodoro),
    ]);
    for (page, title, words) in WINDOWS_SETTINGS_PAGES {
        out.push(command(id::WINDOWS_SETTINGS, json!({ "page": page }), title, "Windows Settings", words, Windows));
    }
    let power: [(&str, &str, &[&str], bool); 5] = [
        (id::LOCK, "Lock screen", &["lock", "away", "secure"], false),
        (id::SLEEP, "Sleep", &["suspend", "standby"], true),
        (id::SIGN_OUT, "Sign out of Windows", &["log off", "logout", "log out"], true),
        (id::RESTART, "Restart", &["reboot"], true),
        (id::SHUT_DOWN, "Shut down", &["power off", "turn off", "shutdown"], true),
    ];
    for (action, title, words, confirm) in power {
        let mut c = command(action, Value::Null, title, "Windows", words, Windows);
        c.confirm = confirm;
        out.push(c);
    }
    out
}

/// Does this action exist? Anything else is rejected before it runs.
pub fn is_known(action: &str) -> bool {
    action == id::OMNIBAR_OPEN
        || action == id::UPDATE_INSTALL
        || action == id::POMODORO_START
        || action == id::POMODORO_PAUSE
        || action == id::SNIPPET_COPY
        || action == id::APP_LAUNCH
        || action == id::OPEN_URL
        || action == id::CLIPBOARD_SET
        || catalog().iter().any(|c| c.action == action)
}

/// The fixed parts of a `ms-settings:` URI; anything else is refused.
pub fn windows_settings_uri(page: &str) -> Option<String> {
    WINDOWS_SETTINGS_PAGES.iter().any(|(p, _, _)| *p == page).then(|| format!("ms-settings:{page}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    #[test]
    fn catalog_keys_are_unique_and_actions_known() {
        let all = catalog();
        let keys: HashSet<_> = all.iter().map(|c| c.key.as_str()).collect();
        assert_eq!(keys.len(), all.len());
        assert!(all.iter().all(|c| is_known(&c.action)));
        assert!(!is_known("core.os.windows.maximize"), "window actions were removed (DEC-007)");
    }

    #[test]
    fn only_lock_skips_confirmation_among_power_actions() {
        let power: Vec<_> = catalog().into_iter().filter(|c| c.action.starts_with("core.os.power.")).collect();
        assert_eq!(power.len(), 5);
        assert!(power.iter().all(|c| c.confirm == (c.action != id::LOCK)));
    }

    #[test]
    fn windows_settings_pages_are_an_allow_list() {
        assert_eq!(windows_settings_uri("display").as_deref(), Some("ms-settings:display"));
        assert_eq!(windows_settings_uri("../../evil"), None);
    }
}

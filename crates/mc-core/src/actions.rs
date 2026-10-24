//! Action ids and the commands the OmniBar lists (FEAT-013, FEAT-004, FEAT-023).
//!
//! An action is anything MouseComb can do, named by a stable id. The desktop
//! runs them; this crate only describes them, so the phone and extensions see
//! the same list. M1 ships the actions the OmniBar needs; the full native
//! catalog arrives with the engine in M3.

use std::sync::LazyLock;

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

/// Every action id the desktop can run today.
pub mod id {
    pub const OMNIBAR_OPEN: &str = "mc.omnibar.open";
    pub const SETTINGS_OPEN: &str = "mc.settings.open";
    pub const EDITOR_OPEN: &str = "mc.editor.open";
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
    pub const POMODORO_EXTEND: &str = "ext.mc.pomodoro.extend";
    pub const SNIPPET_COPY: &str = "ext.mc.snippets.copy";
    pub const SNIPPET_TYPE: &str = "ext.mc.snippets.type";
    pub const INPUT_TOGGLE: &str = "mc.input.toggle";
    pub const INPUT_SEND: &str = "core.os.input.send";
    pub const VOLUME_UP: &str = "core.os.audio.volume_up";
    pub const VOLUME_DOWN: &str = "core.os.audio.volume_down";
    pub const VOLUME_MUTE: &str = "core.os.audio.mute";
    pub const MEDIA_PLAY_PAUSE: &str = "core.os.media.play_pause";
    pub const MEDIA_NEXT: &str = "core.os.media.next";
    pub const MEDIA_PREV: &str = "core.os.media.prev";
    pub const DESKTOP_NEXT: &str = "core.os.desktops.next";
    pub const DESKTOP_PREV: &str = "core.os.desktops.prev";
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
    let suffix = ["page", "key", "view"].iter().find_map(|name| with.get(name)).and_then(Value::as_str);
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
    (
        "bindings",
        "Bindings, hotkeys and gestures",
        &["shortcut", "keyboard", "hyper", "capslock", "mouse", "gesture", "hotkey"],
    ),
    ("snippets", "Snippets", &["text", "templates", "expand"]),
    ("account", "Account & sync", &["sign in", "login", "log in", "sign out", "sync", "server"]),
    ("whats-new", "What's new", &["changelog", "release notes", "changes", "version"]),
    ("about", "About MouseComb", &["version", "updates", "help"]),
];

/// Views the OmniBar can open on instead of its result list (`mc.omnibar.open` with `view`).
pub const OMNIBAR_VIEWS: &[&str] = &["pomodoro"];

/// How much "+5 min" adds when an action doesn't say (`ext.mc.pomodoro.extend`).
pub const DEFAULT_EXTEND_MIN: u32 = 5;

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
/// Built once; the action runner looks actions up here on every run.
pub fn catalog() -> &'static [Command] {
    static CATALOG: LazyLock<Vec<Command>> = LazyLock::new(build_catalog);
    &CATALOG
}

fn build_catalog() -> Vec<Command> {
    use CommandGroup::*;
    let mut out = vec![command(
        id::SETTINGS_OPEN,
        json!({}),
        "Open Settings",
        "MouseComb",
        &["preferences", "config", "options"],
        MouseComb,
    )];
    out.push(command(
        id::EDITOR_OPEN,
        Value::Null,
        "Open Editor",
        "MouseComb",
        &["files", "markdown", "csv", "toml", "notes", "explorer"],
        MouseComb,
    ));
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
        command(
            id::INPUT_TOGGLE,
            Value::Null,
            "Turn hotkeys and gestures on or off",
            "MouseComb",
            &["input", "pause", "bindings", "gestures", "panic"],
            MouseComb,
        ),
        command(id::QUIT, Value::Null, "Quit MouseComb", "MouseComb", &["exit", "close"], MouseComb),
        command(
            id::OMNIBAR_OPEN,
            json!({ "view": "pomodoro" }),
            "Pomodoro timer",
            "Pomodoro",
            &["timer", "focus", "tomato", "countdown", "dial"],
            Pomodoro,
        ),
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
        command(
            id::POMODORO_EXTEND,
            Value::Null,
            "Add 5 minutes to Pomodoro",
            "Pomodoro",
            &["more time", "extend", "longer", "snooze"],
            Pomodoro,
        ),
        command(id::POMODORO_RESET, Value::Null, "Reset Pomodoro", "Pomodoro", &["stop", "timer", "restart"], Pomodoro),
    ]);
    for (page, title, words) in WINDOWS_SETTINGS_PAGES {
        out.push(command(id::WINDOWS_SETTINGS, json!({ "page": page }), title, "Windows Settings", words, Windows));
    }
    let keys: [(&str, &str, &[&str]); 8] = [
        (id::VOLUME_UP, "Volume up", &["louder", "sound", "audio"]),
        (id::VOLUME_DOWN, "Volume down", &["quieter", "sound", "audio"]),
        (id::VOLUME_MUTE, "Mute or unmute", &["silence", "sound", "audio"]),
        (id::MEDIA_PLAY_PAUSE, "Play or pause media", &["music", "spotify", "video"]),
        (id::MEDIA_NEXT, "Next track", &["music", "skip", "song"]),
        (id::MEDIA_PREV, "Previous track", &["music", "back", "song"]),
        (id::DESKTOP_NEXT, "Next virtual desktop", &["workspace", "switch"]),
        (id::DESKTOP_PREV, "Previous virtual desktop", &["workspace", "switch"]),
    ];
    for (action, title, words) in keys {
        out.push(command(action, Value::Null, title, "Windows", words, Windows));
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

/// Actions that run but have no OmniBar entry of their own (they take
/// arguments, like an app id, or appear only in some states).
const UNLISTED: &[&str] = &[
    id::UPDATE_INSTALL,
    id::POMODORO_START,
    id::POMODORO_PAUSE,
    id::SNIPPET_COPY,
    id::SNIPPET_TYPE,
    id::INPUT_SEND,
    id::APP_LAUNCH,
    id::OPEN_URL,
    id::CLIPBOARD_SET,
];

/// Does this action exist? Anything else is rejected before it runs.
pub fn is_known(action: &str) -> bool {
    UNLISTED.contains(&action) || catalog().iter().any(|c| c.action == action)
}

/// Destructive actions run only with `confirmed` (APP_SPEC §8).
pub fn needs_confirmation(action: &str) -> bool {
    catalog().iter().any(|c| c.action == action && c.confirm)
}

/// Only `http(s)` addresses are opened or used as servers.
pub fn is_web_url(url: &str) -> bool {
    url.starts_with("https://") || url.starts_with("http://")
}

/// The key combination an action presses for you, in binding notation.
pub fn keys_for(action: &str) -> Option<&'static str> {
    Some(match action {
        id::VOLUME_UP => "AudioVolumeUp",
        id::VOLUME_DOWN => "AudioVolumeDown",
        id::VOLUME_MUTE => "AudioVolumeMute",
        id::MEDIA_PLAY_PAUSE => "MediaPlayPause",
        id::MEDIA_NEXT => "MediaTrackNext",
        id::MEDIA_PREV => "MediaTrackPrevious",
        id::DESKTOP_NEXT => "Ctrl+Super+ArrowRight",
        id::DESKTOP_PREV => "Ctrl+Super+ArrowLeft",
        _ => return None,
    })
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
        let power: Vec<_> = catalog().iter().filter(|c| c.action.starts_with("core.os.power.")).collect();
        assert_eq!(power.len(), 5);
        assert!(power.iter().all(|c| c.confirm == (c.action != id::LOCK)));
        assert!(needs_confirmation(id::RESTART) && !needs_confirmation(id::LOCK));
    }

    #[test]
    fn the_pomodoro_timer_opens_inside_the_omnibar() {
        let timer = catalog().iter().find(|c| c.key == "mc.omnibar.open:pomodoro").expect("listed");
        assert_eq!(timer.with["view"], "pomodoro");
        assert!(OMNIBAR_VIEWS.contains(&"pomodoro"));
        assert!(is_known(id::OMNIBAR_OPEN) && is_known(id::POMODORO_EXTEND));
    }

    #[test]
    fn key_actions_press_real_keys() {
        for c in catalog() {
            if let Some(keys) = keys_for(&c.action) {
                assert!(crate::input::combo_vks(keys).is_some(), "{} presses {keys}", c.action);
            }
        }
        assert!(is_known(id::INPUT_SEND) && is_known(id::SNIPPET_TYPE) && is_known(id::INPUT_TOGGLE));
        assert!(!needs_confirmation(id::VOLUME_UP));
    }

    #[test]
    fn windows_settings_pages_are_an_allow_list() {
        assert_eq!(windows_settings_uri("display").as_deref(), Some("ms-settings:display"));
        assert_eq!(windows_settings_uri("../../evil"), None);
    }
}

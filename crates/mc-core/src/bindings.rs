//! Bindings: a trigger connected to an action (APP_SPEC §2, FEAT-014).
//!
//! A binding is a synced item of kind `binding`. This module only describes
//! them: parsing a trigger, normalising a shortcut, and finding the binding
//! for a trigger in an in-memory index. Running the action is the desktop's job.

use std::collections::HashMap;
use std::fmt;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::input::{Direction, GestureMode};
use crate::{Item, kind};

const MODIFIERS: [&str; 4] = ["Ctrl", "Alt", "Shift", "Super"];

/// Named keys exactly as the shortcut recorder writes them (`KeyboardEvent.code`).
const NAMED_KEYS: &[&str] = &[
    "Space",
    "Enter",
    "Escape",
    "Tab",
    "Backspace",
    "Delete",
    "Insert",
    "Home",
    "End",
    "PageUp",
    "PageDown",
    "ArrowUp",
    "ArrowDown",
    "ArrowLeft",
    "ArrowRight",
    "Pause",
    "PrintScreen",
    "ScrollLock",
    "Minus",
    "Equal",
    "BracketLeft",
    "BracketRight",
    "Backslash",
    "Semicolon",
    "Quote",
    "Backquote",
    "Comma",
    "Period",
    "Slash",
];

fn canonical_key(text: &str) -> Option<String> {
    let t = text.trim();
    let lower = t.to_ascii_lowercase();
    let alias = match lower.as_str() {
        "esc" => "Escape",
        "return" => "Enter",
        "del" => "Delete",
        "ins" => "Insert",
        "pgup" => "PageUp",
        "pgdn" => "PageDown",
        "up" => "ArrowUp",
        "down" => "ArrowDown",
        "left" => "ArrowLeft",
        "right" => "ArrowRight",
        _ => "",
    };
    if !alias.is_empty() {
        return Some(alias.to_owned());
    }
    if t.len() == 1 && t.as_bytes()[0].is_ascii_alphanumeric() {
        return Some(t.to_ascii_uppercase());
    }
    if let Some(n) = lower.strip_prefix('f').and_then(|n| n.parse::<u8>().ok())
        && (1..=24).contains(&n)
    {
        return Some(format!("F{n}"));
    }
    if let Some(n) = lower.strip_prefix("numpad").and_then(|n| n.parse::<u8>().ok())
        && n <= 9
    {
        return Some(format!("Numpad{n}"));
    }
    NAMED_KEYS.iter().find(|k| k.eq_ignore_ascii_case(t)).map(|k| (*k).to_owned())
}

fn modifier(text: &str) -> Option<&'static str> {
    match text.trim().to_ascii_lowercase().as_str() {
        "ctrl" | "control" => Some("Ctrl"),
        "alt" | "option" => Some("Alt"),
        "shift" => Some("Shift"),
        "super" | "win" | "windows" | "meta" | "cmd" => Some("Super"),
        _ => None,
    }
}

/// `ctrl+alt+p` → `Ctrl+Alt+P`; modifiers in a fixed order, one key. `None` if it isn't a shortcut.
pub fn normalize_shortcut(text: &str) -> Option<String> {
    let mut mods = [false; 4];
    let mut key = None;
    for part in text.split('+') {
        if let Some(m) = modifier(part) {
            mods[MODIFIERS.iter().position(|x| *x == m)?] = true;
        } else if key.is_none() {
            key = Some(canonical_key(part)?);
        } else {
            return None;
        }
    }
    let key = key?;
    let mut out: Vec<String> = MODIFIERS.iter().zip(mods).filter(|(_, on)| *on).map(|(m, _)| (*m).to_owned()).collect();
    out.push(key);
    Some(out.join("+"))
}

/// A global hotkey needs a modifier, unless it is a function key or Pause.
pub fn is_valid_hotkey(shortcut: &str) -> bool {
    let Some(norm) = normalize_shortcut(shortcut) else { return false };
    let key = norm.rsplit('+').next().unwrap_or_default();
    norm.contains('+') || key == "Pause" || (key.starts_with('F') && key[1..].parse::<u8>().is_ok())
}

#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub enum Trigger {
    /// `hotkey:Ctrl+Alt+P`: a global shortcut.
    Hotkey(String),
    /// `hyper:K`: CapsLock held, then K.
    Hyper(String),
    /// `gesture:caps:left`, `gesture:rmb:up`.
    Gesture(GestureMode, Direction),
}

impl Trigger {
    pub fn parse(text: &str) -> Option<Self> {
        let (head, rest) = text.split_once(':')?;
        match head {
            "hotkey" => is_valid_hotkey(rest).then(|| Self::Hotkey(normalize_shortcut(rest).expect("valid"))),
            "hyper" => {
                let key = canonical_key(rest)?;
                Some(Self::Hyper(key))
            }
            "gesture" => {
                let (mode, dir) = rest.split_once(':')?;
                match GestureMode::parse(mode) {
                    GestureMode::Off => None,
                    mode => Some(Self::Gesture(mode, Direction::parse(dir)?)),
                }
            }
            _ => None,
        }
    }

    /// The same text [`Trigger::parse`] accepts.
    pub fn text(&self) -> String {
        self.to_string()
    }
}

impl fmt::Display for Trigger {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Hotkey(s) => write!(f, "hotkey:{s}"),
            Self::Hyper(k) => write!(f, "hyper:{k}"),
            Self::Gesture(mode, dir) => write!(f, "gesture:{}:{}", mode.name(), dir.name()),
        }
    }
}

/// One binding, as stored in the item's data.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Binding {
    #[serde(skip)]
    pub id: String,
    #[serde(default)]
    pub title: String,
    pub trigger: String,
    pub action: String,
    #[serde(default)]
    pub with: Value,
    /// Process names (`Code.exe`): when set, the binding works only in these apps.
    #[serde(default)]
    pub only_in: Vec<String>,
    /// Process names where the binding is off.
    #[serde(default)]
    pub not_in: Vec<String>,
    #[serde(default = "yes")]
    pub enabled: bool,
}

fn yes() -> bool {
    true
}

fn same_process(a: &str, b: &str) -> bool {
    let strip = |s: &str| s.trim().trim_end_matches(".exe").trim_end_matches(".EXE").to_ascii_lowercase();
    strip(a) == strip(b)
}

impl Binding {
    pub fn from_item(item: &Item) -> Option<Self> {
        if item.kind != kind::BINDING || item.deleted {
            return None;
        }
        let mut b: Self = serde_json::from_value(item.data.clone()).ok()?;
        b.id = item.key.clone();
        Some(b)
    }

    pub fn parsed_trigger(&self) -> Option<Trigger> {
        Trigger::parse(&self.trigger)
    }

    /// Does the app in front allow this binding? `process` is unknown (`None`) on non-Windows.
    pub fn applies_in(&self, process: Option<&str>) -> bool {
        let listed = |list: &[String]| process.is_some_and(|p| list.iter().any(|n| same_process(n, p)));
        if listed(&self.not_in) {
            return false;
        }
        self.only_in.is_empty() || listed(&self.only_in)
    }
}

/// All usable bindings, indexed by trigger.
#[derive(Clone, Debug, Default)]
pub struct Bindings {
    by_trigger: HashMap<Trigger, Vec<Binding>>,
}

impl Bindings {
    pub fn from_items<'a>(items: impl IntoIterator<Item = &'a Item>) -> Self {
        let mut by_trigger: HashMap<Trigger, Vec<Binding>> = HashMap::new();
        let mut all: Vec<Binding> = items.into_iter().filter_map(Binding::from_item).filter(|b| b.enabled).collect();
        all.sort_by(|a, b| a.id.cmp(&b.id));
        for b in all {
            if let Some(t) = b.parsed_trigger() {
                by_trigger.entry(t).or_default().push(b);
            }
        }
        Self { by_trigger }
    }

    /// The binding to run: one limited to this app wins over one that works everywhere.
    pub fn resolve(&self, trigger: &Trigger, process: Option<&str>) -> Option<&Binding> {
        let list = self.by_trigger.get(trigger)?;
        let fits = |b: &&Binding| b.applies_in(process);
        list.iter().filter(fits).find(|b| !b.only_in.is_empty()).or_else(|| list.iter().find(fits))
    }

    /// Every global shortcut that should be registered.
    pub fn hotkeys(&self) -> Vec<String> {
        let mut out: Vec<String> = self
            .by_trigger
            .keys()
            .filter_map(|t| if let Trigger::Hotkey(s) = t { Some(s.clone()) } else { None })
            .collect();
        out.sort();
        out
    }

    pub fn is_empty(&self) -> bool {
        self.by_trigger.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn item(key: &str, data: Value) -> Item {
        Item { kind: kind::BINDING.into(), key: key.into(), data, mtime: 1, deleted: false, device: "d".into() }
    }

    #[test]
    fn shortcuts_are_normalised_like_the_recorder_writes_them() {
        assert_eq!(normalize_shortcut("ctrl+alt+p").as_deref(), Some("Ctrl+Alt+P"));
        assert_eq!(normalize_shortcut("Win+Shift+left").as_deref(), Some("Shift+Super+ArrowLeft"));
        assert_eq!(normalize_shortcut("Alt+space").as_deref(), Some("Alt+Space"));
        assert_eq!(normalize_shortcut("f5").as_deref(), Some("F5"));
        assert_eq!(normalize_shortcut("Ctrl+Numpad7").as_deref(), Some("Ctrl+Numpad7"));
        assert_eq!(normalize_shortcut("Ctrl+"), None);
        assert_eq!(normalize_shortcut("Ctrl+A+B"), None);
        assert_eq!(normalize_shortcut("Ctrl+Banana"), None);
        assert_eq!(normalize_shortcut(""), None);
    }

    #[test]
    fn a_hotkey_needs_a_modifier_unless_it_is_f_key_or_pause() {
        assert!(is_valid_hotkey("Ctrl+K") && is_valid_hotkey("F9") && is_valid_hotkey("Pause"));
        assert!(!is_valid_hotkey("K") && !is_valid_hotkey("Space") && !is_valid_hotkey("nope"));
    }

    #[test]
    fn triggers_round_trip() {
        for text in ["hotkey:Ctrl+Alt+P", "hyper:K", "hyper:Space", "gesture:caps:left", "gesture:rmb:down"] {
            assert_eq!(Trigger::parse(text).unwrap().text(), text);
        }
        assert_eq!(Trigger::parse("hotkey:ctrl+p").unwrap().text(), "hotkey:Ctrl+P");
        for bad in ["hotkey:K", "gesture:off:left", "gesture:caps:diagonal", "edge:left", "hyper:", "nonsense"] {
            assert!(Trigger::parse(bad).is_none(), "{bad}");
        }
    }

    #[test]
    fn resolving_prefers_the_app_specific_binding_and_honours_exclusions() {
        let items = [
            item("a", json!({ "trigger": "hotkey:Ctrl+K", "action": "mc.sync.now" })),
            item(
                "b",
                json!({ "trigger": "hotkey:Ctrl+K", "action": "ext.mc.pomodoro.toggle", "only_in": ["Code.exe"] }),
            ),
            item("c", json!({ "trigger": "hotkey:Ctrl+J", "action": "mc.quit", "not_in": ["game"] })),
            item("d", json!({ "trigger": "hotkey:Ctrl+L", "action": "mc.quit", "enabled": false })),
            item("e", json!({ "trigger": "bogus", "action": "mc.quit" })),
        ];
        let set = Bindings::from_items(&items);
        let k = Trigger::parse("hotkey:Ctrl+K").unwrap();
        assert_eq!(set.resolve(&k, Some("code")).unwrap().action, "ext.mc.pomodoro.toggle");
        assert_eq!(set.resolve(&k, Some("notepad.exe")).unwrap().action, "mc.sync.now");
        assert_eq!(set.resolve(&k, None).unwrap().action, "mc.sync.now");
        let j = Trigger::parse("hotkey:Ctrl+J").unwrap();
        assert!(set.resolve(&j, Some("Game.exe")).is_none());
        assert!(set.resolve(&j, Some("chrome")).is_some());
        assert_eq!(set.hotkeys(), ["Ctrl+J", "Ctrl+K"], "disabled and invalid ones are left out");
    }

    #[test]
    fn deleted_items_and_missing_fields_are_ignored() {
        let mut gone = item("x", json!({ "trigger": "hotkey:Ctrl+K", "action": "mc.quit" }));
        gone.deleted = true;
        assert!(Binding::from_item(&gone).is_none());
        assert!(Binding::from_item(&item("y", json!({ "trigger": "hotkey:Ctrl+K" }))).is_none());
        assert!(Bindings::from_items(&[gone]).is_empty());
    }
}

//! The synced settings the Rust side acts on, read from the store into a
//! snapshot whenever a setting changes. Keys and defaults match `SETTINGS`
//! in `packages/data/src/settings.ts` (APP_SPEC §10).

use std::collections::HashMap;

use mc_core::{kind, pomodoro};
use mc_store::Store;
use serde_json::Value;

pub const OMNIBAR_HOTKEY: &str = "omnibar.hotkey";
pub const DEFAULT_OMNIBAR_HOTKEY: &str = "Alt+Space";
pub const HUD_ENABLED: &str = "hud.enabled";
pub const HUD_SHOW_SECONDS: &str = "hud.show_seconds";
pub const HUD_STYLE: &str = "hud.style";
pub const POMODORO_AUTO_START: &str = "pomodoro.auto_start";

/// The clock's look (`hud.style`); the HUD window is sized for it.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum HudStyle {
    #[default]
    Digital,
    Analog,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Prefs {
    pub omnibar_hotkey: String,
    pub hud_enabled: bool,
    pub hud_style: HudStyle,
    pub hud_fade_near_px: f64,
    pub hud_fade_far_px: f64,
    pub pomodoro: pomodoro::Config,
}

impl Default for Prefs {
    fn default() -> Self {
        Self {
            omnibar_hotkey: DEFAULT_OMNIBAR_HOTKEY.to_owned(),
            hud_enabled: true,
            hud_style: HudStyle::Digital,
            hud_fade_near_px: 60.0,
            hud_fade_far_px: 220.0,
            pomodoro: pomodoro::Config::default(),
        }
    }
}

/// The default of an on/off setting that `setting.toggle` may flip; other keys can't be toggled.
pub fn toggle_default(key: &str) -> Option<bool> {
    match key {
        HUD_ENABLED => Some(Prefs::default().hud_enabled),
        HUD_SHOW_SECONDS => Some(false),
        POMODORO_AUTO_START => Some(pomodoro::Config::default().auto_start),
        _ => None,
    }
}

/// One synced setting's stored value, if it has one.
pub fn setting(store: &Store, key: &str) -> Option<Value> {
    store.get(kind::SETTING, key).ok().flatten().filter(|i| !i.deleted).map(|i| i.data)
}

impl Prefs {
    pub fn load(store: &Store) -> Self {
        let values: HashMap<String, Value> =
            store.list(kind::SETTING).unwrap_or_default().into_iter().map(|i| (i.key, i.data)).collect();
        let get = |key: &str| values.get(key);
        let int = |key: &str, min: u64, max: u64| get(key).and_then(Value::as_u64).filter(|n| (min..=max).contains(n));
        let d = Self::default();
        let p = d.pomodoro;
        Self {
            omnibar_hotkey: get(OMNIBAR_HOTKEY)
                .and_then(Value::as_str)
                .filter(|s| !s.trim().is_empty())
                .map_or(d.omnibar_hotkey, str::to_owned),
            hud_enabled: get(HUD_ENABLED).and_then(Value::as_bool).unwrap_or(d.hud_enabled),
            hud_style: match get(HUD_STYLE).and_then(Value::as_str) {
                Some("analog") => HudStyle::Analog,
                _ => HudStyle::Digital,
            },
            hud_fade_near_px: int("hud.fade_near_px", 0, 400).map_or(d.hud_fade_near_px, |n| n as f64),
            hud_fade_far_px: int("hud.fade_far_px", 40, 800).map_or(d.hud_fade_far_px, |n| n as f64),
            pomodoro: pomodoro::Config {
                focus_min: int("pomodoro.focus_min", 1, 120).map_or(p.focus_min, |n| n as u32),
                short_break_min: int("pomodoro.short_break_min", 1, 60).map_or(p.short_break_min, |n| n as u32),
                long_break_min: int("pomodoro.long_break_min", 1, 60).map_or(p.long_break_min, |n| n as u32),
                long_break_every: int("pomodoro.long_break_every", 2, 12).map_or(p.long_break_every, |n| n as u32),
                auto_start: get(POMODORO_AUTO_START).and_then(Value::as_bool).unwrap_or(p.auto_start),
            },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn defaults_then_stored_values_and_bad_values_ignored() {
        let store = Store::open_in_memory().unwrap();
        assert_eq!(Prefs::load(&store), Prefs::default());
        store.put(kind::SETTING, OMNIBAR_HOTKEY, json!("Ctrl+Alt+K")).unwrap();
        store.put(kind::SETTING, "pomodoro.focus_min", json!(50)).unwrap();
        store.put(kind::SETTING, "pomodoro.short_break_min", json!(999)).unwrap();
        store.put(kind::SETTING, HUD_ENABLED, json!(false)).unwrap();
        store.put(kind::SETTING, HUD_STYLE, json!("analog")).unwrap();
        let p = Prefs::load(&store);
        assert_eq!(p.omnibar_hotkey, "Ctrl+Alt+K");
        assert_eq!(p.hud_style, HudStyle::Analog);
        assert_eq!((p.pomodoro.focus_min, p.pomodoro.short_break_min), (50, 5));
        assert!(!p.hud_enabled);
    }
}

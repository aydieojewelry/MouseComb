//! The synced settings the Rust side acts on, read from the store into a
//! snapshot whenever a setting changes. Keys and defaults match `SETTINGS`
//! in `packages/data/src/settings.ts` (APP_SPEC §10).

use mc_core::{kind, pomodoro};
use mc_store::Store;
use serde_json::Value;

pub const OMNIBAR_HOTKEY: &str = "omnibar.hotkey";
pub const DEFAULT_OMNIBAR_HOTKEY: &str = "Alt+Space";
pub const HUD_ENABLED: &str = "hud.enabled";

#[derive(Clone, Debug, PartialEq)]
pub struct Prefs {
    pub omnibar_hotkey: String,
    pub hud_enabled: bool,
    pub hud_fade_near_px: f64,
    pub hud_fade_far_px: f64,
    pub pomodoro: pomodoro::Config,
}

impl Default for Prefs {
    fn default() -> Self {
        Self {
            omnibar_hotkey: DEFAULT_OMNIBAR_HOTKEY.to_owned(),
            hud_enabled: true,
            hud_fade_near_px: 60.0,
            hud_fade_far_px: 220.0,
            pomodoro: pomodoro::Config::default(),
        }
    }
}

impl Prefs {
    pub fn load(store: &Store) -> Self {
        let get = |key: &str| -> Option<Value> {
            store.get(kind::SETTING, key).ok().flatten().filter(|i| !i.deleted).map(|i| i.data)
        };
        let int = |key: &str, min: u64, max: u64| get(key).and_then(|v| v.as_u64()).filter(|n| (min..=max).contains(n));
        let d = Self::default();
        let p = d.pomodoro;
        Self {
            omnibar_hotkey: get(OMNIBAR_HOTKEY)
                .and_then(|v| v.as_str().map(str::to_owned))
                .filter(|s| !s.trim().is_empty())
                .unwrap_or(d.omnibar_hotkey),
            hud_enabled: get(HUD_ENABLED).and_then(|v| v.as_bool()).unwrap_or(d.hud_enabled),
            hud_fade_near_px: int("hud.fade_near_px", 0, 400).map_or(d.hud_fade_near_px, |n| n as f64),
            hud_fade_far_px: int("hud.fade_far_px", 40, 800).map_or(d.hud_fade_far_px, |n| n as f64),
            pomodoro: pomodoro::Config {
                focus_min: int("pomodoro.focus_min", 1, 120).map_or(p.focus_min, |n| n as u32),
                short_break_min: int("pomodoro.short_break_min", 1, 60).map_or(p.short_break_min, |n| n as u32),
                long_break_min: int("pomodoro.long_break_min", 1, 60).map_or(p.long_break_min, |n| n as u32),
                long_break_every: int("pomodoro.long_break_every", 2, 12).map_or(p.long_break_every, |n| n as u32),
                auto_start: get("pomodoro.auto_start").and_then(|v| v.as_bool()).unwrap_or(p.auto_start),
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
        let p = Prefs::load(&store);
        assert_eq!(p.omnibar_hotkey, "Ctrl+Alt+K");
        assert_eq!((p.pomodoro.focus_min, p.pomodoro.short_break_min), (50, 5));
        assert!(!p.hud_enabled);
    }
}

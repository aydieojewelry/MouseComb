//! The OmniBar (FEAT-004) and HUD (FEAT-001) windows, and the OmniBar hotkey.
//! Both windows are created hidden at startup (tauri.conf.json), so showing
//! one is instant (APP_SPEC §4).

use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::{AppHandle, Manager, PhysicalPosition, WebviewWindow};
use tauri_plugin_global_shortcut::GlobalShortcutExt;
use tauri_specta::Event;

use crate::state::AppState;

pub const MAIN: &str = "main";
pub const OMNIBAR: &str = "omnibar";
pub const HUD: &str = "hud";

/// Gap between the HUD and the screen corner, in logical pixels.
const HUD_MARGIN: f64 = 16.0;
const FADE_EVERY: Duration = Duration::from_millis(50);
/// Focus can bounce while a window appears; ignore blur this soon after showing.
const BLUR_GRACE: Duration = Duration::from_millis(400);

/// Whether the OmniBar hotkey is active, for the Settings page.
#[derive(Clone, Debug, Default, Serialize, Deserialize, Type, Event)]
pub struct HotkeyStatus {
    pub hotkey: String,
    pub registered: bool,
    pub message: Option<String>,
}

/// The OmniBar was just shown: clear the input and focus it.
#[derive(Clone, Debug, Serialize, Deserialize, Type, Event)]
pub struct OmniBarOpened;

/// HUD opacity from the cursor's distance (proximity fade), 0 to 1.
#[derive(Clone, Debug, Serialize, Deserialize, Type, Event)]
pub struct HudFade {
    #[specta(type = specta_typescript::Number)]
    pub opacity: f64,
}

/// A short message for the HUD to show, e.g. "Copied".
#[derive(Clone, Debug, Serialize, Deserialize, Type, Event)]
pub struct HudFlash {
    pub text: String,
}

/// Register `hotkey` for the OmniBar, replacing the previous one.
pub fn apply_hotkey(app: &AppHandle, hotkey: &str) {
    let state = app.state::<AppState>();
    {
        let current = state.hotkey.lock().expect("hotkey lock");
        if current.registered && current.hotkey == hotkey {
            return;
        }
    }
    let shortcuts = app.global_shortcut();
    let _ = shortcuts.unregister_all();
    let status = match shortcuts.register(hotkey) {
        Ok(()) => HotkeyStatus { hotkey: hotkey.to_owned(), registered: true, message: None },
        Err(e) => {
            log::warn!("OmniBar hotkey {hotkey} not registered: {e}");
            let message = if e.to_string().to_lowercase().contains("parse") || e.to_string().contains("Unrecognized") {
                format!("MouseComb doesn't understand the shortcut \"{hotkey}\". Record it again.")
            } else {
                format!("{hotkey} is already used by another app. Pick a different shortcut.")
            };
            HotkeyStatus { hotkey: hotkey.to_owned(), registered: false, message: Some(message) }
        }
    };
    *state.hotkey.lock().expect("hotkey lock") = status.clone();
    let _ = status.emit(app);
}

pub fn toggle_omnibar(app: &AppHandle) {
    let Some(w) = app.get_webview_window(OMNIBAR) else { return };
    if w.is_visible().unwrap_or(false) && w.is_focused().unwrap_or(false) {
        let _ = w.hide();
    } else {
        show_omnibar(app);
    }
}

/// Show the OmniBar near the top of the screen the mouse is on.
pub fn show_omnibar(app: &AppHandle) {
    let Some(w) = app.get_webview_window(OMNIBAR) else { return };
    if let Ok(cursor) = app.cursor_position()
        && let Ok(Some(monitor)) = app.monitor_from_point(cursor.x, cursor.y)
        && let Ok(size) = w.outer_size()
    {
        let area = monitor.work_area();
        let x = area.position.x + (area.size.width as i32 - size.width as i32) / 2;
        let y = area.position.y + (f64::from(area.size.height) * 0.2) as i32;
        let _ = w.set_position(PhysicalPosition::new(x, y));
    }
    *app.state::<AppState>().omnibar_shown_at.lock().expect("omnibar lock") = Some(Instant::now());
    let _ = w.show();
    let _ = w.set_focus();
    let _ = OmniBarOpened.emit_to(app, OMNIBAR);
    crate::apps::refresh_if_stale(app);
}

/// The OmniBar lost focus: close it, unless it only just opened.
pub fn on_omnibar_blur(app: &AppHandle) {
    let shown_at = *app.state::<AppState>().omnibar_shown_at.lock().expect("omnibar lock");
    if shown_at.is_some_and(|t| t.elapsed() < BLUR_GRACE) {
        return;
    }
    hide_omnibar(app);
}

pub fn hide_omnibar(app: &AppHandle) {
    if let Some(w) = app.get_webview_window(OMNIBAR) {
        let _ = w.hide();
    }
}

/// Show the main window on a Settings page (`/general`, `/pomodoro`, …).
pub fn open_settings(app: &AppHandle, page: &str) {
    let to = format!("/{page}");
    crate::tray::show_main(app);
    let _ = crate::state::NavigateRequested { to }.emit_to(app, MAIN);
}

fn hud(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window(HUD)
}

/// Bottom-right of the primary screen's work area (above the taskbar).
pub fn place_hud(app: &AppHandle) {
    let Some(w) = hud(app) else { return };
    let Ok(Some(monitor)) = app.primary_monitor() else { return };
    let Ok(size) = w.outer_size() else { return };
    let area = monitor.work_area();
    let margin = (HUD_MARGIN * monitor.scale_factor()) as i32;
    let x = area.position.x + area.size.width as i32 - size.width as i32 - margin;
    let y = area.position.y + area.size.height as i32 - size.height as i32 - margin;
    let _ = w.set_position(PhysicalPosition::new(x, y));
}

pub fn set_hud_visible(app: &AppHandle, visible: bool) {
    let Some(w) = hud(app) else { return };
    if visible {
        place_hud(app);
        // On Linux the native window (and its real size) only exists once
        // shown, so make it click-through and place it again after showing.
        let _ = w.show();
        let _ = w.set_ignore_cursor_events(true);
        let app = app.clone();
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(Duration::from_millis(400)).await;
            place_hud(&app);
        });
    } else {
        let _ = w.hide();
    }
}

/// Distance from a point to a rectangle's edges (0 inside).
pub fn distance_to_rect(px: f64, py: f64, left: f64, top: f64, right: f64, bottom: f64) -> f64 {
    let dx = (left - px).max(0.0).max(px - right);
    let dy = (top - py).max(0.0).max(py - bottom);
    dx.hypot(dy)
}

/// Hidden within `near`, fully visible beyond `far`, linear in between (DEC-015).
pub fn fade_opacity(distance: f64, near: f64, far: f64) -> f64 {
    if far <= near {
        return if distance > near { 1.0 } else { 0.0 };
    }
    ((distance - near) / (far - near)).clamp(0.0, 1.0)
}

/// Follow the cursor and tell the HUD how visible to be. Reads only the
/// cursor position and the settings snapshot; never touches input.
pub fn start_hud_fade(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let mut last = -1.0_f64;
        let mut ticks: u32 = 0;
        loop {
            tokio::time::sleep(FADE_EVERY).await;
            ticks = ticks.wrapping_add(1);
            let Some(w) = hud(&app) else { continue };
            if !w.is_visible().unwrap_or(false) {
                last = -1.0;
                continue;
            }
            // Screens change (docking, resolution): re-place every ~10 s.
            if ticks.is_multiple_of(200) {
                place_hud(&app);
            }
            let (Ok(cursor), Ok(pos), Ok(size), Ok(scale)) =
                (app.cursor_position(), w.outer_position(), w.outer_size(), w.scale_factor())
            else {
                continue;
            };
            let prefs = app.state::<AppState>().prefs();
            let d = distance_to_rect(
                cursor.x,
                cursor.y,
                f64::from(pos.x),
                f64::from(pos.y),
                f64::from(pos.x) + f64::from(size.width),
                f64::from(pos.y) + f64::from(size.height),
            ) / scale;
            let opacity = (fade_opacity(d, prefs.hud_fade_near_px, prefs.hud_fade_far_px) * 50.0).round() / 50.0;
            if (opacity - last).abs() > f64::EPSILON {
                last = opacity;
                let _ = HudFade { opacity }.emit_to(&app, HUD);
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fade_follows_distance_from_the_hud_edges() {
        assert_eq!(distance_to_rect(5.0, 5.0, 0.0, 0.0, 10.0, 10.0), 0.0);
        assert_eq!(distance_to_rect(13.0, 14.0, 0.0, 0.0, 10.0, 10.0), 5.0);
        assert_eq!(distance_to_rect(-30.0, 5.0, 0.0, 0.0, 10.0, 10.0), 30.0);
        assert_eq!(fade_opacity(30.0, 60.0, 220.0), 0.0);
        assert_eq!(fade_opacity(140.0, 60.0, 220.0), 0.5);
        assert_eq!(fade_opacity(900.0, 60.0, 220.0), 1.0);
        assert_eq!(fade_opacity(61.0, 60.0, 60.0), 1.0);
    }
}

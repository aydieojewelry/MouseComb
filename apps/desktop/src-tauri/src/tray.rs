use std::sync::Mutex;

use mc_core::actions::id;
use serde_json::{Value, json};
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, Wry};

use crate::state::AppState;
use crate::updates::UpdateState;
use crate::{actions, overlays, prefs, updates};

/// Menu items whose text follows the app's state.
pub struct TrayMenu {
    pomodoro: MenuItem<Wry>,
    clock: CheckMenuItem<Wry>,
    update: MenuItem<Wry>,
    /// What the menu shows now, so a refresh only touches what changed.
    shown: Mutex<Option<TrayView>>,
}

#[derive(Clone, PartialEq)]
struct TrayView {
    pomodoro: &'static str,
    clock: bool,
    update: String,
    update_enabled: bool,
}

/// Every menu item runs an action (FEAT-013), off the menu's thread.
fn run(app: &AppHandle, action: &'static str, with: Value) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(e) = actions::run(&app, action, &with, false).await {
            log::warn!("{action} from the tray failed: {e}");
        }
    });
}

pub fn create(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Open MouseComb", true, None::<&str>)?;
    let omnibar = MenuItem::with_id(app, "omnibar", "Open OmniBar", true, None::<&str>)?;
    let pomodoro = MenuItem::with_id(app, "pomodoro", "Start Pomodoro", true, None::<&str>)?;
    let clock = CheckMenuItem::with_id(app, "clock", "Show clock", true, true, None::<&str>)?;
    let sync = MenuItem::with_id(app, "sync", "Sync now", true, None::<&str>)?;
    let update = MenuItem::with_id(app, "update", "Check for updates", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit MouseComb", true, None::<&str>)?;
    let sep = || PredefinedMenuItem::separator(app);
    let menu =
        Menu::with_items(app, &[&open, &omnibar, &sep()?, &pomodoro, &clock, &sep()?, &sync, &update, &sep()?, &quit])?;

    let mut tray = TrayIconBuilder::with_id("main")
        .tooltip("MouseComb")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => show_main(app),
            "omnibar" => overlays::show_omnibar(app),
            "pomodoro" => run(app, id::POMODORO_TOGGLE, Value::Null),
            "clock" => {
                // The check mark flipped itself; the next refresh sets it from the setting.
                app.state::<TrayMenu>().shown.lock().expect("tray lock").take();
                run(app, id::SETTING_TOGGLE, json!({ "key": prefs::HUD_ENABLED }));
            }
            "sync" => run(app, id::SYNC_NOW, Value::Null),
            "update" if updates::status(app).state == UpdateState::Ready => run(app, id::UPDATE_INSTALL, Value::Null),
            "update" => run(app, id::UPDATE_CHECK, Value::Null),
            "quit" => crate::quit(app),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                show_main(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    app.manage(TrayMenu { pomodoro, clock, update, shown: Mutex::new(None) });
    refresh(app);
    Ok(())
}

/// Bring the menu text in line with the timer, the clock and updates.
pub fn refresh(app: &AppHandle) {
    let Some(menu) = app.try_state::<TrayMenu>() else { return };
    let state = app.state::<AppState>();
    let (running, fresh) = {
        let timer = state.pomodoro.lock().expect("pomodoro lock");
        (timer.running(), timer.fresh)
    };
    let status = updates::status(app);
    let (update, update_enabled) = match status.state {
        UpdateState::Ready => (format!("Restart to update to {}", status.version.unwrap_or_default()), true),
        UpdateState::Checking => ("Checking for updates…".to_owned(), false),
        UpdateState::Downloading => ("Downloading update…".to_owned(), false),
        UpdateState::Disabled => ("Updates off in this build".to_owned(), false),
        _ => ("Check for updates".to_owned(), true),
    };
    let next = TrayView {
        pomodoro: match (running, fresh) {
            (true, _) => "Pause Pomodoro",
            (false, true) => "Start Pomodoro",
            (false, false) => "Resume Pomodoro",
        },
        clock: state.prefs.read().expect("prefs lock").hud_enabled,
        update,
        update_enabled,
    };

    // Each setter is a round trip to the main thread; skip the unchanged ones.
    let mut shown = menu.shown.lock().expect("tray lock");
    let before = shown.as_ref();
    if before.map(|b| b.pomodoro) != Some(next.pomodoro) {
        let _ = menu.pomodoro.set_text(next.pomodoro);
    }
    if before.map(|b| b.clock) != Some(next.clock) {
        let _ = menu.clock.set_checked(next.clock);
    }
    if before.map(|b| &b.update) != Some(&next.update) {
        let _ = menu.update.set_text(&next.update);
    }
    if before.map(|b| b.update_enabled) != Some(next.update_enabled) {
        let _ = menu.update.set_enabled(next.update_enabled);
    }
    *shown = Some(next);
}

pub fn show_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(overlays::MAIN) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, Wry};

use crate::state::AppState;
use crate::updates::UpdateState;
use crate::{actions, overlays, sync_loop, updates};

/// Menu items whose text follows the app's state.
pub struct TrayMenu {
    pomodoro: MenuItem<Wry>,
    clock: CheckMenuItem<Wry>,
    update: MenuItem<Wry>,
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
        .on_menu_event(|app, event| {
            let run = |action: &'static str| {
                let app = app.clone();
                tauri::async_runtime::spawn(async move {
                    if let Err(e) = actions::run(&app, action, &serde_json::Value::Null, false).await {
                        log::warn!("{action} from the tray failed: {e}");
                    }
                });
            };
            match event.id.as_ref() {
                "open" => show_main(app),
                "omnibar" => overlays::show_omnibar(app),
                "pomodoro" => run(mc_core::actions::id::POMODORO_TOGGLE),
                "clock" => {
                    let app = app.clone();
                    tauri::async_runtime::spawn(async move {
                        let with = serde_json::json!({ "key": crate::prefs::HUD_ENABLED });
                        let _ = actions::run(&app, mc_core::actions::id::SETTING_TOGGLE, &with, false).await;
                    });
                }
                "sync" => {
                    let app = app.clone();
                    tauri::async_runtime::spawn(async move {
                        let _ = sync_loop::run(&app).await;
                    });
                }
                "update" => {
                    if updates::status(app).state == UpdateState::Ready {
                        run(mc_core::actions::id::UPDATE_INSTALL);
                    } else {
                        run(mc_core::actions::id::UPDATE_CHECK);
                    }
                }
                "quit" => {
                    let _ = crate::quit(app);
                }
                _ => {}
            }
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
    app.manage(TrayMenu { pomodoro, clock, update });
    refresh(app);
    Ok(())
}

/// Bring the menu text in line with the timer, the clock and updates.
pub fn refresh(app: &AppHandle) {
    let Some(menu) = app.try_state::<TrayMenu>() else { return };
    let state = app.state::<AppState>();
    let timer = state.pomodoro.lock().expect("pomodoro lock").clone();
    let pomodoro = match (timer.running, timer.fresh) {
        (true, _) => "Pause Pomodoro",
        (false, true) => "Start Pomodoro",
        (false, false) => "Resume Pomodoro",
    };
    let _ = menu.pomodoro.set_text(pomodoro);
    let _ = menu.clock.set_checked(state.prefs().hud_enabled);
    let status = updates::status(app);
    let (text, enabled) = match status.state {
        UpdateState::Ready => (format!("Restart to update to {}", status.version.unwrap_or_default()), true),
        UpdateState::Checking => ("Checking for updates…".to_owned(), false),
        UpdateState::Downloading => ("Downloading update…".to_owned(), false),
        UpdateState::Disabled => ("Updates off in this build".to_owned(), false),
        _ => ("Check for updates".to_owned(), true),
    };
    let _ = menu.update.set_text(text);
    let _ = menu.update.set_enabled(enabled);
}

pub fn show_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

//! MouseComb desktop shell (FEAT-000): tray, single instance, start with
//! Windows, local store, account and background sync. M1 adds the OmniBar
//! (FEAT-004) on a global hotkey, the Clock HUD (FEAT-001), Pomodoro
//! (FEAT-002), quick commands (FEAT-023) and auto-updates (FEAT-022).

mod actions;
mod apps;
mod commands;
mod error;
mod overlays;
mod pomodoro;
mod prefs;
mod secrets;
mod state;
mod sync_loop;
mod tray;
mod updates;

use std::sync::atomic::Ordering;

use tauri::{AppHandle, Manager, WindowEvent, Wry};
use tauri_plugin_global_shortcut::ShortcutState;
use tauri_specta::{Builder, collect_commands, collect_events};

use crate::state::{AccountChanged, AppState, ItemsChanged, NavigateRequested, SyncStatusChanged};

/// Started by Windows at sign-in: stay in the tray instead of opening a window.
pub const MINIMIZED_ARG: &str = "--minimized";

/// Every command and event the UI can use. Also drives the TypeScript export.
pub fn specta_builder() -> Builder<Wry> {
    Builder::<Wry>::new()
        .commands(collect_commands![
            commands::items_list,
            commands::item_put,
            commands::item_delete,
            commands::item_new_key,
            commands::local_setting_get,
            commands::local_setting_set,
            commands::server_url_get,
            commands::server_url_set,
            commands::account_get,
            commands::account_sign_up,
            commands::account_sign_in,
            commands::account_request_password_reset,
            commands::account_sign_out,
            commands::sync_status_get,
            commands::sync_now,
            commands::app_info,
            commands::commands_list,
            commands::apps_list,
            commands::pomodoro_get,
            commands::update_status_get,
            commands::hotkey_status_get,
            commands::omnibar_hide,
            actions::action_run,
        ])
        .events(collect_events![
            ItemsChanged,
            SyncStatusChanged,
            AccountChanged,
            NavigateRequested,
            overlays::HotkeyStatus,
            overlays::OmniBarOpened,
            overlays::HudFade,
            overlays::HudFlash,
            pomodoro::PomodoroChanged,
            updates::UpdateStatus,
            apps::AppsChanged,
        ])
}

/// Milliseconds since the Unix epoch.
pub fn now_ms() -> i64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_or(0, |d| d.as_millis() as i64)
}

/// Quit for real (the window's close button only hides it). A downloaded
/// update installs on the way out; with none, `install` does nothing.
pub fn quit(app: &AppHandle) {
    let _ = updates::install(app);
    app.exit(0);
}

/// Settings changed (here, from a hotkey, or from another device). A sync
/// pull changes many at once, so changes within 50 ms share one reload.
fn schedule_settings_reload(app: &AppHandle) {
    let state = app.state::<AppState>();
    if state.prefs_reload_pending.swap(true, Ordering::SeqCst) {
        return;
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        app.state::<AppState>().prefs_reload_pending.store(false, Ordering::SeqCst);
        on_settings_changed(&app);
    });
}

fn on_settings_changed(app: &AppHandle) {
    let state = app.state::<AppState>();
    let next = prefs::Prefs::load(&state.store);
    let before = std::mem::replace(&mut *state.prefs.write().expect("prefs lock"), next.clone());
    if before == next {
        return;
    }
    if before.omnibar_hotkey != next.omnibar_hotkey {
        overlays::apply_hotkey(app, &next.omnibar_hotkey);
    }
    if before.hud_enabled != next.hud_enabled || (next.hud_enabled && before.hud_style != next.hud_style) {
        overlays::set_hud_visible(app, next.hud_enabled);
    }
    if before.pomodoro != next.pomodoro {
        pomodoro::on_prefs_changed(app, &next.pomodoro);
    }
    tray::refresh(app);
}

pub fn run() {
    let builder = specta_builder();

    tauri::Builder::default()
        // Must be first: a second launch focuses the running app instead.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| tray::show_main(app)))
        .plugin(tauri_plugin_log::Builder::new().level(log::LevelFilter::Info).build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![MINIMIZED_ARG]),
        ))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                // The only shortcut registered is the OmniBar's.
                .with_handler(|app, _shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        overlays::toggle_omnibar(app);
                    }
                })
                .build(),
        )
        .invoke_handler(builder.invoke_handler())
        .setup(move |app| {
            builder.mount_events(app);

            let state = AppState::load(app.handle())?;
            let handle = app.handle().clone();
            state.store.set_listener(Some(std::sync::Arc::new(move |kind: &str| {
                use tauri_specta::Event;
                let _ = ItemsChanged { kind: kind.to_owned() }.emit(&handle);
                if kind == mc_core::kind::SETTING {
                    schedule_settings_reload(&handle);
                }
                let state = handle.state::<AppState>();
                if kind != "local_setting" && !state.syncing.load(Ordering::SeqCst) {
                    state.wake.notify_one();
                }
            })));
            let prefs = state.prefs();
            app.manage(state);

            tray::create(app.handle())?;
            sync_loop::start(app.handle().clone());
            pomodoro::start(app.handle().clone());
            updates::start(app.handle().clone());
            overlays::apply_hotkey(app.handle(), &prefs.omnibar_hotkey);
            overlays::set_hud_visible(app.handle(), prefs.hud_enabled);
            overlays::start_hud_fade(app.handle().clone());
            apps::scan_soon(app.handle().clone());

            if std::env::args().any(|a| a == MINIMIZED_ARG)
                && let Some(window) = app.get_webview_window(overlays::MAIN)
            {
                let _ = window.hide();
            }
            Ok(())
        })
        .on_window_event(|window, event| match event {
            // Closing the window keeps MouseComb running in the tray.
            WindowEvent::CloseRequested { api, .. } if window.label() != overlays::HUD => {
                api.prevent_close();
                let _ = window.hide();
            }
            // The OmniBar goes away as soon as you click somewhere else.
            WindowEvent::Focused(false) if window.label() == overlays::OMNIBAR => {
                overlays::on_omnibar_blur(window.app_handle());
            }
            _ => {}
        })
        .run(tauri::generate_context!())
        .expect("error while running MouseComb");
}

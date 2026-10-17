//! MouseComb desktop shell (FEAT-000): tray, single instance, start with
//! Windows, local store, account and background sync.

mod commands;
mod error;
mod secrets;
mod state;
mod sync_loop;
mod tray;

use tauri::{Manager, WindowEvent, Wry};
use tauri_specta::{Builder, collect_commands, collect_events};

use crate::state::{AccountChanged, AppState, ItemsChanged, SyncStatusChanged};

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
            commands::account_sign_out,
            commands::sync_status_get,
            commands::sync_now,
            commands::app_info,
        ])
        .events(collect_events![ItemsChanged, SyncStatusChanged, AccountChanged])
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
        .invoke_handler(builder.invoke_handler())
        .setup(move |app| {
            builder.mount_events(app);

            let state = AppState::load(app.handle())?;
            let handle = app.handle().clone();
            state.store.set_listener(Some(std::sync::Arc::new(move |kind: &str| {
                use tauri_specta::Event;
                let _ = ItemsChanged { kind: kind.to_owned() }.emit(&handle);
                let state = handle.state::<AppState>();
                if kind != "local_setting" && !state.syncing.load(std::sync::atomic::Ordering::SeqCst) {
                    state.wake.notify_one();
                }
            })));
            app.manage(state);

            tray::create(app.handle())?;
            sync_loop::start(app.handle().clone());

            if std::env::args().any(|a| a == MINIMIZED_ARG)
                && let Some(window) = app.get_webview_window("main")
            {
                let _ = window.hide();
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            // Closing the window keeps MouseComb running in the tray.
            if let WindowEvent::CloseRequested { api, .. } = event
                && window.label() == "main"
            {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running MouseComb");
}

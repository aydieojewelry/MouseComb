//! Background sync: on start, shortly after local changes, every minute, and
//! on "Sync now". Never runs on the input path (APP_SPEC §3).

use std::sync::atomic::Ordering;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use mc_sync::{Backend, DeviceInfo, SyncReport};
use tauri::{AppHandle, Manager};
use tauri_specta::Event;

use crate::error::{CommandError, CommandResult, ErrorCode};
use crate::secrets;
use crate::state::{AccountChanged, AppState, SyncState};

const INTERVAL: Duration = Duration::from_secs(60);
const DEBOUNCE: Duration = Duration::from_millis(1_500);
const REFRESH_AFTER: Duration = Duration::from_secs(24 * 60 * 60);

pub fn start(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        if app.state::<AppState>().account().is_some() {
            on_connected(&app).await;
        }
        loop {
            let state = app.state::<AppState>();
            tokio::select! {
                _ = state.wake.notified() => tokio::time::sleep(DEBOUNCE).await,
                _ = tokio::time::sleep(INTERVAL) => {}
            }
            if state.account().is_some() {
                let _ = run(&app).await;
            }
        }
    });
}

/// After sign-in or at startup with a saved session: refresh the token,
/// register this device, then sync.
pub async fn on_connected(app: &AppHandle) {
    if let Err(e) = refresh_if_needed(app, true).await {
        log::warn!("token refresh failed: {e}");
        if e.code == ErrorCode::SignedOut {
            return;
        }
    }
    if let Ok((session, backend)) = app.state::<AppState>().connected()
        && let Err(e) = backend.register_device(&session, &device_info(app)).await
    {
        log::warn!("device registration failed: {e}");
    }
    let _ = run(app).await;
}

/// One sync pass, repeated while local edits arrive during it.
pub async fn run(app: &AppHandle) -> CommandResult<SyncReport> {
    let state = app.state::<AppState>();
    let _one_at_a_time = state.sync_lock.lock().await;
    let mut total = SyncReport::default();

    loop {
        refresh_if_needed(app, false).await?;
        let (session, backend) = state.connected()?;

        state.set_status(app, |s| {
            s.state = SyncState::Syncing;
            s.message = None;
        });
        state.syncing.store(true, Ordering::SeqCst);
        let result = mc_sync::sync(&backend, &state.store, &session).await;
        state.syncing.store(false, Ordering::SeqCst);

        match result {
            Ok(report) => {
                total.pulled += report.pulled;
                total.pushed += report.pushed;
                total.stale += report.stale;
                let now = SystemTime::now().duration_since(UNIX_EPOCH).map_or(0.0, |d| d.as_millis() as f64);
                let _ = state.store.meta_set("sync.last_synced_at", &now.to_string());
                state.set_status(app, |s| {
                    s.state = SyncState::Idle;
                    s.last_synced_at = Some(now);
                });
            }
            Err(mc_sync::Error::Unauthorized) => {
                sign_out(app, true, Some("Your session expired. Sign in again to keep syncing."));
                return Err(CommandError::new(ErrorCode::SignedOut, "Your session expired. Sign in again."));
            }
            Err(e) => {
                let err = CommandError::from(e);
                let offline = err.code == ErrorCode::Network;
                state.set_status(app, |s| {
                    s.state = if offline { SyncState::Offline } else { SyncState::Error };
                    s.message = Some(err.message.clone());
                });
                return Err(err);
            }
        }

        // Edits made while this pass ran: go again right away.
        if state.store.dirty().map_or(true, |d| d.is_empty()) {
            return Ok(total);
        }
    }
}

async fn refresh_if_needed(app: &AppHandle, force: bool) -> CommandResult<()> {
    let state = app.state::<AppState>();
    let due = state
        .connection
        .read()
        .expect("connection lock")
        .as_ref()
        .map(|c| (force || c.refreshed_at.elapsed() > REFRESH_AFTER, c.session.clone(), c.backend.clone()));
    let Some((true, session, backend)) = due else {
        return Ok(());
    };
    match backend.refresh(&session).await {
        Ok(fresh) => {
            secrets::save(&state.store, &fresh);
            if let Some(c) = state.connection.write().expect("connection lock").as_mut() {
                c.session = fresh;
                c.refreshed_at = Instant::now();
            }
            Ok(())
        }
        Err(mc_sync::Error::Unauthorized) => {
            sign_out(app, true, Some("Your session expired. Sign in again to keep syncing."));
            Err(CommandError::new(ErrorCode::SignedOut, "Your session expired. Sign in again."))
        }
        // Offline: keep the old token and try again later.
        Err(e) => Err(CommandError::from(e)),
    }
}

/// Forget the session. With `keep_data`, synced items stay on this device.
pub fn sign_out(app: &AppHandle, keep_data: bool, message: Option<&str>) {
    let state = app.state::<AppState>();
    *state.connection.write().expect("connection lock") = None;
    secrets::clear(&state.store);
    if !keep_data {
        let _ = state.store.clear_synced();
    }
    state.set_status(app, |s| {
        s.state = SyncState::SignedOut;
        s.message = message.map(str::to_owned);
    });
    let _ = AccountChanged { account: None }.emit(app);
}

pub fn device_info(app: &AppHandle) -> DeviceInfo {
    let name =
        std::env::var("COMPUTERNAME").or_else(|_| std::env::var("HOSTNAME")).unwrap_or_else(|_| "This computer".into());
    DeviceInfo {
        device_id: app.state::<AppState>().store.device_id().to_owned(),
        name,
        platform: std::env::consts::OS.into(),
        app_version: app.package_info().version.to_string(),
    }
}

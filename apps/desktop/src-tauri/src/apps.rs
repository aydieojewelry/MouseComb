//! A cached list of installed apps for the OmniBar (FEAT-023). Listing starts
//! a PowerShell process (about a second), so it runs in the background: once
//! shortly after start, and when the OmniBar opens with a list older than 15 min.

use std::sync::atomic::Ordering;
use std::time::{Duration, Instant};

use mc_win::apps::App;
use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::{AppHandle, Manager};
use tauri_specta::Event;

use crate::state::AppState;

const STALE_AFTER: Duration = Duration::from_secs(15 * 60);
/// Leave Windows sign-in alone: the first scan waits a little.
const FIRST_SCAN_AFTER: Duration = Duration::from_secs(30);

#[derive(Default)]
pub struct AppsCache {
    pub apps: Vec<App>,
    pub loaded_at: Option<Instant>,
}

/// The app list changed; refetch it.
#[derive(Clone, Debug, Serialize, Deserialize, Type, Event)]
pub struct AppsChanged;

pub fn scan_soon(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(FIRST_SCAN_AFTER).await;
        refresh_if_stale(&app);
    });
}

pub fn refresh_if_stale(app: &AppHandle) {
    let state = app.state::<AppState>();
    let fresh = state.apps.read().expect("apps lock").loaded_at.is_some_and(|t| t.elapsed() < STALE_AFTER);
    if fresh || state.apps_loading.swap(true, Ordering::SeqCst) {
        return;
    }
    let app = app.clone();
    std::thread::spawn(move || {
        let state = app.state::<AppState>();
        match mc_win::apps::list() {
            Ok(apps) => {
                let changed = {
                    let mut cache = state.apps.write().expect("apps lock");
                    let changed = cache.apps != apps;
                    *cache = AppsCache { apps, loaded_at: Some(Instant::now()) };
                    changed
                };
                if changed {
                    let _ = AppsChanged.emit(&app);
                }
            }
            Err(mc_win::Error::Unsupported) => {
                state.apps.write().expect("apps lock").loaded_at = Some(Instant::now());
            }
            Err(e) => log::warn!("couldn't list apps: {e}"),
        }
        state.apps_loading.store(false, Ordering::SeqCst);
    });
}

use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex, RwLock};
use std::time::Instant;

use mc_core::pomodoro::Pomodoro;
use mc_store::Store;
use mc_sync::{Account, PocketBase, Session};
use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::{AppHandle, Manager};
use tauri_specta::Event;

use crate::apps::AppsCache;
use crate::error::{CommandError, CommandResult, ErrorCode};
use crate::overlays::HotkeyStatus;
use crate::prefs::Prefs;
use crate::updates::Updates;
use crate::{pomodoro, secrets};

/// Device-only setting with the sync server address (APP_SPEC §5).
pub const SERVER_URL_KEY: &str = "sync.server_url";

/// The server a fresh install points at. Release builds set
/// `MOUSECOMB_DEFAULT_SERVER` to the hosted backend.
pub fn default_server_url() -> &'static str {
    option_env!("MOUSECOMB_DEFAULT_SERVER").unwrap_or("http://127.0.0.1:8090")
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, Type, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SyncState {
    SignedOut,
    Idle,
    Syncing,
    Offline,
    Error,
}

#[derive(Clone, Debug, Serialize, Deserialize, Type)]
pub struct SyncStatus {
    pub state: SyncState,
    /// Milliseconds since the Unix epoch.
    pub last_synced_at: Option<f64>,
    pub message: Option<String>,
    /// Local changes not on the server yet.
    pub pending: u32,
}

/// An item kind changed (locally, from sync, or a device-only setting).
#[derive(Clone, Debug, Serialize, Deserialize, Type, Event)]
pub struct ItemsChanged {
    pub kind: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, Type, Event)]
pub struct SyncStatusChanged(pub SyncStatus);

#[derive(Clone, Debug, Serialize, Deserialize, Type, Event)]
pub struct AccountChanged {
    pub account: Option<Account>,
}

/// Ask the main window to show a Settings page, e.g. `/pomodoro`.
#[derive(Clone, Debug, Serialize, Deserialize, Type, Event)]
pub struct NavigateRequested {
    pub to: String,
}

pub struct Connection {
    pub session: Session,
    pub backend: PocketBase,
    pub refreshed_at: Instant,
}

pub struct AppState {
    pub store: Arc<Store>,
    pub connection: RwLock<Option<Connection>>,
    pub status: Mutex<SyncStatus>,
    /// Wakes the background sync loop early.
    pub wake: tokio::sync::Notify,
    /// Only one sync runs at a time.
    pub sync_lock: tokio::sync::Mutex<()>,
    pub syncing: AtomicBool,
    /// Settings the Rust side acts on, refreshed when a setting changes.
    pub prefs: RwLock<Prefs>,
    pub hotkey: Mutex<HotkeyStatus>,
    /// Bindings, read again whenever a binding or input setting changes (FEAT-014).
    pub bindings: RwLock<mc_core::bindings::Bindings>,
    /// The registered shortcuts and running hooks.
    pub input: Mutex<crate::engine::Runtime>,
    pub pomodoro: Mutex<Pomodoro>,
    pub apps: RwLock<AppsCache>,
    pub apps_loading: AtomicBool,
    pub updates: Mutex<Updates>,
    pub omnibar_shown_at: Mutex<Option<Instant>>,
    /// A settings reload is already scheduled (bursts share one).
    pub prefs_reload_pending: AtomicBool,
    /// Wakes the Pomodoro task when the timer changes.
    pub pomodoro_wake: tokio::sync::Notify,
    /// Where the HUD is on screen, for the proximity fade; `None` while hidden.
    pub hud_rect: Mutex<Option<HudRect>>,
    /// Wakes the fade loop when the HUD is shown.
    pub hud_wake: tokio::sync::Notify,
}

/// The HUD's frame in physical pixels and its screen's scale.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct HudRect {
    pub left: f64,
    pub top: f64,
    pub right: f64,
    pub bottom: f64,
    pub scale: f64,
}

impl AppState {
    pub fn load(app: &AppHandle) -> Result<Self, Box<dyn std::error::Error>> {
        let dir = app.path().app_data_dir()?;
        let store = Arc::new(Store::open(&dir.join("mousecomb.db"))?);

        let connection = secrets::load(&store).and_then(|session| {
            let backend = PocketBase::new(&session.backend_url).ok()?;
            Some(Connection { session, backend, refreshed_at: Instant::now() })
        });
        let pending = store.dirty().map_or(0, |d| d.len() as u32);
        let status = SyncStatus {
            state: if connection.is_some() { SyncState::Idle } else { SyncState::SignedOut },
            last_synced_at: store.meta_get("sync.last_synced_at").ok().flatten().and_then(|v| v.parse().ok()),
            message: None,
            pending,
        };

        let prefs = Prefs::load(&store);
        let timer = pomodoro::load(&store, &prefs.pomodoro);

        Ok(Self {
            connection: RwLock::new(connection),
            status: Mutex::new(status),
            wake: tokio::sync::Notify::new(),
            sync_lock: tokio::sync::Mutex::new(()),
            syncing: AtomicBool::new(false),
            prefs: RwLock::new(prefs),
            hotkey: Mutex::new(HotkeyStatus::default()),
            bindings: RwLock::new(mc_core::bindings::Bindings::default()),
            input: Mutex::new(crate::engine::Runtime::default()),
            pomodoro: Mutex::new(timer),
            apps: RwLock::new(AppsCache::default()),
            apps_loading: AtomicBool::new(false),
            updates: Mutex::new(Updates::default()),
            omnibar_shown_at: Mutex::new(None),
            prefs_reload_pending: AtomicBool::new(false),
            pomodoro_wake: tokio::sync::Notify::new(),
            hud_rect: Mutex::new(None),
            hud_wake: tokio::sync::Notify::new(),
            store,
        })
    }

    pub fn prefs(&self) -> Prefs {
        self.prefs.read().expect("prefs lock").clone()
    }

    pub fn pomodoro_config(&self) -> mc_core::pomodoro::Config {
        self.prefs.read().expect("prefs lock").pomodoro
    }

    pub fn server_url(&self) -> String {
        self.store
            .local_get(SERVER_URL_KEY)
            .ok()
            .flatten()
            .and_then(|v| v.as_str().map(str::to_owned))
            .unwrap_or_else(|| default_server_url().to_owned())
    }

    pub fn account(&self) -> Option<Account> {
        self.connection.read().expect("connection lock").as_ref().map(|c| Account::from(&c.session))
    }

    /// A copy of the current session and backend, or a "signed out" error.
    pub fn connected(&self) -> CommandResult<(Session, PocketBase)> {
        self.connection
            .read()
            .expect("connection lock")
            .as_ref()
            .map(|c| (c.session.clone(), c.backend.clone()))
            .ok_or_else(|| CommandError::new(ErrorCode::SignedOut, "Sign in to sync."))
    }

    pub fn status(&self) -> SyncStatus {
        self.status.lock().expect("status lock").clone()
    }

    /// Update the status and tell every window.
    pub fn set_status(&self, app: &AppHandle, update: impl FnOnce(&mut SyncStatus)) {
        let snapshot = {
            let mut status = self.status.lock().expect("status lock");
            update(&mut status);
            status.pending = self.store.dirty().map_or(status.pending, |d| d.len() as u32);
            status.clone()
        };
        let _ = SyncStatusChanged(snapshot).emit(app);
    }
}

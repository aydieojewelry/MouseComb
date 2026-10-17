//! Commands the React windows call. Types are exported to
//! `packages/bindings` by `cargo run --bin export-bindings`.

use std::time::Instant;

use mc_core::Item;
use mc_sync::{Account, Backend, PocketBase, SyncReport};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use specta::Type;
use tauri::{AppHandle, Manager, State};
use tauri_specta::Event;

use crate::error::{CommandError, CommandResult, ErrorCode};
use crate::state::{AccountChanged, AppState, Connection, SERVER_URL_KEY, SyncState, SyncStatus};
use crate::{secrets, sync_loop};

/// The backend rejects item data over 256 KB; fail early with a clear message.
const MAX_DATA_BYTES: usize = 256 * 1024;

/// Any JSON value. Exported to TypeScript as `unknown`; the UI validates it.
#[derive(Clone, Debug, Serialize, Deserialize, Type)]
#[serde(transparent)]
pub struct Json(#[specta(type = specta_typescript::Unknown)] pub Value);

#[tauri::command]
#[specta::specta]
pub fn items_list(state: State<'_, AppState>, kind: String) -> CommandResult<Vec<Item>> {
    Ok(state.store.list(&kind)?)
}

#[tauri::command]
#[specta::specta]
pub fn item_put(state: State<'_, AppState>, kind: String, key: String, data: Json) -> CommandResult<Item> {
    let Json(data) = data;
    if key.is_empty() || key.len() > 255 {
        return Err(CommandError::new(ErrorCode::Validation, "Item keys must be 1 to 255 characters."));
    }
    if data.to_string().len() > MAX_DATA_BYTES {
        return Err(CommandError::new(ErrorCode::Validation, "This item is too large to sync (256 KB max)."));
    }
    Ok(state.store.put(&kind, &key, data)?)
}

#[tauri::command]
#[specta::specta]
pub fn item_delete(state: State<'_, AppState>, kind: String, key: String) -> CommandResult<()> {
    state.store.delete(&kind, &key)?;
    Ok(())
}

/// A fresh key for a new item (snippet, workflow, …).
#[tauri::command]
#[specta::specta]
pub fn item_new_key() -> String {
    mc_core::new_key()
}

#[tauri::command]
#[specta::specta]
pub fn local_setting_get(state: State<'_, AppState>, key: String) -> CommandResult<Option<Json>> {
    Ok(state.store.local_get(&key)?.map(Json))
}

#[tauri::command]
#[specta::specta]
pub fn local_setting_set(state: State<'_, AppState>, key: String, value: Json) -> CommandResult<()> {
    Ok(state.store.local_set(&key, &value.0)?)
}

#[tauri::command]
#[specta::specta]
pub fn server_url_get(state: State<'_, AppState>) -> String {
    state.server_url()
}

#[tauri::command]
#[specta::specta]
pub fn server_url_set(state: State<'_, AppState>, url: String) -> CommandResult<()> {
    let url = url.trim().trim_end_matches('/');
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err(CommandError::new(ErrorCode::Validation, "The server address must start with https://"));
    }
    if state.account().is_some() {
        return Err(CommandError::new(ErrorCode::Validation, "Sign out before changing the server."));
    }
    Ok(state.store.local_set(SERVER_URL_KEY, &Value::String(url.to_owned()))?)
}

#[tauri::command]
#[specta::specta]
pub fn account_get(state: State<'_, AppState>) -> Option<Account> {
    state.account()
}

#[tauri::command]
#[specta::specta]
pub async fn account_sign_up(app: AppHandle, email: String, password: String) -> CommandResult<Account> {
    let backend = backend_for(&app)?;
    let session = backend.sign_up(email.trim(), &password).await?;
    connect(&app, backend, session).await
}

#[tauri::command]
#[specta::specta]
pub async fn account_sign_in(app: AppHandle, email: String, password: String) -> CommandResult<Account> {
    let backend = backend_for(&app)?;
    let session = backend.sign_in(email.trim(), &password).await?;
    connect(&app, backend, session).await
}

/// Sign out. With `keep_data`, your settings and snippets stay on this device.
#[tauri::command]
#[specta::specta]
pub fn account_sign_out(app: AppHandle, keep_data: bool) {
    sync_loop::sign_out(&app, keep_data, None);
}

#[tauri::command]
#[specta::specta]
pub fn sync_status_get(state: State<'_, AppState>) -> SyncStatus {
    state.status()
}

#[tauri::command]
#[specta::specta]
pub async fn sync_now(app: AppHandle) -> CommandResult<SyncReport> {
    sync_loop::run(&app).await
}

#[derive(Serialize, Type)]
pub struct AppInfo {
    pub version: String,
    pub device_id: String,
    pub data_dir: String,
}

#[tauri::command]
#[specta::specta]
pub fn app_info(app: AppHandle) -> AppInfo {
    AppInfo {
        version: app.package_info().version.to_string(),
        device_id: app.state::<AppState>().store.device_id().to_owned(),
        data_dir: app.path().app_data_dir().map(|p| p.display().to_string()).unwrap_or_default(),
    }
}

fn backend_for(app: &AppHandle) -> CommandResult<PocketBase> {
    Ok(PocketBase::new(&app.state::<AppState>().server_url())?)
}

async fn connect(app: &AppHandle, backend: PocketBase, session: mc_sync::Session) -> CommandResult<Account> {
    let state = app.state::<AppState>();
    mc_sync::adopt_account(&state.store, &session)?;
    secrets::save(&state.store, &session);
    let account = Account::from(&session);
    *state.connection.write().expect("connection lock") =
        Some(Connection { session, backend, refreshed_at: Instant::now() });
    state.set_status(app, |s| {
        s.state = SyncState::Idle;
        s.message = None;
    });
    let _ = AccountChanged { account: Some(account.clone()) }.emit(app);

    let app = app.clone();
    tauri::async_runtime::spawn(async move { sync_loop::on_connected(&app).await });
    Ok(account)
}

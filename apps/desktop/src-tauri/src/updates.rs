//! Auto-updates (FEAT-022): check at start and every 24 h, download in the
//! background, install when the user restarts or quits MouseComb.
//!
//! Only release builds can update: the release workflow writes the updater
//! public key into tauri.conf.json (PIPELINE.md). Without it updates are off.

use std::time::Duration;

use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::{AppHandle, Manager};
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_updater::{Update, UpdaterExt};
use tauri_specta::Event;

use crate::error::{CommandError, CommandResult, ErrorCode};
use crate::now_ms;
use crate::state::AppState;

const FIRST_CHECK_AFTER: Duration = Duration::from_secs(20);
const CHECK_EVERY_MS: i64 = 24 * 60 * 60 * 1000;
/// Wake up hourly and compare wall-clock time, so a PC that slept still checks.
const WAKE_EVERY: Duration = Duration::from_secs(60 * 60);

#[derive(Clone, Copy, Debug, Default, Serialize, Deserialize, Type, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum UpdateState {
    /// Development build, or the release had no updater key.
    #[default]
    Disabled,
    Idle,
    Checking,
    Downloading,
    /// Downloaded; installs on restart or quit.
    Ready,
    UpToDate,
    Error,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize, Type, Event)]
pub struct UpdateStatus {
    pub state: UpdateState,
    /// The new version as `x.y.z`.
    pub version: Option<String>,
    pub notes: Option<String>,
    /// Download progress, 0 to 1, when the size is known.
    pub progress: Option<f64>,
    /// Last check, ms since the Unix epoch.
    #[specta(type = Option<specta_typescript::Number>)]
    pub checked_at: Option<i64>,
    pub message: Option<String>,
}

#[derive(Default)]
pub struct Updates {
    pub status: UpdateStatus,
    pending: Option<(Update, Vec<u8>)>,
}

/// `x.y.z+b` (VERSIONING.md): the installer's `x.y.z` and the build number.
pub fn display_version(major: u64, minor: u64, patch: u64) -> String {
    let build = option_env!("MOUSECOMB_BUILD").unwrap_or("0");
    format!("{major}.{minor}.{patch}+{build}")
}

/// `x.y.z` from an update's version, without build or pre-release parts.
fn short_from_semver(version: &str) -> String {
    version.split(['+', '-']).next().unwrap_or(version).to_owned()
}

pub fn enabled(app: &AppHandle) -> bool {
    app.config()
        .plugins
        .0
        .get("updater")
        .and_then(|u| u.get("pubkey"))
        .and_then(|k| k.as_str())
        .is_some_and(|k| !k.trim().is_empty())
}

pub fn status(app: &AppHandle) -> UpdateStatus {
    app.state::<AppState>().updates.lock().expect("updates lock").status.clone()
}

fn set_status(app: &AppHandle, change: impl FnOnce(&mut UpdateStatus)) -> UpdateStatus {
    let state = app.state::<AppState>();
    let snapshot = {
        let mut updates = state.updates.lock().expect("updates lock");
        change(&mut updates.status);
        updates.status.clone()
    };
    let _ = snapshot.emit(app);
    crate::tray::refresh(app);
    snapshot
}

pub fn start(app: AppHandle) {
    if !enabled(&app) {
        set_status(&app, |s| {
            s.state = UpdateState::Disabled;
            s.message = Some("Updates are off in this build. Installed releases update themselves.".into());
        });
        return;
    }
    set_status(&app, |s| s.state = UpdateState::Idle);
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(FIRST_CHECK_AFTER).await;
        loop {
            let last = status(&app).checked_at.unwrap_or(0);
            if now_ms() - last >= CHECK_EVERY_MS {
                let _ = check_now(&app).await;
            }
            tokio::time::sleep(WAKE_EVERY).await;
        }
    });
}

/// Check now and download what's found. Safe to call any time.
pub async fn check_now(app: &AppHandle) -> CommandResult<UpdateStatus> {
    let current = status(app);
    match current.state {
        UpdateState::Disabled => {
            return Err(CommandError::new(ErrorCode::Unsupported, current.message.unwrap_or_default()));
        }
        UpdateState::Checking | UpdateState::Downloading | UpdateState::Ready => return Ok(current),
        _ => {}
    }
    set_status(app, |s| {
        s.state = UpdateState::Checking;
        s.message = None;
    });
    let found = async { app.updater()?.check().await }.await;
    let update = match found {
        Ok(None) => {
            return Ok(set_status(app, |s| {
                s.state = UpdateState::UpToDate;
                s.checked_at = Some(now_ms());
            }));
        }
        Ok(Some(update)) => update,
        Err(e) => return Err(failed(app, &format!("Couldn't check for updates: {e}"))),
    };

    let version = short_from_semver(&update.version);
    set_status(app, |s| {
        s.state = UpdateState::Downloading;
        s.version = Some(version.clone());
        s.notes = update.body.clone();
        s.progress = None;
        s.checked_at = Some(now_ms());
    });
    let mut received = 0usize;
    let mut last_step = 0u32;
    let progress_app = app.clone();
    let bytes = update
        .download(
            move |chunk, total| {
                received += chunk;
                if let Some(total) = total.filter(|t| *t > 0) {
                    let fraction = (received as f64 / total as f64).min(1.0);
                    let step = (fraction * 20.0) as u32;
                    if step != last_step {
                        last_step = step;
                        set_status(&progress_app, |s| s.progress = Some(fraction));
                    }
                }
            },
            || {},
        )
        .await;
    let bytes = match bytes {
        Ok(bytes) => bytes,
        Err(e) => return Err(failed(app, &format!("Couldn't download the update: {e}"))),
    };
    app.state::<AppState>().updates.lock().expect("updates lock").pending = Some((update, bytes));
    let ready = set_status(app, |s| {
        s.state = UpdateState::Ready;
        s.progress = Some(1.0);
    });
    let _ = app
        .notification()
        .builder()
        .title("MouseComb update ready")
        .body(format!("Version {version} installs when you restart MouseComb."))
        .show();
    Ok(ready)
}

fn failed(app: &AppHandle, message: &str) -> CommandError {
    log::warn!("{message}");
    set_status(app, |s| {
        s.state = UpdateState::Error;
        s.message = Some(message.to_owned());
        s.checked_at = Some(now_ms());
    });
    CommandError::new(ErrorCode::Network, message)
}

/// Install the downloaded update and restart. On Windows the installer
/// closes MouseComb, updates it and starts it again.
pub fn install(app: &AppHandle) -> CommandResult<()> {
    let pending = app.state::<AppState>().updates.lock().expect("updates lock").pending.take();
    let Some((update, bytes)) = pending else {
        return Err(CommandError::new(ErrorCode::Validation, "No update is ready yet."));
    };
    if let Err(e) = update.install(bytes) {
        return Err(failed(app, &format!("Couldn't install the update: {e}")));
    }
    app.restart();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn versions_read_as_x_y_z_plus_build() {
        assert!(display_version(0, 2, 3).starts_with("0.2.3+"));
        assert_eq!(short_from_semver("0.10.12+7"), "0.10.12");
        assert_eq!(short_from_semver("1.0.0"), "1.0.0");
    }
}

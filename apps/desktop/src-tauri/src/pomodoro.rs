//! Pomodoro (FEAT-002): the `mc_core::pomodoro` timer, ticked here, saved on
//! this device, shown in the HUD, and logged as synced sessions.
//! Built inside the core for M1; it moves behind the extension API in M5.

use std::time::Duration;

use mc_core::pomodoro::{Config, Finished, Phase, Pomodoro};
use mc_store::Store;
use serde::{Deserialize, Serialize};
use serde_json::json;
use specta::Type;
use tauri::{AppHandle, Manager};
use tauri_plugin_notification::NotificationExt;
use tauri_specta::Event;

use crate::now_ms;
use crate::state::AppState;

/// Device-only: the timer survives a restart, but each PC has its own.
pub const STATE_KEY: &str = "pomodoro.state";
/// While running, wake at least this often: wall time can jump (sleep, clock changes).
const MAX_WAIT_MS: i64 = 1_000;

#[derive(Clone, Debug, Serialize, Deserialize, Type, Event)]
pub struct PomodoroChanged(pub Pomodoro);

pub fn load(store: &Store, config: &Config) -> Pomodoro {
    let mut timer = store
        .local_get(STATE_KEY)
        .ok()
        .flatten()
        .and_then(|v| serde_json::from_value::<Pomodoro>(v).ok())
        .unwrap_or_else(|| Pomodoro::new(config));
    timer.apply_config(config);
    timer
}

/// Change the timer, then save it and tell every window and the tray.
pub fn update(app: &AppHandle, change: impl FnOnce(&mut Pomodoro, i64, &Config)) -> Pomodoro {
    let state = app.state::<AppState>();
    let config = state.pomodoro_config();
    let snapshot = {
        let mut timer = state.pomodoro.lock().expect("pomodoro lock");
        change(&mut timer, now_ms(), &config);
        timer.clone()
    };
    publish(app, &snapshot);
    snapshot
}

fn publish(app: &AppHandle, timer: &Pomodoro) {
    let state = app.state::<AppState>();
    if let Ok(value) = serde_json::to_value(timer)
        && let Err(e) = state.store.local_set(STATE_KEY, &value)
    {
        log::warn!("couldn't save the Pomodoro timer: {e}");
    }
    let _ = PomodoroChanged(timer.clone()).emit(app);
    state.pomodoro_wake.notify_one();
    crate::tray::refresh(app);
}

pub fn phase_name(phase: Phase) -> &'static str {
    match phase {
        Phase::Focus => "Focus",
        Phase::ShortBreak => "Short break",
        Phase::LongBreak => "Long break",
    }
}

/// Tick the timer while it runs; when a phase ends, notify and log the
/// session. A stopped timer costs nothing: the task waits for `publish`.
pub fn start(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let state = app.state::<AppState>();
        loop {
            let ends_at = state.pomodoro.lock().expect("pomodoro lock").ends_at;
            let Some(ends_at) = ends_at else {
                state.pomodoro_wake.notified().await;
                continue;
            };
            let wait = (ends_at - now_ms()).clamp(0, MAX_WAIT_MS) as u64;
            tokio::select! {
                _ = tokio::time::sleep(Duration::from_millis(wait)) => {}
                _ = state.pomodoro_wake.notified() => continue,
            }
            let config = state.pomodoro_config();
            let finished = {
                let mut timer = state.pomodoro.lock().expect("pomodoro lock");
                timer.tick(now_ms(), &config).map(|done| (done, timer.clone()))
            };
            if let Some((done, timer)) = finished {
                publish(&app, &timer);
                on_finished(&app, &done, &config, timer.running());
            }
        }
    });
}

fn on_finished(app: &AppHandle, done: &Finished, config: &Config, next_started: bool) {
    if let Some(started_at) = done.started_at {
        let store = &app.state::<AppState>().store;
        let data = json!({ "started_at": started_at, "ended_at": now_ms(), "minutes": done.minutes });
        if let Err(e) = store.put(mc_core::kind::POMODORO, &mc_core::new_key(), data) {
            log::warn!("couldn't save the Pomodoro session: {e}");
        }
    }
    let minutes = config.duration_ms(done.next) / 60_000;
    let (title, body) = match done.phase {
        Phase::Focus => {
            ("Focus session done", format!("Time for a {minutes}-minute {}.", phase_name(done.next).to_lowercase()))
        }
        _ => ("Break's over", format!("Ready for {minutes} minutes of focus?")),
    };
    let body = if next_started { body } else { format!("{body} Start it from the OmniBar or the tray.") };
    if let Err(e) = app.notification().builder().title(title).body(body).show() {
        log::warn!("couldn't show the Pomodoro notification: {e}");
    }
}

/// New durations from Settings apply to a phase that hasn't started.
pub fn on_prefs_changed(app: &AppHandle, config: &Config) {
    let state = app.state::<AppState>();
    let snapshot = {
        let mut timer = state.pomodoro.lock().expect("pomodoro lock");
        let before = timer.clone();
        timer.apply_config(config);
        (*timer != before).then(|| timer.clone())
    };
    if let Some(timer) = snapshot {
        publish(app, &timer);
    }
}

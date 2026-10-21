//! Bindings at run time (FEAT-014, FEAT-008, FEAT-006): global hotkeys, the
//! Hyper-Key and mouse gestures all end here, where a trigger is matched to a
//! binding for the app in front and the action runs, off the input path.
//!
//! Everything is **off until the user turns on input features** (device-only
//! `input.enabled`). `Ctrl+Alt+Pause` always turns them off again.

use std::sync::mpsc;

use mc_core::bindings::{Bindings, Trigger, normalize_shortcut};
use mc_core::input::{Button, Emit, EngineConfig, GestureConfig, GestureMode};
use mc_win::hooks::Hooks;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use specta::Type;
use tauri::{AppHandle, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use tauri_specta::Event;

use crate::overlays::{self, HotkeyStatus};
use crate::prefs::{self, Prefs};
use crate::state::AppState;

/// Always registered while input features are on; switches them off.
pub const PANIC_KEY: &str = "Ctrl+Alt+Pause";

/// A binding that can't work, and why.
#[derive(Clone, Debug, Serialize, Deserialize, Type)]
pub struct BindingIssue {
    pub trigger: String,
    pub message: String,
}

/// What the Bindings and General pages show about hotkeys, gestures and the Hyper-Key.
#[derive(Clone, Debug, Default, Serialize, Deserialize, Type, Event)]
pub struct InputStatus {
    /// Hyper-Key and gestures need Windows; hotkeys work everywhere.
    pub hooks_supported: bool,
    pub hooks_running: bool,
    pub panic_key: String,
    pub issues: Vec<BindingIssue>,
}

/// What is registered or running right now.
#[derive(Default)]
pub struct Runtime {
    hooks: Option<Hooks>,
    registered: Vec<String>,
    status: InputStatus,
}

pub fn status(app: &AppHandle) -> InputStatus {
    let mut status = app.state::<AppState>().input.lock().expect("input lock").status.clone();
    status.hooks_supported = cfg!(windows);
    status.panic_key = PANIC_KEY.to_owned();
    status
}

/// Turn input features on or off (the switch, the panic key, `mc.input.toggle`).
pub fn set_enabled(app: &AppHandle, on: bool) -> mc_store::Result<()> {
    app.state::<AppState>().store.local_set(prefs::INPUT_ENABLED, &json!(on))?;
    if !on {
        mc_win::keys::STOP_TYPING.store(true, std::sync::atomic::Ordering::SeqCst);
    }
    crate::on_settings_changed(app);
    Ok(())
}

/// Read the bindings and settings again, then make shortcuts and hooks match them.
pub fn reload(app: &AppHandle) {
    let state = app.state::<AppState>();
    let items = state.store.list(mc_core::kind::BINDING).unwrap_or_default();
    let bindings = Bindings::from_items(&items);
    let prefs = state.prefs();
    let mut issues = Vec::new();
    {
        let mut rt = state.input.lock().expect("input lock");
        register_shortcuts(app, &prefs, &bindings, &mut rt, &mut issues);
        apply_hooks(app, &prefs, &mut rt, &mut issues);
        rt.status.issues = issues;
        rt.status.hooks_running = rt.hooks.is_some();
    }
    *state.bindings.write().expect("bindings lock") = bindings;
    let _ = status(app).emit(app);
}

#[derive(Clone, Copy)]
enum Target {
    OmniBar,
    Binding,
    Panic,
}

fn register_shortcuts(
    app: &AppHandle,
    prefs: &Prefs,
    bindings: &Bindings,
    rt: &mut Runtime,
    issues: &mut Vec<BindingIssue>,
) {
    let omnibar = prefs.omnibar_hotkey.clone();
    let mut want = vec![(omnibar.clone(), Target::OmniBar)];
    if prefs.input_enabled {
        let mine = normalize_shortcut(&omnibar);
        for shortcut in bindings.hotkeys() {
            if mine.as_deref() == Some(shortcut.as_str()) {
                issues.push(BindingIssue {
                    trigger: format!("hotkey:{shortcut}"),
                    message: "The OmniBar already uses this shortcut.".into(),
                });
            } else if shortcut != PANIC_KEY {
                want.push((shortcut, Target::Binding));
            } else {
                issues.push(BindingIssue {
                    trigger: format!("hotkey:{shortcut}"),
                    message: "This is the key that turns everything off.".into(),
                });
            }
        }
        want.push((PANIC_KEY.to_owned(), Target::Panic));
    }
    let signature: Vec<String> = want.iter().map(|(s, _)| s.clone()).collect();
    let state = app.state::<AppState>();
    if signature == rt.registered {
        // Already registered; keep reporting what failed last time.
        issues.extend(rt.status.issues.iter().filter(|i| i.message.starts_with("Couldn't use")).cloned());
        return;
    }

    let shortcuts = app.global_shortcut();
    let _ = shortcuts.unregister_all();
    for (shortcut, target) in want {
        let name = shortcut.clone();
        let result = match target {
            Target::OmniBar => shortcuts.on_shortcut(shortcut.as_str(), |app, _, e| {
                if e.state == ShortcutState::Pressed {
                    overlays::toggle_omnibar(app);
                }
            }),
            Target::Binding => shortcuts.on_shortcut(shortcut.as_str(), move |app, _, e| {
                if e.state == ShortcutState::Pressed {
                    dispatch(app, Trigger::Hotkey(name.clone()));
                }
            }),
            // The plugin holds its shortcut list locked while a handler runs, and turning input
            // off re-registers shortcuts: so never do that on the handler's own thread.
            Target::Panic => shortcuts.on_shortcut(shortcut.as_str(), |app, _, e| {
                if e.state == ShortcutState::Pressed {
                    let app = app.clone();
                    tauri::async_runtime::spawn(async move { panic_off(&app) });
                }
            }),
        };
        let failure = result.err().map(|e| {
            log::warn!("shortcut {shortcut} not registered: {e}");
            let text = e.to_string();
            if text.to_lowercase().contains("parse") || text.contains("Unrecognized") {
                format!("MouseComb doesn't understand the shortcut \"{shortcut}\". Record it again.")
            } else {
                format!("{shortcut} is already used by another app. Pick a different shortcut.")
            }
        });
        if matches!(target, Target::OmniBar) {
            let status =
                HotkeyStatus { hotkey: shortcut.clone(), registered: failure.is_none(), message: failure.clone() };
            *state.hotkey.lock().expect("hotkey lock") = status.clone();
            let _ = status.emit(app);
        } else if let Some(message) = failure {
            issues.push(BindingIssue {
                trigger: format!("hotkey:{shortcut}"),
                message: format!("Couldn't use {shortcut}: {message}"),
            });
        }
    }
    rt.registered = signature;
}

fn apply_hooks(app: &AppHandle, prefs: &Prefs, rt: &mut Runtime, issues: &mut Vec<BindingIssue>) {
    let gestures = if prefs.input_enabled { prefs.input_gestures } else { GestureMode::Off };
    let hyper = prefs.input_enabled && (prefs.input_hyper || gestures == GestureMode::Caps);
    let config = EngineConfig { gestures, gesture: GestureConfig::default(), hyper, hyper_toggle_ms: 1500 };
    let wanted = hyper || gestures != GestureMode::Off;
    match (wanted, rt.hooks.as_ref()) {
        (true, Some(hooks)) => hooks.set_config(config),
        (true, None) => {
            let (tx, rx) = mpsc::channel();
            match Hooks::start(config, tx) {
                Ok(hooks) => {
                    rt.hooks = Some(hooks);
                    let app = app.clone();
                    std::thread::spawn(move || {
                        for emit in rx {
                            handle(&app, emit);
                        }
                    });
                }
                Err(e) => issues.push(BindingIssue { trigger: "hooks".into(), message: e.to_string() }),
            }
        }
        (false, Some(_)) => rt.hooks = None,
        (false, None) => {}
    }
}

fn handle(app: &AppHandle, emit: Emit) {
    match emit {
        Emit::Trigger(trigger) => dispatch(app, trigger),
        Emit::ToggleCapsLock => {
            let _ = mc_win::keys::toggle_capslock();
        }
        Emit::ReplayClick(button, _, _) => {
            let _ = mc_win::keys::click(button == Button::Right);
        }
    }
}

fn panic_off(app: &AppHandle) {
    match set_enabled(app, false) {
        Ok(()) => overlays::flash(app, "Hotkeys are off"),
        Err(e) => log::error!("couldn't turn input features off: {e}"),
    }
}

/// Find the binding for `trigger` in the app in front and run its action.
pub fn dispatch(app: &AppHandle, trigger: Trigger) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let process = mc_win::foreground::process_name();
        let found = app
            .state::<AppState>()
            .bindings
            .read()
            .expect("bindings lock")
            .resolve(&trigger, process.as_deref())
            .cloned();
        let Some(binding) = found else { return };
        let with = if binding.with.is_null() { Value::Null } else { binding.with.clone() };
        // A key press never confirms a destructive action (Sleep, Restart…): that stays in the OmniBar.
        crate::actions::run_and_flash(&app, &binding.action, &with, false).await;
    });
}

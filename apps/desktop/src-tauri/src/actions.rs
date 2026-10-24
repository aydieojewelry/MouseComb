//! Runs actions by id (FEAT-013). The OmniBar calls `action_run`; later the
//! binding engine, workflows and extensions call [`run`] the same way.
//! Never called from the input path (APP_SPEC §3).

use mc_core::actions::{self, id};
use serde::Serialize;
use serde_json::Value;
use specta::Type;
use tauri::{AppHandle, Manager};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_opener::OpenerExt;

use crate::commands::Json;
use crate::error::{CommandError, CommandResult, ErrorCode};
use crate::overlays;
use crate::state::AppState;
use crate::{editor, engine, pomodoro, prefs, sync_loop, updates};

#[derive(Clone, Debug, Default, Serialize, Type)]
pub struct ActionResult {
    /// A short confirmation for the HUD, e.g. "Copied".
    pub message: Option<String>,
}

impl ActionResult {
    fn say(message: impl Into<String>) -> Self {
        Self { message: Some(message.into()) }
    }
}

/// Run an action. The OmniBar closes itself after a command from its list
/// (`omnibar_hide`) and stays open for its timer view's buttons.
#[tauri::command]
#[specta::specta]
pub async fn action_run(app: AppHandle, action: String, args: Json, confirmed: bool) -> CommandResult<ActionResult> {
    let result = run(&app, &action, &args.0, confirmed).await?;
    if let Some(text) = &result.message {
        overlays::flash(&app, text);
    }
    Ok(result)
}

/// Run an action from a key press or gesture: whatever it says, or why it failed, shows on the HUD.
pub async fn run_and_flash(app: &AppHandle, action: &str, with: &Value, confirmed: bool) {
    let text = match run(app, action, with, confirmed).await {
        Ok(result) => result.message,
        Err(e) => Some(e.message),
    };
    if let Some(text) = text {
        overlays::flash(app, &text);
    }
}

fn arg<'a>(with: &'a Value, name: &str) -> CommandResult<&'a str> {
    with.get(name)
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .ok_or_else(|| CommandError::new(ErrorCode::Validation, format!("This action needs \"{name}\".")))
}

fn os(result: mc_win::Result<()>) -> CommandResult<ActionResult> {
    result.map(|()| ActionResult::default()).map_err(CommandError::from)
}

pub async fn run(app: &AppHandle, action: &str, with: &Value, confirmed: bool) -> CommandResult<ActionResult> {
    if !actions::is_known(action) {
        return Err(CommandError::new(ErrorCode::Validation, format!("There's no action called {action}.")));
    }
    if actions::needs_confirmation(action) && !confirmed {
        return Err(CommandError::new(ErrorCode::Validation, "Confirm this action first."));
    }

    if let Some(keys) = actions::keys_for(action) {
        return send_shortcut(keys).await;
    }

    match action {
        id::OMNIBAR_OPEN => {
            let view = with.get("view").and_then(Value::as_str);
            if let Some(view) = view
                && !actions::OMNIBAR_VIEWS.contains(&view)
            {
                return Err(CommandError::new(ErrorCode::Validation, format!("The OmniBar has no view \"{view}\".")));
            }
            overlays::show_omnibar(app, view);
            Ok(ActionResult::default())
        }
        id::SETTINGS_OPEN => {
            let page = with.get("page").and_then(Value::as_str).unwrap_or("general");
            if !actions::SETTINGS_PAGES.iter().any(|(p, _, _)| *p == page) {
                return Err(CommandError::new(ErrorCode::Validation, format!("There's no settings page \"{page}\".")));
            }
            overlays::open_settings(app, page);
            Ok(ActionResult::default())
        }
        id::SYNC_NOW => {
            let report = sync_loop::run(app).await?;
            Ok(ActionResult::say(match report.pulled + report.pushed {
                0 => "Everything's in sync".to_owned(),
                n => format!("Synced {n} change{}", if n == 1 { "" } else { "s" }),
            }))
        }
        id::EDITOR_OPEN => {
            editor::show(app)?;
            Ok(ActionResult::default())
        }
        id::UPDATE_CHECK => {
            let status = updates::check_now(app).await?;
            Ok(ActionResult::say(match (status.state, status.version) {
                (updates::UpdateState::UpToDate, _) => "MouseComb is up to date".to_owned(),
                (_, Some(v)) => format!("Downloading version {v}"),
                _ => "Checking for updates".to_owned(),
            }))
        }
        id::UPDATE_INSTALL => updates::install(app).map(|()| ActionResult::default()),
        id::QUIT => {
            crate::quit(app);
            Ok(ActionResult::default())
        }
        id::SETTING_TOGGLE => {
            let key = arg(with, "key")?;
            let Some(default) = prefs::toggle_default(key) else {
                return Err(CommandError::new(ErrorCode::Validation, format!("{key} can't be toggled.")));
            };
            let store = &app.state::<AppState>().store;
            let current = prefs::setting(store, key).and_then(|v| v.as_bool()).unwrap_or(default);
            store.put(mc_core::kind::SETTING, key, Value::Bool(!current))?;
            Ok(ActionResult::default())
        }
        id::POMODORO_EXTEND => {
            let minutes = match with.get("minutes") {
                None | Some(Value::Null) => actions::DEFAULT_EXTEND_MIN,
                Some(v) => v
                    .as_u64()
                    .filter(|m| (1..=60).contains(m))
                    .and_then(|m| u32::try_from(m).ok())
                    .ok_or_else(|| CommandError::new(ErrorCode::Validation, "Add 1 to 60 minutes."))?,
            };
            let timer = pomodoro::update(app, |p, now, _| p.extend(minutes, now));
            let left = (timer.remaining(crate::now_ms()) + 59_999) / 60_000;
            Ok(ActionResult::say(format!("+{minutes} min · {left} min left")))
        }
        id::POMODORO_START | id::POMODORO_PAUSE | id::POMODORO_TOGGLE | id::POMODORO_SKIP | id::POMODORO_RESET => {
            let timer = pomodoro::update(app, |p, now, cfg| match action {
                id::POMODORO_START => p.start(now),
                id::POMODORO_PAUSE => p.pause(now),
                id::POMODORO_TOGGLE => p.toggle(now),
                id::POMODORO_SKIP => p.skip(now, cfg),
                _ => p.reset(cfg),
            });
            let phase = pomodoro::phase_name(timer.phase);
            Ok(ActionResult::say(match (action, timer.running()) {
                (id::POMODORO_RESET, _) => "Pomodoro reset".to_owned(),
                (_, true) => format!("{phase} started"),
                (_, false) => format!("{phase} paused"),
            }))
        }
        id::SNIPPET_COPY => {
            let (snippet, text) = filled_snippet(app, arg(with, "id")?)?;
            set_clipboard(app, &text)?;
            Ok(ActionResult::say(format!("Copied “{}”", snippet.title)))
        }
        id::SNIPPET_TYPE => type_snippet(app, arg(with, "id")?).await,
        id::INPUT_TOGGLE => {
            let on = !app.state::<AppState>().prefs().input_enabled;
            engine::set_enabled(app, on)?;
            Ok(ActionResult::say(if on { "Hotkeys are on" } else { "Hotkeys are off" }))
        }
        id::INPUT_SEND => send_shortcut(arg(with, "keys")?).await,
        id::CLIPBOARD_SET => {
            let text = with.get("text").and_then(Value::as_str).unwrap_or_default();
            set_clipboard(app, text)?;
            Ok(ActionResult::say("Copied"))
        }
        id::OPEN_URL => {
            let url = arg(with, "url")?;
            if !actions::is_web_url(url) {
                return Err(CommandError::new(ErrorCode::Validation, "Only web addresses can be opened."));
            }
            open(app, url)
        }
        id::WINDOWS_SETTINGS => {
            let page = arg(with, "page")?;
            let uri = actions::windows_settings_uri(page)
                .ok_or_else(|| CommandError::new(ErrorCode::Validation, "That Windows Settings page isn't offered."))?;
            if !cfg!(windows) {
                return Err(mc_win::Error::Unsupported.into());
            }
            open(app, &uri)
        }
        id::APP_LAUNCH => os(mc_win::apps::launch(arg(with, "id")?)),
        id::LOCK => os(mc_win::power::lock()),
        id::SLEEP => os(mc_win::power::sleep()),
        id::SIGN_OUT => os(mc_win::power::sign_out()),
        id::RESTART => os(mc_win::power::restart()),
        id::SHUT_DOWN => os(mc_win::power::shut_down()),
        other => Err(CommandError::new(ErrorCode::Validation, format!("{other} can't run from here yet."))),
    }
}

/// A snippet and its text with `{DATE}`, `{TIME}`, `{USER}` and `{CLIPBOARD}` filled in.
fn filled_snippet(app: &AppHandle, id: &str) -> CommandResult<(mc_core::Snippet, String)> {
    let store = &app.state::<AppState>().store;
    let snippet = store
        .get(mc_core::kind::SNIPPET, id)?
        .as_ref()
        .and_then(mc_core::Snippet::from_item)
        .ok_or_else(|| CommandError::new(ErrorCode::Validation, "That snippet was deleted."))?;
    let now = chrono::Local::now();
    let (date, time) = (now.format("%Y-%m-%d").to_string(), now.format("%H:%M:%S").to_string());
    let user = std::env::var("USERNAME").or_else(|_| std::env::var("USER")).unwrap_or_default();
    // Reading the clipboard can be slow (the owning app renders it), so only when used.
    let clipboard = if snippet.text.contains("{CLIPBOARD}") {
        app.clipboard().read_text().unwrap_or_default()
    } else {
        String::new()
    };
    let tokens = mc_core::SnippetTokens { date: &date, time: &time, user: &user, clipboard: &clipboard };
    let text = mc_core::fill_snippet(&snippet.text, &tokens);
    Ok((snippet, text))
}

/// Type a snippet into the program that had focus (FEAT-005b). Windows types it; elsewhere it's copied.
async fn type_snippet(app: &AppHandle, id: &str) -> CommandResult<ActionResult> {
    let (snippet, text) = filled_snippet(app, id)?;
    if !cfg!(windows) {
        set_clipboard(app, &text)?;
        return Ok(ActionResult::say(format!("Copied “{}”: press Ctrl+V", snippet.title)));
    }
    // From the OmniBar: let it close and focus return before typing.
    overlays::hide_omnibar(app);
    tokio::time::sleep(std::time::Duration::from_millis(180)).await;
    tauri::async_runtime::spawn_blocking(move || mc_win::keys::type_text(&text))
        .await
        .map_err(|e| CommandError::new(ErrorCode::System, e.to_string()))??;
    Ok(ActionResult::say(format!("Typed “{}”", snippet.title)))
}

/// Press a key combination such as `Ctrl+Shift+T` or `MediaPlayPause`.
async fn send_shortcut(keys: &str) -> CommandResult<ActionResult> {
    let (modifiers, key) = mc_core::input::combo_vks(keys)
        .ok_or_else(|| CommandError::new(ErrorCode::Validation, format!("MouseComb can't press \"{keys}\".")))?;
    tauri::async_runtime::spawn_blocking(move || mc_win::keys::send_combo(&modifiers, key))
        .await
        .map_err(|e| CommandError::new(ErrorCode::System, e.to_string()))??;
    Ok(ActionResult::default())
}

fn set_clipboard(app: &AppHandle, text: &str) -> CommandResult<()> {
    app.clipboard()
        .write_text(text)
        .map_err(|e| CommandError::new(ErrorCode::System, format!("Couldn't copy to the clipboard: {e}")))
}

fn open(app: &AppHandle, target: &str) -> CommandResult<ActionResult> {
    app.opener()
        .open_url(target, None::<&str>)
        .map(|()| ActionResult::default())
        .map_err(|e| CommandError::new(ErrorCode::System, format!("Couldn't open {target}: {e}")))
}

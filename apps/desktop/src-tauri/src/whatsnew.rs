//! Shows What's New once after an update (FEAT-022).
//!
//! The version last shown is a device-only setting. A new install records it
//! quietly (Welcome is on screen anyway); an update opens the page a moment
//! after start. A hidden start (Windows login) shows nothing and waits for
//! the next visible launch.

use std::time::Duration;

use serde_json::{Value, json};
use tauri::{AppHandle, Manager};

use crate::{overlays, state::AppState, updates};

const SEEN_KEY: &str = "whatsnew.seen";
const ONBOARDING_KEY: &str = "onboarding.done";
/// Long enough for the main window to finish loading its first page.
const DELAY: Duration = Duration::from_millis(2500);

#[derive(Debug, PartialEq, Eq)]
enum Plan {
    Nothing,
    /// Remember this version without showing anything.
    Record,
    Show,
}

fn plan(seen: Option<&str>, current: &str, onboarded: bool, hidden_start: bool) -> Plan {
    if seen == Some(current) {
        Plan::Nothing
    } else if !onboarded {
        Plan::Record
    } else if hidden_start {
        Plan::Nothing
    } else {
        Plan::Show
    }
}

pub fn start(app: AppHandle, hidden_start: bool) {
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(DELAY).await;
        let state = app.state::<AppState>();
        let v = &app.package_info().version;
        let current = updates::display_version(v.major, v.minor, v.patch);
        let seen = state.store.local_get(SEEN_KEY).ok().flatten();
        let onboarded = state.store.local_get(ONBOARDING_KEY).ok().flatten() == Some(Value::Bool(true));
        match plan(seen.as_ref().and_then(Value::as_str), &current, onboarded, hidden_start) {
            Plan::Nothing => {}
            Plan::Record => {
                let _ = state.store.local_set(SEEN_KEY, &json!(current));
            }
            Plan::Show => {
                if state.store.local_set(SEEN_KEY, &json!(current)).is_ok() {
                    overlays::open_settings(&app, "whats-new");
                }
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shows_once_per_version_to_people_who_have_set_up() {
        assert_eq!(plan(Some("0.1.0+2"), "0.1.0+2", true, false), Plan::Nothing);
        assert_eq!(plan(Some("0.0.0+1"), "0.1.0+2", true, false), Plan::Show);
        // An update from a build that never recorded a version.
        assert_eq!(plan(None, "0.1.0+2", true, false), Plan::Show);
    }

    #[test]
    fn a_new_install_records_quietly() {
        assert_eq!(plan(None, "0.1.0+2", false, false), Plan::Record);
        assert_eq!(plan(Some("0.0.0+1"), "0.1.0+2", false, false), Plan::Record);
    }

    #[test]
    fn a_hidden_start_waits_for_the_next_visible_launch() {
        assert_eq!(plan(Some("0.0.0+1"), "0.1.0+2", true, true), Plan::Nothing);
    }
}

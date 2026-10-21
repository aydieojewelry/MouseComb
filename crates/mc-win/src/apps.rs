//! Apps in the Start menu, desktop and Store apps alike (FEAT-023 app launcher).
//!
//! `Get-StartApps` lists exactly what Start shows, with an AppID that
//! `shell:AppsFolder` can launch, so one code path covers .exe shortcuts and
//! packaged apps. It takes about a second, so callers cache the result.

use serde::{Deserialize, Serialize};

use crate::{Error, Result};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "specta", derive(specta::Type))]
pub struct App {
    pub name: String,
    /// What `launch` takes: a Start menu AppID.
    pub id: String,
}

#[derive(Deserialize)]
struct StartApp {
    #[serde(rename = "Name")]
    name: Option<String>,
    #[serde(rename = "AppID")]
    app_id: Option<String>,
}

/// Parse `Get-StartApps | ConvertTo-Json` output: one object or an array.
/// Uninstallers and blank entries are dropped; names are sorted, no duplicates.
pub fn parse_start_apps(json: &str) -> Vec<App> {
    let rows: Vec<StartApp> = match serde_json::from_str::<serde_json::Value>(json.trim_start_matches('\u{feff}')) {
        Ok(v @ serde_json::Value::Array(_)) => serde_json::from_value(v).unwrap_or_default(),
        Ok(v @ serde_json::Value::Object(_)) => serde_json::from_value(v).map(|one| vec![one]).unwrap_or_default(),
        _ => Vec::new(),
    };
    let mut apps: Vec<App> = rows
        .into_iter()
        .filter_map(|r| {
            let name = r.name?.trim().to_owned();
            let id = r.app_id?.trim().to_owned();
            let lower = name.to_lowercase();
            (!name.is_empty() && !id.is_empty() && !lower.starts_with("uninstall") && !lower.contains("uninstaller"))
                .then_some(App { name, id })
        })
        .collect();
    apps.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()).then(a.id.cmp(&b.id)));
    apps.dedup_by(|a, b| a.id == b.id);
    apps
}

/// AppIDs are paths, AUMIDs (`Pkg_hash!App`) or GUID-prefixed paths. Refuse
/// anything that could turn the `explorer.exe` argument into something else.
pub fn is_safe_app_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 1024 && !id.chars().any(|c| c.is_control() || matches!(c, '"' | '<' | '>' | '|'))
}

#[cfg(windows)]
pub fn list() -> Result<Vec<App>> {
    use std::process::Command;
    let script = "[Console]::OutputEncoding = [Text.Encoding]::UTF8; \
                  Get-StartApps | Select-Object Name, AppID | ConvertTo-Json -Compress";
    let out = crate::quiet(Command::new("powershell.exe").args([
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        script,
    ]))
    .output()
    .map_err(|e| Error::Os(e.to_string()))?;
    if !out.status.success() {
        return Err(Error::Os(String::from_utf8_lossy(&out.stderr).trim().to_owned()));
    }
    Ok(parse_start_apps(&String::from_utf8_lossy(&out.stdout)))
}

#[cfg(not(windows))]
pub fn list() -> Result<Vec<App>> {
    Err(Error::Unsupported)
}

#[cfg(windows)]
pub fn launch(id: &str) -> Result<()> {
    if !is_safe_app_id(id) {
        return Err(Error::Os("That app id isn't valid.".into()));
    }
    std::process::Command::new("explorer.exe")
        .arg(format!("shell:AppsFolder\\{id}"))
        .spawn()
        .map(drop)
        .map_err(|e| Error::Os(e.to_string()))
}

#[cfg(not(windows))]
pub fn launch(_id: &str) -> Result<()> {
    Err(Error::Unsupported)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_arrays_single_objects_and_bom() {
        let many = r#"[{"Name":"Visual Studio Code","AppID":"Microsoft.VisualStudioCode"},
                       {"Name":"Calculator","AppID":"Microsoft.WindowsCalculator_8wekyb3d8bbwe!App"},
                       {"Name":"Uninstall Foo","AppID":"{6D809377}\\Foo\\uninst.exe"},
                       {"Name":"  ","AppID":"x"},
                       {"Name":"Calculator","AppID":"Microsoft.WindowsCalculator_8wekyb3d8bbwe!App"},
                       {"Name":"Paint","AppID":null}]"#;
        let apps = parse_start_apps(many);
        let names: Vec<_> = apps.iter().map(|a| a.name.as_str()).collect();
        assert_eq!(names, ["Calculator", "Visual Studio Code"]);

        let one = "\u{feff}{\"Name\":\"Notepad\",\"AppID\":\"Microsoft.WindowsNotepad_8wekyb3d8bbwe!App\"}";
        assert_eq!(parse_start_apps(one).len(), 1);
        assert!(parse_start_apps("").is_empty());
        assert!(parse_start_apps("not json").is_empty());
    }

    #[test]
    fn app_ids_cannot_smuggle_arguments() {
        assert!(is_safe_app_id("Microsoft.WindowsCalculator_8wekyb3d8bbwe!App"));
        assert!(is_safe_app_id("{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\notepad.exe"));
        assert!(!is_safe_app_id("x\" /c calc"));
        assert!(!is_safe_app_id("a\nb"));
        assert!(!is_safe_app_id(""));
    }
}

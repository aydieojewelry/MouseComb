//! MouseComb data model and sync rules.
//!
//! Everything the user owns is an [`Item`]: a `kind` (what it is), a `key`
//! (which one), a JSON `data` payload and a last-modified time. The same shape
//! is stored locally, sent to the backend and shared with the mobile app.
//! This crate makes no OS calls (APP_SPEC §3).

pub mod actions;
pub mod pomodoro;

use rand::RngExt;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};

/// Built-in item kinds. Extensions store their data under [`kind::EXTENSION`]
/// with a key of `"<extension id>/<key>"`, so new data needs no schema change.
pub mod kind {
    pub const SETTING: &str = "setting";
    pub const SNIPPET: &str = "snippet";
    pub const EXTENSION: &str = "ext";
    /// A finished Pomodoro focus session (FEAT-002 stats).
    pub const POMODORO: &str = "pomodoro";
}

/// Length and alphabet of record ids, matching PocketBase's default id field.
pub const ID_LEN: usize = 15;
const ID_ALPHABET: &[u8; 36] = b"abcdefghijklmnopqrstuvwxyz0123456789";

/// One synced record.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "specta", derive(specta::Type))]
pub struct Item {
    pub kind: String,
    pub key: String,
    /// Any JSON. Exported to TypeScript as `unknown`: the UI validates it.
    #[cfg_attr(feature = "specta", specta(type = specta_typescript::Unknown))]
    pub data: Value,
    /// Milliseconds since the Unix epoch, set by the device that made the change.
    /// Specta exports this as a TS `number`; millisecond timestamps stay well
    /// inside the 2^53 range JS numbers represent exactly.
    #[cfg_attr(feature = "specta", specta(type = specta_typescript::Number))]
    pub mtime: i64,
    /// Deleted items are kept as tombstones so the deletion syncs.
    pub deleted: bool,
    /// Id of the device that made the last change.
    pub device: String,
}

/// What to do when a remote copy of an item arrives.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Merge {
    /// The remote copy is newer: replace the local one.
    TakeRemote,
    /// The local copy is newer: keep it (and push it).
    KeepLocal,
    /// Both copies are identical.
    Same,
}

/// Last writer wins, per item. Equal timestamps with different content are
/// settled by device id so every device reaches the same answer.
pub fn merge(local: Option<&Item>, remote: &Item) -> Merge {
    let Some(local) = local else {
        return Merge::TakeRemote;
    };
    if remote.mtime > local.mtime {
        return Merge::TakeRemote;
    }
    if remote.mtime < local.mtime {
        return Merge::KeepLocal;
    }
    if remote.data == local.data && remote.deleted == local.deleted {
        return Merge::Same;
    }
    if remote.device > local.device { Merge::TakeRemote } else { Merge::KeepLocal }
}

/// The backend record id for an item: stable for the same user, kind and key,
/// so two devices that create the same setting write to the same record.
pub fn remote_id(user_id: &str, kind: &str, key: &str) -> String {
    let digest = Sha256::digest(format!("{user_id}\u{1f}{kind}\u{1f}{key}").as_bytes());
    let mut n = u128::from_be_bytes(digest[..16].try_into().expect("16 bytes"));
    let mut id = String::with_capacity(ID_LEN);
    for _ in 0..ID_LEN {
        id.push(ID_ALPHABET[(n % 36) as usize] as char);
        n /= 36;
    }
    id
}

/// A fresh random key for new items such as snippets.
pub fn new_key() -> String {
    let mut rng = rand::rng();
    (0..ID_LEN).map(|_| ID_ALPHABET[rng.random_range(0..ID_ALPHABET.len())] as char).collect()
}

/// Modification times only move forward on a device, even if the clock jumps back.
pub fn next_mtime(now_ms: i64, last_mtime: i64) -> i64 {
    now_ms.max(last_mtime + 1)
}

/// Item kinds use the same pattern the backend enforces.
pub fn is_valid_kind(kind: &str) -> bool {
    let mut chars = kind.chars();
    matches!(chars.next(), Some('a'..='z'))
        && kind.len() <= 64
        && chars.all(|c| matches!(c, 'a'..='z' | '0'..='9' | '_' | '.' | '-'))
}

/// A text snippet (bundled `mc.snippets` extension data, stored as a core kind
/// so the OmniBar and phone can read it without the extension running).
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "specta", derive(specta::Type))]
pub struct Snippet {
    pub id: String,
    pub title: String,
    pub text: String,
    #[serde(default)]
    pub tags: Vec<String>,
    #[cfg_attr(feature = "specta", specta(type = specta_typescript::Number))]
    pub updated: i64,
}

/// The editable part of a snippet.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "specta", derive(specta::Type))]
pub struct SnippetInput {
    pub title: String,
    pub text: String,
    #[serde(default)]
    pub tags: Vec<String>,
}

impl Snippet {
    pub fn from_item(item: &Item) -> Option<Self> {
        if item.kind != kind::SNIPPET || item.deleted {
            return None;
        }
        let input: SnippetInput = serde_json::from_value(item.data.clone()).ok()?;
        Some(Self { id: item.key.clone(), title: input.title, text: input.text, tags: input.tags, updated: item.mtime })
    }
}

impl SnippetInput {
    pub fn to_data(&self) -> Value {
        serde_json::to_value(self).expect("snippet serializes")
    }
}

/// Values for the tokens a snippet can contain (FEAT-005b).
pub struct SnippetTokens<'a> {
    /// `2026-10-17`
    pub date: &'a str,
    /// `14:05:09`
    pub time: &'a str,
    pub user: &'a str,
    pub clipboard: &'a str,
}

/// The text a snippet inserts: tokens filled, `\n` turned into a line break.
/// The Settings preview (`previewSnippet` in `packages/data`) follows the same rules.
pub fn fill_snippet(text: &str, t: &SnippetTokens<'_>) -> String {
    text.replace("{DATE}", t.date)
        .replace("{TIME}", t.time)
        .replace("{USER}", t.user)
        .replace("{CLIPBOARD}", t.clipboard)
        .replace("\\n", "\n")
}

/// The settings key for an extension's own data.
pub fn extension_key(extension_id: &str, key: &str) -> String {
    format!("{extension_id}/{key}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn item(mtime: i64, device: &str, data: Value) -> Item {
        Item { kind: kind::SNIPPET.into(), key: "k".into(), data, mtime, deleted: false, device: device.into() }
    }

    #[test]
    fn newer_side_wins() {
        let old = item(1, "a", json!(1));
        let new = item(2, "b", json!(2));
        assert_eq!(merge(Some(&old), &new), Merge::TakeRemote);
        assert_eq!(merge(Some(&new), &old), Merge::KeepLocal);
        assert_eq!(merge(None, &old), Merge::TakeRemote);
    }

    #[test]
    fn ties_are_settled_the_same_way_on_both_devices() {
        let a = item(5, "device-a", json!("a"));
        let b = item(5, "device-b", json!("b"));
        // Device A receives B's copy, device B receives A's copy: both keep "b".
        assert_eq!(merge(Some(&a), &b), Merge::TakeRemote);
        assert_eq!(merge(Some(&b), &a), Merge::KeepLocal);
        assert_eq!(merge(Some(&a), &a.clone()), Merge::Same);
    }

    #[test]
    fn remote_ids_are_stable_and_backend_safe() {
        let id = remote_id("user1", "setting", "hud.fade_near_px");
        assert_eq!(id, remote_id("user1", "setting", "hud.fade_near_px"));
        assert_ne!(id, remote_id("user2", "setting", "hud.fade_near_px"));
        assert_eq!(id.len(), ID_LEN);
        assert!(id.bytes().all(|b| ID_ALPHABET.contains(&b)));
        let key = new_key();
        assert_eq!(key.len(), ID_LEN);
        assert!(key.bytes().all(|b| ID_ALPHABET.contains(&b)));
    }

    #[test]
    fn mtime_never_goes_backwards() {
        assert_eq!(next_mtime(100, 50), 100);
        assert_eq!(next_mtime(100, 100), 101);
        assert_eq!(next_mtime(10, 500), 501);
    }

    #[test]
    fn kinds_follow_backend_pattern() {
        assert!(is_valid_kind("setting"));
        assert!(is_valid_kind("ext"));
        assert!(!is_valid_kind("Setting"));
        assert!(!is_valid_kind("1abc"));
        assert!(!is_valid_kind(""));
    }

    #[test]
    fn snippet_tokens_fill_like_the_preview() {
        let t = SnippetTokens { date: "2026-10-17", time: "14:05:09", user: "ali", clipboard: "{DATE}" };
        assert_eq!(fill_snippet("[{TIME}] {USER}\\n{CLIPBOARD}", &t), "[14:05:09] ali\n{DATE}");
        assert_eq!(fill_snippet("{DATE}{DATE}", &t), "2026-10-172026-10-17");
    }

    #[test]
    fn snippets_round_trip_through_items() {
        let input = SnippetInput { title: "Date".into(), text: "{DATE}".into(), tags: vec![] };
        let it = Item {
            kind: kind::SNIPPET.into(),
            key: "abc".into(),
            data: input.to_data(),
            mtime: 9,
            deleted: false,
            device: "d".into(),
        };
        let s = Snippet::from_item(&it).unwrap();
        assert_eq!((s.id.as_str(), s.title.as_str(), s.updated), ("abc", "Date", 9));
        let gone = Item { deleted: true, ..it };
        assert!(Snippet::from_item(&gone).is_none());
    }
}

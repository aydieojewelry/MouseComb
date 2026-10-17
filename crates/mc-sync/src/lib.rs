//! MouseComb accounts and sync (APP_SPEC §5, FEAT-020).
//!
//! The app talks to the backend only through [`Backend`], so PocketBase (the
//! default, [`PocketBase`]) can be swapped for another service such as
//! Firebase without touching the store or the UI.

mod pocketbase;

use std::future::Future;

use mc_core::Item;
use mc_store::Store;
use serde::{Deserialize, Serialize};

pub use pocketbase::PocketBase;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("Email or password is incorrect.")]
    InvalidCredentials,
    #[error("Your session has expired. Sign in again.")]
    Unauthorized,
    #[error("{0}")]
    Validation(String),
    #[error("Too many attempts. Wait a few seconds and try again.")]
    RateLimited,
    #[error("Can't reach the sync server: {0}")]
    Network(String),
    #[error("The sync server answered with an error ({status}): {message}")]
    Server { status: u16, message: String },
    #[error(transparent)]
    Store(#[from] mc_store::Error),
}

pub type Result<T> = std::result::Result<T, Error>;

/// A signed-in account on one backend.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Session {
    pub backend_url: String,
    pub user_id: String,
    pub email: String,
    pub token: String,
}

/// What the UI may know about the account (no token).
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "specta", derive(specta::Type))]
pub struct Account {
    pub backend_url: String,
    pub user_id: String,
    pub email: String,
}

impl From<&Session> for Account {
    fn from(s: &Session) -> Self {
        Self { backend_url: s.backend_url.clone(), user_id: s.user_id.clone(), email: s.email.clone() }
    }
}

/// An item as stored on the backend, with the server's change time used for paging.
#[derive(Clone, Debug, PartialEq)]
pub struct RemoteItem {
    pub id: String,
    pub item: Item,
    pub updated: String,
}

/// Where the last pull stopped: the server change time and record id of the last item seen.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Cursor {
    pub updated: String,
    pub id: String,
}

impl Cursor {
    fn encode(&self) -> String {
        format!("{}|{}", self.updated, self.id)
    }

    fn decode(raw: &str) -> Option<Self> {
        let (updated, id) = raw.split_once('|')?;
        Some(Self { updated: updated.into(), id: id.into() })
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PushOutcome {
    Saved,
    /// The backend already has a newer copy; the next pull brings it down.
    Stale,
}

#[derive(Clone, Debug)]
pub struct DeviceInfo {
    pub device_id: String,
    pub name: String,
    pub platform: String,
    pub app_version: String,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "specta", derive(specta::Type))]
pub struct SyncReport {
    pub pulled: u32,
    pub pushed: u32,
    pub stale: u32,
}

/// A sync backend. Implementations must be cheap to clone or share.
pub trait Backend: Send + Sync {
    fn sign_up(&self, email: &str, password: &str) -> impl Future<Output = Result<Session>> + Send;
    fn sign_in(&self, email: &str, password: &str) -> impl Future<Output = Result<Session>> + Send;
    /// Exchange a still-valid token for a fresh one.
    fn refresh(&self, session: &Session) -> impl Future<Output = Result<Session>> + Send;
    /// Items changed after `after`, oldest first, at most `limit`.
    fn pull(
        &self,
        session: &Session,
        after: Option<&Cursor>,
        limit: u32,
    ) -> impl Future<Output = Result<Vec<RemoteItem>>> + Send;
    fn push(&self, session: &Session, item: &Item) -> impl Future<Output = Result<PushOutcome>> + Send;
    fn register_device(&self, session: &Session, device: &DeviceInfo) -> impl Future<Output = Result<()>> + Send;
}

const PULL_PAGE: u32 = 200;

fn cursor_key(user_id: &str) -> String {
    format!("sync.cursor.{user_id}")
}

/// Call after every successful sign-in. If this device was last used with a
/// different account (or none), its local data is queued to join this one.
pub fn adopt_account(store: &Store, session: &Session) -> Result<()> {
    let last = store.meta_get("account.last_user")?;
    if last.as_deref() != Some(session.user_id.as_str()) {
        store.mark_all_dirty()?;
        store.meta_remove(&cursor_key(&session.user_id))?;
        store.meta_set("account.last_user", &session.user_id)?;
    }
    Ok(())
}

/// Pull remote changes, then push local ones. Safe to call at any time and
/// repeatedly; an interrupted sync resumes where it stopped.
pub async fn sync<B: Backend>(backend: &B, store: &Store, session: &Session) -> Result<SyncReport> {
    let mut report = SyncReport::default();
    let key = cursor_key(&session.user_id);
    let mut cursor = store.meta_get(&key)?.as_deref().and_then(Cursor::decode);

    loop {
        let page = backend.pull(session, cursor.as_ref(), PULL_PAGE).await?;
        let full = page.len() as u32 == PULL_PAGE;
        for remote in &page {
            if store.apply_remote(&remote.item)? == mc_core::Merge::TakeRemote {
                report.pulled += 1;
            }
        }
        if let Some(last) = page.last() {
            let next = Cursor { updated: last.updated.clone(), id: last.id.clone() };
            store.meta_set(&key, &next.encode())?;
            cursor = Some(next);
        }
        if !full {
            break;
        }
    }

    for item in store.dirty()? {
        match backend.push(session, &item).await? {
            PushOutcome::Saved => {
                store.mark_clean(&item)?;
                report.pushed += 1;
            }
            PushOutcome::Stale => report.stale += 1,
        }
    }

    Ok(report)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cursor_round_trips() {
        let c = Cursor { updated: "2026-10-17 17:28:51.957Z".into(), id: "abc".into() };
        assert_eq!(Cursor::decode(&c.encode()), Some(c));
        assert_eq!(Cursor::decode("garbage"), None);
    }

    #[test]
    fn adopting_a_new_account_queues_local_data() {
        let store = Store::open_in_memory().unwrap();
        let item = store.put(mc_core::kind::SNIPPET, "a", serde_json::json!(1)).unwrap();
        store.mark_clean(&item).unwrap();
        let session = |user: &str| Session {
            backend_url: "http://x".into(),
            user_id: user.into(),
            email: "e".into(),
            token: "t".into(),
        };

        adopt_account(&store, &session("u1")).unwrap();
        assert_eq!(store.dirty().unwrap().len(), 1);

        store.mark_clean(&item).unwrap();
        adopt_account(&store, &session("u1")).unwrap();
        assert!(store.dirty().unwrap().is_empty(), "same account again: nothing to re-upload");

        adopt_account(&store, &session("u2")).unwrap();
        assert_eq!(store.dirty().unwrap().len(), 1);
    }
}

//! Where the sign-in session is kept between launches.
//!
//! Windows: Windows Credential Manager. Other platforms (development builds
//! only, until their stores are added): the local database, with a warning.

use mc_store::Store;
use mc_sync::Session;

const SERVICE: &str = "MouseComb";
const ACCOUNT: &str = "session";

pub fn load(store: &Store) -> Option<Session> {
    let raw = imp::get(store)?;
    serde_json::from_str(&raw).ok()
}

pub fn save(store: &Store, session: &Session) {
    let raw = serde_json::to_string(session).expect("session serializes");
    if let Err(e) = imp::set(store, &raw) {
        log::error!("couldn't save the session: {e}");
    }
}

pub fn clear(store: &Store) {
    if let Err(e) = imp::delete(store) {
        log::warn!("couldn't remove the saved session: {e}");
    }
}

#[cfg(windows)]
mod imp {
    use super::{ACCOUNT, SERVICE};
    use mc_store::Store;
    use std::sync::Once;

    fn entry() -> Result<keyring_core::Entry, String> {
        static INIT: Once = Once::new();
        INIT.call_once(|| match windows_native_keyring_store::Store::new() {
            Ok(store) => keyring_core::set_default_store(store),
            Err(e) => log::error!("Windows Credential Manager unavailable: {e}"),
        });
        keyring_core::Entry::new(SERVICE, ACCOUNT).map_err(|e| e.to_string())
    }

    pub fn get(_: &Store) -> Option<String> {
        entry().ok()?.get_password().ok()
    }

    pub fn set(_: &Store, value: &str) -> Result<(), String> {
        entry()?.set_password(value).map_err(|e| e.to_string())
    }

    pub fn delete(_: &Store) -> Result<(), String> {
        match entry()?.delete_credential() {
            Ok(()) | Err(keyring_core::Error::NoEntry) => Ok(()),
            Err(e) => Err(e.to_string()),
        }
    }
}

#[cfg(not(windows))]
mod imp {
    use super::{ACCOUNT, SERVICE};
    use mc_store::Store;

    fn key() -> String {
        format!("secret.{SERVICE}.{ACCOUNT}")
    }

    pub fn get(store: &Store) -> Option<String> {
        store.meta_get(&key()).ok().flatten()
    }

    pub fn set(store: &Store, value: &str) -> Result<(), String> {
        log::warn!("no OS credential store on this platform yet; keeping the session in the local database");
        store.meta_set(&key(), value).map_err(|e| e.to_string())
    }

    pub fn delete(store: &Store) -> Result<(), String> {
        store.meta_remove(&key()).map_err(|e| e.to_string())
    }
}

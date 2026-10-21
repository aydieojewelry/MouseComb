//! MouseComb local store: one SQLite file per device (APP_SPEC §5).
//!
//! Every write is local first, so the app works offline. Changed items are
//! flagged `dirty` until the sync client confirms the backend has them.

use std::path::Path;
use std::sync::{Arc, Mutex, MutexGuard, RwLock};
use std::time::{SystemTime, UNIX_EPOCH};

use mc_core::{Item, Merge, is_valid_kind, merge, new_key, next_mtime};
use rusqlite::{Connection, OptionalExtension, Row, params};
use serde_json::Value;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("database error: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("stored data is not valid JSON: {0}")]
    Json(#[from] serde_json::Error),
    #[error("\"{0}\" is not a valid item kind")]
    InvalidKind(String),
}

pub type Result<T> = std::result::Result<T, Error>;

/// Called with the item kind after any change, local or from sync.
pub type ChangeListener = Arc<dyn Fn(&str) + Send + Sync>;

/// Schema steps, applied in order and tracked with `PRAGMA user_version`.
const MIGRATIONS: &[&str] = &[
    // 1: synced items, device-only settings, and bookkeeping
    "CREATE TABLE items (
        kind    TEXT    NOT NULL,
        key     TEXT    NOT NULL,
        data    TEXT    NOT NULL,
        mtime   INTEGER NOT NULL,
        deleted INTEGER NOT NULL DEFAULT 0,
        device  TEXT    NOT NULL,
        dirty   INTEGER NOT NULL DEFAULT 1,
        PRIMARY KEY (kind, key)
    );
    CREATE INDEX idx_items_dirty ON items (dirty) WHERE dirty = 1;
    CREATE TABLE local_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);",
];

pub struct Store {
    conn: Mutex<Connection>,
    device_id: String,
    listener: RwLock<Option<ChangeListener>>,
}

impl Store {
    pub fn open(path: &Path) -> Result<Self> {
        if let Some(dir) = path.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        let conn = Connection::open(path)?;
        conn.execute_batch("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;")?;
        Self::init(conn)
    }

    pub fn open_in_memory() -> Result<Self> {
        Self::init(Connection::open_in_memory()?)
    }

    fn init(conn: Connection) -> Result<Self> {
        conn.execute_batch("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;")?;
        let version: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;
        for (i, step) in MIGRATIONS.iter().enumerate().skip(version.max(0) as usize) {
            let tx = conn.unchecked_transaction()?;
            tx.execute_batch(step)?;
            tx.execute_batch(&format!("PRAGMA user_version = {}", i + 1))?;
            tx.commit()?;
        }

        let device_id = match meta_get(&conn, "device_id")? {
            Some(id) => id,
            None => {
                let id = format!("dev_{}", new_key());
                meta_set(&conn, "device_id", &id)?;
                id
            }
        };

        Ok(Self { conn: Mutex::new(conn), device_id, listener: RwLock::new(None) })
    }

    /// This device's id, created on first run and never changed.
    pub fn device_id(&self) -> &str {
        &self.device_id
    }

    pub fn set_listener(&self, listener: Option<ChangeListener>) {
        *self.listener.write().expect("listener lock") = listener;
    }

    /// Create or replace an item. Returns the stored item.
    pub fn put(&self, kind: &str, key: &str, data: Value) -> Result<Item> {
        check_kind(kind)?;
        let item = {
            let conn = self.conn();
            let last = get_item(&conn, kind, key)?.map_or(0, |i| i.mtime);
            let item = Item {
                kind: kind.into(),
                key: key.into(),
                data,
                mtime: next_mtime(now_ms(), last),
                deleted: false,
                device: self.device_id.clone(),
            };
            upsert(&conn, &item, true)?;
            item
        };
        self.notify(kind);
        Ok(item)
    }

    /// Mark an item deleted. The tombstone syncs so other devices delete it too.
    pub fn delete(&self, kind: &str, key: &str) -> Result<Option<Item>> {
        check_kind(kind)?;
        let item = {
            let conn = self.conn();
            let Some(existing) = get_item(&conn, kind, key)? else {
                return Ok(None);
            };
            if existing.deleted {
                return Ok(Some(existing));
            }
            let item = Item {
                data: Value::Null,
                mtime: next_mtime(now_ms(), existing.mtime),
                deleted: true,
                device: self.device_id.clone(),
                ..existing
            };
            upsert(&conn, &item, true)?;
            item
        };
        self.notify(kind);
        Ok(Some(item))
    }

    /// The item, including a tombstone if it was deleted.
    pub fn get(&self, kind: &str, key: &str) -> Result<Option<Item>> {
        get_item(&self.conn(), kind, key)
    }

    /// Live (not deleted) items of one kind, newest first.
    pub fn list(&self, kind: &str) -> Result<Vec<Item>> {
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT kind, key, data, mtime, deleted, device FROM items
             WHERE kind = ?1 AND deleted = 0 ORDER BY mtime DESC, key",
        )?;
        let rows = stmt.query_map([kind], read_item)?;
        rows.map(|r| r?.map_err(Error::from)).collect()
    }

    /// Items changed on this device that the backend doesn't have yet.
    pub fn dirty(&self) -> Result<Vec<Item>> {
        let conn = self.conn();
        let mut stmt =
            conn.prepare("SELECT kind, key, data, mtime, deleted, device FROM items WHERE dirty = 1 ORDER BY mtime")?;
        let rows = stmt.query_map([], read_item)?;
        rows.map(|r| r?.map_err(Error::from)).collect()
    }

    /// Clear the dirty flag after a push, unless the item changed again meanwhile.
    pub fn mark_clean(&self, item: &Item) -> Result<()> {
        self.conn().execute(
            "UPDATE items SET dirty = 0 WHERE kind = ?1 AND key = ?2 AND mtime = ?3",
            params![item.kind, item.key, item.mtime],
        )?;
        Ok(())
    }

    /// Merge a copy received from the backend (last writer wins).
    pub fn apply_remote(&self, remote: &Item) -> Result<Merge> {
        check_kind(&remote.kind)?;
        let outcome = {
            let conn = self.conn();
            let tx = conn.unchecked_transaction()?;
            let local = get_item(&tx, &remote.kind, &remote.key)?;
            let outcome = merge(local.as_ref(), remote);
            match outcome {
                Merge::TakeRemote => upsert(&tx, remote, false)?,
                Merge::KeepLocal => {
                    tx.execute(
                        "UPDATE items SET dirty = 1 WHERE kind = ?1 AND key = ?2",
                        params![remote.kind, remote.key],
                    )?;
                }
                Merge::Same => {
                    tx.execute(
                        "UPDATE items SET dirty = 0 WHERE kind = ?1 AND key = ?2",
                        params![remote.kind, remote.key],
                    )?;
                }
            }
            tx.commit()?;
            outcome
        };
        if outcome == Merge::TakeRemote {
            self.notify(&remote.kind);
        }
        Ok(outcome)
    }

    /// Bookkeeping values (sync cursor, account), never synced.
    pub fn meta_get(&self, key: &str) -> Result<Option<String>> {
        meta_get(&self.conn(), key)
    }

    pub fn meta_set(&self, key: &str, value: &str) -> Result<()> {
        meta_set(&self.conn(), key, value)
    }

    pub fn meta_remove(&self, key: &str) -> Result<()> {
        self.conn().execute("DELETE FROM meta WHERE key = ?1", [key])?;
        Ok(())
    }

    /// Settings that belong to this device only (APP_SPEC §5), never synced.
    pub fn local_get(&self, key: &str) -> Result<Option<Value>> {
        let raw: Option<String> =
            self.conn().query_row("SELECT value FROM local_settings WHERE key = ?1", [key], |r| r.get(0)).optional()?;
        Ok(raw.map(|s| serde_json::from_str(&s)).transpose()?)
    }

    pub fn local_set(&self, key: &str, value: &Value) -> Result<()> {
        self.conn().execute(
            "INSERT INTO local_settings (key, value) VALUES (?1, ?2)
             ON CONFLICT (key) DO UPDATE SET value = excluded.value",
            params![key, value.to_string()],
        )?;
        self.notify("local_setting");
        Ok(())
    }

    /// Queue every item for upload, e.g. when this device's data joins a newly signed-in account.
    pub fn mark_all_dirty(&self) -> Result<()> {
        self.conn().execute("UPDATE items SET dirty = 1", [])?;
        Ok(())
    }

    /// Forget everything synced (used when signing out with "remove data from this device").
    pub fn clear_synced(&self) -> Result<()> {
        self.conn().execute_batch("DELETE FROM items;")?;
        for kind in [mc_core::kind::SETTING, mc_core::kind::SNIPPET, mc_core::kind::EXTENSION] {
            self.notify(kind);
        }
        Ok(())
    }

    fn conn(&self) -> MutexGuard<'_, Connection> {
        self.conn.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    fn notify(&self, kind: &str) {
        let listener = self.listener.read().expect("listener lock").clone();
        if let Some(listener) = listener {
            listener(kind);
        }
    }
}

fn check_kind(kind: &str) -> Result<()> {
    if is_valid_kind(kind) { Ok(()) } else { Err(Error::InvalidKind(kind.into())) }
}

fn now_ms() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_millis() as i64)
}

fn read_item(row: &Row<'_>) -> rusqlite::Result<std::result::Result<Item, serde_json::Error>> {
    let data: String = row.get(2)?;
    let item = |data| Item {
        kind: row.get(0).unwrap_or_default(),
        key: row.get(1).unwrap_or_default(),
        data,
        mtime: row.get(3).unwrap_or_default(),
        deleted: row.get::<_, i64>(4).unwrap_or_default() != 0,
        device: row.get(5).unwrap_or_default(),
    };
    Ok(serde_json::from_str(&data).map(item))
}

fn get_item(conn: &Connection, kind: &str, key: &str) -> Result<Option<Item>> {
    let row = conn
        .query_row(
            "SELECT kind, key, data, mtime, deleted, device FROM items WHERE kind = ?1 AND key = ?2",
            params![kind, key],
            read_item,
        )
        .optional()?;
    Ok(row.transpose()?)
}

fn upsert(conn: &Connection, item: &Item, dirty: bool) -> Result<()> {
    conn.execute(
        "INSERT INTO items (kind, key, data, mtime, deleted, device, dirty)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT (kind, key) DO UPDATE SET
           data = excluded.data, mtime = excluded.mtime, deleted = excluded.deleted,
           device = excluded.device, dirty = excluded.dirty",
        params![item.kind, item.key, item.data.to_string(), item.mtime, item.deleted, item.device, dirty],
    )?;
    Ok(())
}

fn meta_get(conn: &Connection, key: &str) -> Result<Option<String>> {
    Ok(conn.query_row("SELECT value FROM meta WHERE key = ?1", [key], |r| r.get(0)).optional()?)
}

fn meta_set(conn: &Connection, key: &str, value: &str) -> Result<()> {
    conn.execute(
        "INSERT INTO meta (key, value) VALUES (?1, ?2) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use mc_core::kind::{SETTING, SNIPPET};
    use serde_json::json;
    use std::sync::atomic::{AtomicUsize, Ordering};

    #[test]
    fn put_get_list_and_delete() {
        let store = Store::open_in_memory().unwrap();
        store.put(SNIPPET, "a", json!({"title": "A"})).unwrap();
        store.put(SNIPPET, "b", json!({"title": "B"})).unwrap();
        store.put(SETTING, "hud.fade_near_px", json!(60)).unwrap();
        assert_eq!(store.list(SNIPPET).unwrap().len(), 2);

        let deleted = store.delete(SNIPPET, "a").unwrap().unwrap();
        assert!(deleted.deleted);
        assert_eq!(store.list(SNIPPET).unwrap().len(), 1);
        assert!(store.get(SNIPPET, "a").unwrap().unwrap().deleted, "tombstone kept for sync");
        assert!(store.delete(SNIPPET, "missing").unwrap().is_none());
    }

    #[test]
    fn rejects_invalid_kinds() {
        let store = Store::open_in_memory().unwrap();
        assert!(matches!(store.put("Bad Kind", "k", json!(1)), Err(Error::InvalidKind(_))));
    }

    #[test]
    fn dirty_until_pushed_unless_changed_again() {
        let store = Store::open_in_memory().unwrap();
        let first = store.put(SNIPPET, "a", json!(1)).unwrap();
        assert_eq!(store.dirty().unwrap().len(), 1);

        // The item changes while the push of `first` is in flight.
        let second = store.put(SNIPPET, "a", json!(2)).unwrap();
        assert!(second.mtime > first.mtime);
        store.mark_clean(&first).unwrap();
        assert_eq!(store.dirty().unwrap().len(), 1, "newer edit still needs pushing");

        store.mark_clean(&second).unwrap();
        assert!(store.dirty().unwrap().is_empty());
    }

    #[test]
    fn apply_remote_follows_last_writer_wins() {
        let store = Store::open_in_memory().unwrap();
        let local = store.put(SNIPPET, "a", json!("local")).unwrap();

        let older = Item { data: json!("old"), mtime: local.mtime - 10, device: "other".into(), ..local.clone() };
        assert_eq!(store.apply_remote(&older).unwrap(), Merge::KeepLocal);
        assert_eq!(store.get(SNIPPET, "a").unwrap().unwrap().data, json!("local"));
        assert_eq!(store.dirty().unwrap().len(), 1);

        let newer = Item { data: json!("remote"), mtime: local.mtime + 10, device: "other".into(), ..local.clone() };
        assert_eq!(store.apply_remote(&newer).unwrap(), Merge::TakeRemote);
        assert_eq!(store.get(SNIPPET, "a").unwrap().unwrap().data, json!("remote"));
        assert!(store.dirty().unwrap().is_empty(), "remote copies are not re-pushed");

        assert_eq!(store.apply_remote(&newer).unwrap(), Merge::Same);
    }

    #[test]
    fn listener_hears_local_and_remote_changes() {
        let store = Store::open_in_memory().unwrap();
        let count = Arc::new(AtomicUsize::new(0));
        let c = count.clone();
        store.set_listener(Some(Arc::new(move |_kind| {
            c.fetch_add(1, Ordering::SeqCst);
        })));
        let item = store.put(SNIPPET, "a", json!(1)).unwrap();
        store.apply_remote(&Item { mtime: item.mtime + 1, data: json!(2), ..item }).unwrap();
        store.delete(SNIPPET, "a").unwrap();
        assert_eq!(count.load(Ordering::SeqCst), 3);
    }

    #[test]
    fn survives_reopen_with_same_device_id() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("nested").join("mousecomb.db");
        let device = {
            let store = Store::open(&path).unwrap();
            store.put(SETTING, "theme", json!("dark")).unwrap();
            store.meta_set("sync.cursor", "2026-01-01").unwrap();
            store.local_set("hud.monitor", &json!(2)).unwrap();
            store.device_id().to_owned()
        };
        let store = Store::open(&path).unwrap();
        assert_eq!(store.device_id(), device);
        assert_eq!(store.get(SETTING, "theme").unwrap().unwrap().data, json!("dark"));
        assert_eq!(store.meta_get("sync.cursor").unwrap().as_deref(), Some("2026-01-01"));
        assert_eq!(store.local_get("hud.monitor").unwrap(), Some(json!(2)));
    }
}

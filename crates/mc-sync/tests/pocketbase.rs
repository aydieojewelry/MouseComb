//! Two devices syncing through a real MouseComb backend.
//!
//! Start one with `cd services/pocketbase && go run . serve --http 127.0.0.1:8090`,
//! then run `MC_TEST_PB_URL=http://127.0.0.1:8090 cargo test -p mc-sync`.
//! Without `MC_TEST_PB_URL` these tests are skipped. They take turns because
//! the backend rate-limits sign-ins per IP address.

use mc_core::{Item, SnippetInput, kind};
use mc_store::Store;
use mc_sync::{Backend, DeviceInfo, Error, PocketBase, PushOutcome, Session, adopt_account, sync};
use serde_json::json;

static ONE_AT_A_TIME: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

fn backend() -> Option<PocketBase> {
    let url = std::env::var("MC_TEST_PB_URL").ok()?;
    Some(PocketBase::new(&url).unwrap())
}

fn unique_email() -> String {
    format!("test-{}@example.com", mc_core::new_key())
}

const PASSWORD: &str = "correct-horse-1";

async fn device(pb: &PocketBase, email: &str) -> (Store, Session) {
    let store = Store::open_in_memory().unwrap();
    let session = pb.sign_in(email, PASSWORD).await.unwrap();
    adopt_account(&store, &session).unwrap();
    (store, session)
}

#[tokio::test]
async fn two_devices_stay_in_sync() {
    let Some(pb) = backend() else { return eprintln!("MC_TEST_PB_URL not set; skipping") };
    let _turn = ONE_AT_A_TIME.lock().await;
    let email = unique_email();
    pb.sign_up(&email, PASSWORD).await.unwrap();

    let (a, sa) = device(&pb, &email).await;
    let (b, sb) = device(&pb, &email).await;
    assert_ne!(a.device_id(), b.device_id());

    // A creates a snippet and a setting.
    let snippet = SnippetInput { title: "Date".into(), text: "{DATE}".into(), tags: vec![] };
    a.put(kind::SNIPPET, "s1", snippet.to_data()).unwrap();
    a.put(kind::SETTING, "hud.fade_near_px", json!(60)).unwrap();
    let r = sync(&pb, &a, &sa).await.unwrap();
    assert_eq!((r.pushed, r.stale), (2, 0));

    // B receives both.
    let r = sync(&pb, &b, &sb).await.unwrap();
    assert_eq!(r.pulled, 2);
    assert_eq!(b.list(kind::SNIPPET).unwrap().len(), 1);
    assert_eq!(b.get(kind::SETTING, "hud.fade_near_px").unwrap().unwrap().data, json!(60));

    // B edits the snippet; A sees the edit.
    let edited = SnippetInput { title: "Today".into(), ..snippet };
    b.put(kind::SNIPPET, "s1", edited.to_data()).unwrap();
    sync(&pb, &b, &sb).await.unwrap();
    sync(&pb, &a, &sa).await.unwrap();
    assert_eq!(a.get(kind::SNIPPET, "s1").unwrap().unwrap().data["title"], json!("Today"));

    // A deletes it; B deletes it too.
    a.delete(kind::SNIPPET, "s1").unwrap();
    sync(&pb, &a, &sa).await.unwrap();
    sync(&pb, &b, &sb).await.unwrap();
    assert!(b.list(kind::SNIPPET).unwrap().is_empty());

    // Nothing left to do on a second run.
    let r = sync(&pb, &b, &sb).await.unwrap();
    assert_eq!((r.pulled, r.pushed), (0, 0));
}

#[tokio::test]
async fn concurrent_edits_converge_on_the_latest() {
    let Some(pb) = backend() else { return eprintln!("MC_TEST_PB_URL not set; skipping") };
    let _turn = ONE_AT_A_TIME.lock().await;
    let email = unique_email();
    pb.sign_up(&email, PASSWORD).await.unwrap();
    let (a, sa) = device(&pb, &email).await;
    let (b, sb) = device(&pb, &email).await;

    // Both edit offline; B's edit is later. A syncs first.
    a.put(kind::SETTING, "theme", json!("from-a")).unwrap();
    std::thread::sleep(std::time::Duration::from_millis(5));
    b.put(kind::SETTING, "theme", json!("from-b")).unwrap();

    sync(&pb, &a, &sa).await.unwrap();
    sync(&pb, &b, &sb).await.unwrap();
    sync(&pb, &a, &sa).await.unwrap();

    let value = |s: &Store| s.get(kind::SETTING, "theme").unwrap().unwrap().data;
    assert_eq!(value(&a), json!("from-b"));
    assert_eq!(value(&b), json!("from-b"));
    assert!(a.dirty().unwrap().is_empty() && b.dirty().unwrap().is_empty());
}

#[tokio::test]
async fn backend_rejects_older_writes_and_other_accounts() {
    let Some(pb) = backend() else { return eprintln!("MC_TEST_PB_URL not set; skipping") };
    let _turn = ONE_AT_A_TIME.lock().await;
    let email = unique_email();
    let s1 = pb.sign_up(&email, PASSWORD).await.unwrap();
    let item = Item {
        kind: kind::SETTING.into(),
        key: "k".into(),
        data: json!(2),
        mtime: 2_000,
        deleted: false,
        device: "d".into(),
    };
    assert_eq!(pb.push(&s1, &item).await.unwrap(), PushOutcome::Saved);
    let older = Item { mtime: 1_000, data: json!(1), ..item.clone() };
    assert_eq!(pb.push(&s1, &older).await.unwrap(), PushOutcome::Stale);

    // Another account sees none of it.
    let s2 = pb.sign_up(&unique_email(), PASSWORD).await.unwrap();
    assert!(pb.pull(&s2, None, 50).await.unwrap().is_empty());
    assert_eq!(pb.pull(&s1, None, 50).await.unwrap().len(), 1);

    // Tokens refresh; devices register idempotently.
    let refreshed = pb.refresh(&s1).await.unwrap();
    assert_eq!(refreshed.user_id, s1.user_id);
    let info = DeviceInfo {
        device_id: "dev_test".into(),
        name: "Test PC".into(),
        platform: "windows".into(),
        app_version: "0.0.0".into(),
    };
    pb.register_device(&refreshed, &info).await.unwrap();
    pb.register_device(&refreshed, &info).await.unwrap();
}

#[tokio::test]
async fn friendly_auth_errors() {
    let Some(pb) = backend() else { return eprintln!("MC_TEST_PB_URL not set; skipping") };
    let _turn = ONE_AT_A_TIME.lock().await;
    let email = unique_email();
    pb.sign_up(&email, PASSWORD).await.unwrap();

    assert!(matches!(pb.sign_in(&email, "wrong-password").await, Err(Error::InvalidCredentials)));
    match pb.sign_up(&email, PASSWORD).await {
        Err(Error::Validation(msg)) => assert!(msg.contains("already exists"), "{msg}"),
        other => panic!("expected validation error, got {other:?}"),
    }
    match pb.sign_up(&unique_email(), "short").await {
        Err(Error::Validation(msg)) => assert!(msg.contains("Password"), "{msg}"),
        other => panic!("expected validation error, got {other:?}"),
    }
    let bogus = Session { token: "not-a-token".into(), ..pb.sign_in(&email, PASSWORD).await.unwrap() };
    assert!(matches!(pb.refresh(&bogus).await, Err(Error::Unauthorized)));
}

#[tokio::test]
async fn password_reset_never_reveals_accounts() {
    let Some(pb) = backend() else { return eprintln!("MC_TEST_PB_URL not set; skipping") };
    let _turn = ONE_AT_A_TIME.lock().await;
    let email = unique_email();
    pb.sign_up(&email, PASSWORD).await.unwrap();
    pb.request_password_reset(&email).await.unwrap();
    pb.request_password_reset(&unique_email()).await.unwrap();
}

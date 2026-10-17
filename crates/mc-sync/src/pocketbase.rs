//! [`Backend`] for the MouseComb PocketBase service (`services/pocketbase`).

use std::time::Duration;

use mc_core::{Item, remote_id};
use reqwest::{Client, Method, RequestBuilder, Response, StatusCode};
use serde::Deserialize;
use serde_json::{Value, json};

use crate::{Backend, Cursor, DeviceInfo, Error, PushOutcome, RemoteItem, Result, Session};

#[derive(Clone)]
pub struct PocketBase {
    base_url: String,
    http: Client,
}

impl PocketBase {
    pub fn new(base_url: &str) -> Result<Self> {
        let http = Client::builder()
            .timeout(Duration::from_secs(20))
            .user_agent(concat!("MouseComb-sync/", env!("CARGO_PKG_VERSION")))
            .build()
            .map_err(|e| Error::Network(e.to_string()))?;
        Ok(Self { base_url: base_url.trim_end_matches('/').to_owned(), http })
    }

    pub fn base_url(&self) -> &str {
        &self.base_url
    }

    fn request(&self, method: Method, path: &str, session: Option<&Session>) -> RequestBuilder {
        let req = self.http.request(method, format!("{}/api{path}", self.base_url));
        match session {
            Some(s) => req.header("Authorization", &s.token),
            None => req,
        }
    }

    fn session_from(&self, auth: AuthResponse) -> Session {
        Session {
            backend_url: self.base_url.clone(),
            user_id: auth.record.id,
            email: auth.record.email,
            token: auth.token,
        }
    }

    /// Update a record, creating it with that id when it doesn't exist yet.
    async fn upsert(
        &self,
        session: &Session,
        collection: &str,
        id: &str,
        update: Value,
        create: Value,
    ) -> Result<Response> {
        let path = format!("/collections/{collection}/records/{id}");
        let res = send(self.request(Method::PATCH, &path, Some(session)).json(&update)).await?;
        if res.status() != StatusCode::NOT_FOUND {
            return Ok(res);
        }
        let res = send(
            self.request(Method::POST, &format!("/collections/{collection}/records"), Some(session)).json(&create),
        )
        .await?;
        if res.status() == StatusCode::BAD_REQUEST {
            // Either another device created it between our two calls (update
            // instead) or the data itself is invalid (report the create error).
            let create_error = error_from(res).await;
            let retry = send(self.request(Method::PATCH, &path, Some(session)).json(&update)).await?;
            return if retry.status() == StatusCode::NOT_FOUND { Err(create_error) } else { Ok(retry) };
        }
        Ok(res)
    }
}

#[derive(Deserialize)]
struct AuthResponse {
    token: String,
    record: UserRecord,
}

#[derive(Deserialize)]
struct UserRecord {
    id: String,
    #[serde(default)]
    email: String,
}

#[derive(Deserialize)]
struct ListResponse {
    items: Vec<ItemRecord>,
}

#[derive(Deserialize)]
struct ItemRecord {
    id: String,
    kind: String,
    key: String,
    #[serde(default)]
    data: Value,
    mtime: i64,
    #[serde(default)]
    deleted: bool,
    #[serde(default)]
    device: String,
    updated: String,
}

#[derive(Deserialize, Default)]
struct ApiError {
    #[serde(default)]
    message: String,
    #[serde(default)]
    data: serde_json::Map<String, Value>,
}

/// Send a request, waiting and retrying when the server's rate limit says "slow down".
async fn send(req: RequestBuilder) -> Result<Response> {
    const ATTEMPTS: u32 = 5;
    for attempt in 1..=ATTEMPTS {
        let this = req.try_clone().expect("request bodies are JSON, so they can be cloned");
        let res = this.send().await.map_err(|e| Error::Network(e.without_url().to_string()))?;
        if res.status() != StatusCode::TOO_MANY_REQUESTS || attempt == ATTEMPTS {
            return Ok(res);
        }
        let wait = res
            .headers()
            .get("retry-after")
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.parse::<u64>().ok())
            .map_or(Duration::from_millis(1_000 * u64::from(attempt)), Duration::from_secs);
        tokio::time::sleep(wait.min(Duration::from_secs(10))).await;
    }
    unreachable!("the last attempt always returns")
}

/// Turn a non-success response into a friendly error.
async fn error_from(res: Response) -> Error {
    let status = res.status();
    let body: ApiError = res.json().await.unwrap_or_default();
    if status == StatusCode::UNAUTHORIZED {
        return Error::Unauthorized;
    }
    if status == StatusCode::TOO_MANY_REQUESTS {
        return Error::RateLimited;
    }
    if status == StatusCode::BAD_REQUEST && !body.data.is_empty() {
        let field_errors: Vec<String> = body
            .data
            .iter()
            .map(|(field, err)| {
                let code = err.get("code").and_then(Value::as_str).unwrap_or_default();
                let msg = err.get("message").and_then(Value::as_str).unwrap_or("Invalid value.");
                match (field.as_str(), code) {
                    ("email", "validation_not_unique") => "An account with this email already exists.".to_owned(),
                    ("email", _) => "Enter a valid email address.".to_owned(),
                    ("password", _) => format!("Password: {msg}"),
                    _ => format!("{field}: {msg}"),
                }
            })
            .collect();
        return Error::Validation(field_errors.join(" "));
    }
    Error::Server { status: status.as_u16(), message: body.message }
}

async fn json_or_error<T: for<'de> Deserialize<'de>>(res: Response) -> Result<T> {
    if !res.status().is_success() {
        return Err(error_from(res).await);
    }
    res.json().await.map_err(|e| Error::Network(e.to_string()))
}

/// Quote a value for a PocketBase filter expression.
fn quote(value: &str) -> String {
    format!("\"{}\"", value.replace('\\', "\\\\").replace('"', "\\\""))
}

impl Backend for PocketBase {
    async fn sign_up(&self, email: &str, password: &str) -> Result<Session> {
        let res = send(self.request(Method::POST, "/collections/users/records", None).json(&json!({
            "email": email,
            "password": password,
            "passwordConfirm": password,
        })))
        .await?;
        if !res.status().is_success() {
            return Err(error_from(res).await);
        }
        self.sign_in(email, password).await
    }

    async fn sign_in(&self, email: &str, password: &str) -> Result<Session> {
        let res = send(
            self.request(Method::POST, "/collections/users/auth-with-password", None)
                .json(&json!({ "identity": email, "password": password })),
        )
        .await?;
        if res.status() == StatusCode::BAD_REQUEST {
            return Err(Error::InvalidCredentials);
        }
        Ok(self.session_from(json_or_error(res).await?))
    }

    async fn request_password_reset(&self, email: &str) -> Result<()> {
        let res = send(
            self.request(Method::POST, "/collections/users/request-password-reset", None)
                .json(&json!({ "email": email })),
        )
        .await?;
        if !res.status().is_success() {
            return Err(error_from(res).await);
        }
        Ok(())
    }

    async fn refresh(&self, session: &Session) -> Result<Session> {
        let res = send(self.request(Method::POST, "/collections/users/auth-refresh", Some(session))).await?;
        if matches!(res.status(), StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN | StatusCode::NOT_FOUND) {
            return Err(Error::Unauthorized);
        }
        Ok(self.session_from(json_or_error(res).await?))
    }

    async fn pull(&self, session: &Session, after: Option<&Cursor>, limit: u32) -> Result<Vec<RemoteItem>> {
        let mut filter = format!("user = {}", quote(&session.user_id));
        if let Some(c) = after {
            let (updated, id) = (quote(&c.updated), quote(&c.id));
            filter.push_str(&format!(" && (updated > {updated} || (updated = {updated} && id > {id}))"));
        }
        let res = send(self.request(Method::GET, "/collections/items/records", Some(session)).query(&[
            ("filter", filter.as_str()),
            ("sort", "updated,id"),
            ("perPage", &limit.to_string()),
            ("skipTotal", "1"),
        ]))
        .await?;
        let list: ListResponse = json_or_error(res).await?;
        Ok(list
            .items
            .into_iter()
            .map(|r| RemoteItem {
                id: r.id,
                updated: r.updated,
                item: Item {
                    kind: r.kind,
                    key: r.key,
                    data: r.data,
                    mtime: r.mtime,
                    deleted: r.deleted,
                    device: r.device,
                },
            })
            .collect())
    }

    async fn push(&self, session: &Session, item: &Item) -> Result<PushOutcome> {
        let id = remote_id(&session.user_id, &item.kind, &item.key);
        let update = json!({
            "data": item.data,
            "mtime": item.mtime,
            "deleted": item.deleted,
            "device": item.device,
        });
        let create = json!({
            "id": id,
            "user": session.user_id,
            "kind": item.kind,
            "key": item.key,
            "data": item.data,
            "mtime": item.mtime,
            "deleted": item.deleted,
            "device": item.device,
        });
        let res = self.upsert(session, "items", &id, update, create).await?;
        match res.status() {
            s if s.is_success() => Ok(PushOutcome::Saved),
            StatusCode::CONFLICT => Ok(PushOutcome::Stale),
            _ => Err(error_from(res).await),
        }
    }

    async fn register_device(&self, session: &Session, device: &DeviceInfo) -> Result<()> {
        let id = remote_id(&session.user_id, "device", &device.device_id);
        let fields = json!({
            "name": device.name,
            "platform": device.platform,
            "app_version": device.app_version,
            "last_seen": now_rfc3339(),
        });
        let mut create = fields.clone();
        create["id"] = json!(id);
        create["user"] = json!(session.user_id);
        let res = self.upsert(session, "devices", &id, fields, create).await?;
        if res.status().is_success() { Ok(()) } else { Err(error_from(res).await) }
    }
}

/// Current UTC time in the `YYYY-MM-DD HH:MM:SS.mmmZ` form PocketBase stores.
fn now_rfc3339() -> String {
    let ms = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_or(0, |d| d.as_millis() as i64);
    let (secs, millis) = (ms.div_euclid(1000), ms.rem_euclid(1000));
    let (days, rem) = (secs.div_euclid(86_400), secs.rem_euclid(86_400));
    let (h, m, s) = (rem / 3600, rem % 3600 / 60, rem % 60);
    // Civil date from days since 1970-01-01 (Howard Hinnant's algorithm).
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let mo = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = yoe + era * 400 + i64::from(mo <= 2);
    format!("{y:04}-{mo:02}-{d:02} {h:02}:{m:02}:{s:02}.{millis:03}Z")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn filter_values_are_escaped() {
        assert_eq!(quote(r#"a"b\c"#), r#""a\"b\\c""#);
    }

    #[test]
    fn timestamps_use_pocketbase_format() {
        let ts = now_rfc3339();
        assert_eq!(ts.len(), "2026-10-17 17:28:51.957Z".len());
        assert!(ts.starts_with("20") && ts.ends_with('Z'));
    }
}

use serde::Serialize;
use specta::Type;

/// What went wrong, in a form the UI can branch on.
#[derive(Clone, Copy, Debug, Serialize, Type, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ErrorCode {
    InvalidCredentials,
    SignedOut,
    Validation,
    RateLimited,
    Network,
    Server,
    Storage,
}

/// The error every command returns: a code plus a sentence to show the user.
#[derive(Clone, Debug, Serialize, Type)]
pub struct CommandError {
    pub code: ErrorCode,
    pub message: String,
}

impl CommandError {
    pub fn new(code: ErrorCode, message: impl Into<String>) -> Self {
        Self { code, message: message.into() }
    }
}

impl std::fmt::Display for CommandError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.message)
    }
}

impl From<mc_store::Error> for CommandError {
    fn from(e: mc_store::Error) -> Self {
        let code = match e {
            mc_store::Error::InvalidKind(_) => ErrorCode::Validation,
            _ => ErrorCode::Storage,
        };
        Self::new(code, e.to_string())
    }
}

impl From<mc_sync::Error> for CommandError {
    fn from(e: mc_sync::Error) -> Self {
        use mc_sync::Error as E;
        let code = match &e {
            E::InvalidCredentials => ErrorCode::InvalidCredentials,
            E::Unauthorized => ErrorCode::SignedOut,
            E::Validation(_) => ErrorCode::Validation,
            E::RateLimited => ErrorCode::RateLimited,
            E::Network(_) => ErrorCode::Network,
            E::Server { .. } => ErrorCode::Server,
            E::Store(_) => ErrorCode::Storage,
        };
        Self::new(code, e.to_string())
    }
}

pub type CommandResult<T> = Result<T, CommandError>;

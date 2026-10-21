//! MouseComb's Windows layer (APP_SPEC §3): the installed-apps list for the
//! OmniBar, power commands, the app in front, key and text injection
//! (`SendInput`) and the low-level input hooks.
//!
//! Other platforms compile but report [`Error::Unsupported`], so the desktop
//! app still builds and runs on Linux for development.

pub mod apps;
pub mod foreground;
pub mod hooks;
pub mod keys;
pub mod power;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("This only works on Windows.")]
    Unsupported,
    #[error("Windows couldn't do that: {0}")]
    Os(String),
}

pub type Result<T> = std::result::Result<T, Error>;

/// Hide the console window a child process would otherwise flash.
#[cfg(windows)]
pub(crate) fn quiet(cmd: &mut std::process::Command) -> &mut std::process::Command {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    cmd.creation_flags(CREATE_NO_WINDOW)
}

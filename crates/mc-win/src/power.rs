//! Lock, sleep, sign out, restart and shut down (`core.os.power.*`).
//! Callers confirm the destructive ones first (APP_SPEC §8).

use crate::{Error, Result};

#[cfg(windows)]
pub fn lock() -> Result<()> {
    // SAFETY: plain Win32 call without pointers.
    let ok = unsafe { windows_sys::Win32::System::Shutdown::LockWorkStation() };
    if ok == 0 { Err(Error::Os("couldn't lock the screen".into())) } else { Ok(()) }
}

#[cfg(windows)]
pub fn sleep() -> Result<()> {
    // Sleep, not hibernate; wake events stay allowed.
    // SAFETY: plain Win32 call without pointers.
    let ok = unsafe { windows_sys::Win32::System::Power::SetSuspendState(false, false, false) };
    if ok { Ok(()) } else { Err(Error::Os("couldn't put the PC to sleep".into())) }
}

#[cfg(windows)]
fn shutdown_exe(args: &[&str]) -> Result<()> {
    let status = crate::quiet(std::process::Command::new("shutdown.exe").args(args))
        .status()
        .map_err(|e| Error::Os(e.to_string()))?;
    if status.success() { Ok(()) } else { Err(Error::Os(format!("shutdown.exe exited with {status}"))) }
}

#[cfg(windows)]
pub fn sign_out() -> Result<()> {
    shutdown_exe(&["/l"])
}

#[cfg(windows)]
pub fn restart() -> Result<()> {
    shutdown_exe(&["/r", "/t", "0"])
}

#[cfg(windows)]
pub fn shut_down() -> Result<()> {
    shutdown_exe(&["/s", "/t", "0"])
}

#[cfg(not(windows))]
mod other {
    use super::*;
    pub fn lock() -> Result<()> {
        Err(Error::Unsupported)
    }
    pub fn sleep() -> Result<()> {
        Err(Error::Unsupported)
    }
    pub fn sign_out() -> Result<()> {
        Err(Error::Unsupported)
    }
    pub fn restart() -> Result<()> {
        Err(Error::Unsupported)
    }
    pub fn shut_down() -> Result<()> {
        Err(Error::Unsupported)
    }
}

#[cfg(not(windows))]
pub use other::*;

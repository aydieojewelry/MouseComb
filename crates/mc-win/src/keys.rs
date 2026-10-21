//! Sending keys and typing text with `SendInput` (snippet injection, key actions).
//!
//! Every injected event carries [`INJECTED_TAG`] in `dwExtraInfo`, so MouseComb's
//! own hooks recognise and ignore them and nothing loops (APP_SPEC §3).
//! Never called from a hook callback.

use std::sync::atomic::AtomicBool;

use crate::Result;

/// "MCMB": marks input MouseComb made itself.
pub const INJECTED_TAG: usize = 0x4D43_4D42;

/// Set to stop a long `type_text` early (the panic key).
pub static STOP_TYPING: AtomicBool = AtomicBool::new(false);

/// Press the modifiers, tap the key, release in reverse. Codes are virtual keys.
/// Waits (up to 1.5 s) for modifier keys the user still holds, such as the hotkey that ran this.
pub fn send_combo(modifiers: &[u32], key: u32) -> Result<()> {
    imp::send_combo(modifiers, key)
}

/// Type `text` into the focused program as if typed, any language, without the clipboard.
/// Waits (up to 1.5 s) for held modifier keys to be let go first, so the text isn't mistaken for shortcuts.
pub fn type_text(text: &str) -> Result<()> {
    imp::type_text(text)
}

/// Press and release a mouse button where the cursor is, tagged.
pub fn click(right: bool) -> Result<()> {
    imp::click(right)
}

/// Switch real CapsLock.
pub fn toggle_capslock() -> Result<()> {
    imp::send_combo(&[], 0x14)
}

#[cfg(windows)]
mod imp {
    use std::sync::atomic::Ordering;
    use std::time::{Duration, Instant};

    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
        GetAsyncKeyState, INPUT, INPUT_0, INPUT_KEYBOARD, INPUT_MOUSE, KEYBDINPUT, KEYEVENTF_EXTENDEDKEY,
        KEYEVENTF_KEYUP, KEYEVENTF_UNICODE, MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP, MOUSEEVENTF_RIGHTDOWN,
        MOUSEEVENTF_RIGHTUP, MOUSEINPUT, SendInput, VK_RETURN, VK_TAB,
    };

    use super::*;
    use crate::Error;

    fn key_input(vk: u16, scan: u16, flags: u32) -> INPUT {
        INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT { wVk: vk, wScan: scan, dwFlags: flags, time: 0, dwExtraInfo: INJECTED_TAG },
            },
        }
    }

    fn send(inputs: &[INPUT]) -> Result<()> {
        if inputs.is_empty() {
            return Ok(());
        }
        // SAFETY: `inputs` is a valid slice of fully initialised INPUT structs.
        let sent = unsafe { SendInput(inputs.len() as u32, inputs.as_ptr(), std::mem::size_of::<INPUT>() as i32) };
        if sent as usize == inputs.len() {
            Ok(())
        } else {
            Err(Error::Os("Windows blocked the keystrokes (is the target window running as administrator?)".into()))
        }
    }

    /// Arrows, Insert, Delete, Home, End, Page Up/Down are "extended" keys.
    fn extended(vk: u32) -> u32 {
        if matches!(vk, 0x21..=0x28 | 0x2D | 0x2E) { KEYEVENTF_EXTENDEDKEY } else { 0 }
    }

    pub fn send_combo(modifiers: &[u32], key: u32) -> Result<()> {
        wait_for_modifiers_up();
        let mut inputs = Vec::with_capacity(modifiers.len() * 2 + 2);
        for m in modifiers {
            inputs.push(key_input(*m as u16, 0, extended(*m)));
        }
        inputs.push(key_input(key as u16, 0, extended(key)));
        inputs.push(key_input(key as u16, 0, extended(key) | KEYEVENTF_KEYUP));
        for m in modifiers.iter().rev() {
            inputs.push(key_input(*m as u16, 0, extended(*m) | KEYEVENTF_KEYUP));
        }
        send(&inputs)
    }

    fn modifiers_down() -> bool {
        // SAFETY: GetAsyncKeyState takes any virtual-key code.
        [0x10, 0x11, 0x12, 0x5B, 0x5C].iter().any(|vk| unsafe { GetAsyncKeyState(*vk) } < 0)
    }

    /// A hotkey fires while its keys are still down; let them go first (up to 1.5 s).
    fn wait_for_modifiers_up() {
        let deadline = Instant::now() + Duration::from_millis(1500);
        while modifiers_down() && Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(15));
        }
    }

    pub fn type_text(text: &str) -> Result<()> {
        STOP_TYPING.store(false, Ordering::SeqCst);
        wait_for_modifiers_up();
        let mut batch: Vec<INPUT> = Vec::with_capacity(200);
        let flush = |batch: &mut Vec<INPUT>| -> Result<()> {
            let result = send(batch);
            batch.clear();
            std::thread::sleep(Duration::from_millis(4));
            result
        };
        for ch in text.replace("\r\n", "\n").chars() {
            if STOP_TYPING.load(Ordering::SeqCst) {
                return Ok(());
            }
            match ch {
                '\n' => {
                    batch.push(key_input(VK_RETURN, 0, 0));
                    batch.push(key_input(VK_RETURN, 0, KEYEVENTF_KEYUP));
                }
                '\t' => {
                    batch.push(key_input(VK_TAB, 0, 0));
                    batch.push(key_input(VK_TAB, 0, KEYEVENTF_KEYUP));
                }
                c => {
                    let mut units = [0u16; 2];
                    for unit in c.encode_utf16(&mut units) {
                        batch.push(key_input(0, *unit, KEYEVENTF_UNICODE));
                        batch.push(key_input(0, *unit, KEYEVENTF_UNICODE | KEYEVENTF_KEYUP));
                    }
                }
            }
            if batch.len() >= 192 {
                flush(&mut batch)?;
            }
        }
        flush(&mut batch)
    }

    pub fn click(right: bool) -> Result<()> {
        let (down, up) = if right {
            (MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP)
        } else {
            (MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP)
        };
        let mouse = |flags| INPUT {
            r#type: INPUT_MOUSE,
            Anonymous: INPUT_0 {
                mi: MOUSEINPUT { dx: 0, dy: 0, mouseData: 0, dwFlags: flags, time: 0, dwExtraInfo: INJECTED_TAG },
            },
        };
        send(&[mouse(down), mouse(up)])
    }
}

#[cfg(not(windows))]
mod imp {
    use crate::{Error, Result};

    pub fn send_combo(_: &[u32], _: u32) -> Result<()> {
        Err(Error::Unsupported)
    }

    pub fn type_text(_: &str) -> Result<()> {
        Err(Error::Unsupported)
    }

    pub fn click(_: bool) -> Result<()> {
        Err(Error::Unsupported)
    }
}

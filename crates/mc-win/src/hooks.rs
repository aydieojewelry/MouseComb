//! The low-level keyboard and mouse hooks (FEAT-008, FEAT-006, APP_SPEC §3).
//!
//! One thread installs the hooks and runs a message loop. A callback does only
//! this: ignore MouseComb's own tagged input, hand the event to the pure
//! [`mc_core::input::Engine`] (no locks, I/O, allocation per event beyond one
//! small vector, or calls into the app), send what it asks for down a channel,
//! and return pass or suppress. Windows removes a hook whose callback is slow,
//! so everything else happens on other threads.
//!
//! The mouse hook is installed only while gestures are on.

use std::sync::mpsc::Sender;

use mc_core::input::{Emit, EngineConfig};

use crate::{Error, Result};

/// A running hook thread. Dropping it removes the hooks.
pub struct Hooks {
    inner: imp::Handle,
}

impl Hooks {
    /// Start the hooks. Each [`Emit`] the engine produces is sent to `out`.
    pub fn start(config: EngineConfig, out: Sender<Emit>) -> Result<Self> {
        imp::start(config, out).map(|inner| Self { inner })
    }

    /// New settings, applied from the next event.
    pub fn set_config(&self, config: EngineConfig) {
        self.inner.set_config(config);
    }
}

impl Drop for Hooks {
    fn drop(&mut self) {
        self.inner.stop();
    }
}

#[cfg(windows)]
mod imp {
    use std::cell::RefCell;
    use std::panic::{AssertUnwindSafe, catch_unwind};
    use std::ptr;
    use std::sync::mpsc::{self, Receiver, Sender};
    use std::thread::JoinHandle;
    use std::time::Instant;

    use mc_core::input::{Button, Emit, Engine, EngineConfig, GestureMode, RawEvent, Verdict};
    use windows_sys::Win32::Foundation::{LPARAM, LRESULT, WPARAM};
    use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows_sys::Win32::System::Threading::GetCurrentThreadId;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        CallNextHookEx, GetMessageW, HHOOK, KBDLLHOOKSTRUCT, MSG, MSLLHOOKSTRUCT, PostThreadMessageW,
        SetWindowsHookExW, UnhookWindowsHookEx, WH_KEYBOARD_LL, WH_MOUSE_LL, WM_APP, WM_KEYDOWN, WM_KEYUP,
        WM_LBUTTONDOWN, WM_LBUTTONUP, WM_MOUSEMOVE, WM_QUIT, WM_RBUTTONDOWN, WM_RBUTTONUP, WM_SYSKEYDOWN, WM_SYSKEYUP,
    };

    use super::{Error, Result};
    use crate::keys::INJECTED_TAG;

    const RECONFIGURE: u32 = WM_APP + 1;

    /// Lives on the hook thread only; the callbacks reach it through a thread-local.
    struct State {
        engine: Engine,
        out: Sender<Emit>,
        configs: Receiver<EngineConfig>,
        started: Instant,
        keyboard: HHOOK,
        mouse: HHOOK,
    }

    thread_local! {
        static STATE: RefCell<Option<State>> = const { RefCell::new(None) };
    }

    pub struct Handle {
        thread_id: u32,
        configs: Sender<EngineConfig>,
        join: Option<JoinHandle<()>>,
    }

    impl Handle {
        pub fn set_config(&self, config: EngineConfig) {
            if self.configs.send(config).is_ok() {
                // SAFETY: posting a thread message is always safe; a dead thread just fails.
                unsafe { PostThreadMessageW(self.thread_id, RECONFIGURE, 0, 0) };
            }
        }

        pub fn stop(&mut self) {
            // SAFETY: as above.
            unsafe { PostThreadMessageW(self.thread_id, WM_QUIT, 0, 0) };
            if let Some(join) = self.join.take() {
                let _ = join.join();
            }
        }
    }

    pub fn start(config: EngineConfig, out: Sender<Emit>) -> Result<Handle> {
        let (configs_tx, configs_rx) = mpsc::channel();
        let (ready_tx, ready_rx) = mpsc::channel::<std::result::Result<u32, String>>();
        let join = std::thread::Builder::new()
            .name("mousecomb-hooks".into())
            .spawn(move || run(config, out, configs_rx, ready_tx))
            .map_err(|e| Error::Os(e.to_string()))?;
        match ready_rx.recv() {
            Ok(Ok(thread_id)) => Ok(Handle { thread_id, configs: configs_tx, join: Some(join) }),
            Ok(Err(message)) => Err(Error::Os(message)),
            Err(_) => Err(Error::Os("the input hooks didn't start".into())),
        }
    }

    fn run(
        config: EngineConfig,
        out: Sender<Emit>,
        configs: Receiver<EngineConfig>,
        ready: Sender<std::result::Result<u32, String>>,
    ) {
        STATE.with(|s| {
            *s.borrow_mut() = Some(State {
                engine: Engine::new(config),
                out,
                configs,
                started: Instant::now(),
                keyboard: ptr::null_mut(),
                mouse: ptr::null_mut(),
            });
        });
        if let Err(message) = apply_hooks(config) {
            let _ = ready.send(Err(message));
            return;
        }
        // SAFETY: GetCurrentThreadId has no preconditions.
        let _ = ready.send(Ok(unsafe { GetCurrentThreadId() }));

        // SAFETY: a zeroed MSG is a valid out-parameter for GetMessageW.
        let mut msg: MSG = unsafe { std::mem::zeroed() };
        // SAFETY: standard message loop on the thread that owns the hooks.
        while unsafe { GetMessageW(&mut msg, ptr::null_mut(), 0, 0) } > 0 {
            if msg.message == RECONFIGURE {
                let latest = STATE.with(|s| s.borrow().as_ref().and_then(|st| st.configs.try_iter().last()));
                if let Some(cfg) = latest {
                    STATE.with(|s| {
                        if let Some(st) = s.borrow_mut().as_mut() {
                            st.engine.set_config(cfg);
                        }
                    });
                    let _ = apply_hooks(cfg);
                }
            }
        }
        remove_hooks();
        STATE.with(|s| *s.borrow_mut() = None);
    }

    fn wants_keyboard(cfg: &EngineConfig) -> bool {
        cfg.hyper || cfg.gestures == GestureMode::Caps
    }

    fn wants_mouse(cfg: &EngineConfig) -> bool {
        cfg.gestures != GestureMode::Off
    }

    /// Install or remove each hook to match what the settings need.
    fn apply_hooks(cfg: EngineConfig) -> std::result::Result<(), String> {
        STATE.with(|s| {
            let mut guard = s.borrow_mut();
            let st = guard.as_mut().ok_or("no state")?;
            // SAFETY: NULL asks for this process's module handle.
            let module = unsafe { GetModuleHandleW(ptr::null()) };
            if wants_keyboard(&cfg) && st.keyboard.is_null() {
                // SAFETY: the callback has the required signature and lives for the whole process.
                st.keyboard = unsafe { SetWindowsHookExW(WH_KEYBOARD_LL, Some(keyboard_proc), module, 0) };
                if st.keyboard.is_null() {
                    return Err("Windows refused the keyboard hook".to_owned());
                }
            } else if !wants_keyboard(&cfg) && !st.keyboard.is_null() {
                // SAFETY: the handle came from SetWindowsHookExW.
                unsafe { UnhookWindowsHookEx(st.keyboard) };
                st.keyboard = ptr::null_mut();
            }
            if wants_mouse(&cfg) && st.mouse.is_null() {
                // SAFETY: as above.
                st.mouse = unsafe { SetWindowsHookExW(WH_MOUSE_LL, Some(mouse_proc), module, 0) };
                if st.mouse.is_null() {
                    return Err("Windows refused the mouse hook".to_owned());
                }
            } else if !wants_mouse(&cfg) && !st.mouse.is_null() {
                // SAFETY: as above.
                unsafe { UnhookWindowsHookEx(st.mouse) };
                st.mouse = ptr::null_mut();
            }
            Ok(())
        })
    }

    fn remove_hooks() {
        STATE.with(|s| {
            if let Some(st) = s.borrow_mut().as_mut() {
                for hook in [&mut st.keyboard, &mut st.mouse] {
                    if !hook.is_null() {
                        // SAFETY: the handle came from SetWindowsHookExW.
                        unsafe { UnhookWindowsHookEx(*hook) };
                        *hook = ptr::null_mut();
                    }
                }
            }
        });
    }

    /// Run the engine for one event; `true` means suppress it.
    fn decide(event: RawEvent) -> bool {
        // A panic must never unwind into Windows: on any failure let the event through.
        catch_unwind(AssertUnwindSafe(|| {
            STATE.with(|s| {
                let mut guard = s.borrow_mut();
                let Some(st) = guard.as_mut() else { return false };
                let t = st.started.elapsed().as_millis() as i64;
                let mut emits = Vec::new();
                let verdict = st.engine.on_event(event, t, &mut emits);
                for emit in emits {
                    let _ = st.out.send(emit);
                }
                verdict == Verdict::Suppress
            })
        }))
        .unwrap_or(false)
    }

    unsafe extern "system" fn keyboard_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
        if code >= 0 {
            // SAFETY: for WH_KEYBOARD_LL with code >= 0, lparam points to a KBDLLHOOKSTRUCT.
            let info = unsafe { &*(lparam as *const KBDLLHOOKSTRUCT) };
            if info.dwExtraInfo != INJECTED_TAG {
                let event = match wparam as u32 {
                    WM_KEYDOWN | WM_SYSKEYDOWN => Some(RawEvent::KeyDown(info.vkCode)),
                    WM_KEYUP | WM_SYSKEYUP => Some(RawEvent::KeyUp(info.vkCode)),
                    _ => None,
                };
                if let Some(event) = event
                    && decide(event)
                {
                    return 1;
                }
            }
        }
        // SAFETY: forwarding the same arguments we were given.
        unsafe { CallNextHookEx(ptr::null_mut(), code, wparam, lparam) }
    }

    unsafe extern "system" fn mouse_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
        if code >= 0 {
            // SAFETY: for WH_MOUSE_LL with code >= 0, lparam points to an MSLLHOOKSTRUCT.
            let info = unsafe { &*(lparam as *const MSLLHOOKSTRUCT) };
            if info.dwExtraInfo != INJECTED_TAG {
                let (x, y) = (info.pt.x, info.pt.y);
                let event = match wparam as u32 {
                    WM_LBUTTONDOWN => Some(RawEvent::ButtonDown(Button::Left, x, y)),
                    WM_LBUTTONUP => Some(RawEvent::ButtonUp(Button::Left, x, y)),
                    WM_RBUTTONDOWN => Some(RawEvent::ButtonDown(Button::Right, x, y)),
                    WM_RBUTTONUP => Some(RawEvent::ButtonUp(Button::Right, x, y)),
                    WM_MOUSEMOVE => Some(RawEvent::Move(x, y)),
                    _ => None,
                };
                if let Some(event) = event
                    && decide(event)
                {
                    return 1;
                }
            }
        }
        // SAFETY: forwarding the same arguments we were given.
        unsafe { CallNextHookEx(ptr::null_mut(), code, wparam, lparam) }
    }
}

#[cfg(not(windows))]
mod imp {
    use std::sync::mpsc::Sender;

    use mc_core::input::{Emit, EngineConfig};

    use super::{Error, Result};

    pub struct Handle;

    impl Handle {
        pub fn set_config(&self, _: EngineConfig) {}
        pub fn stop(&mut self) {}
    }

    pub fn start(_: EngineConfig, _: Sender<Emit>) -> Result<Handle> {
        Err(Error::Unsupported)
    }
}

//! The input engine's decisions (FEAT-006, FEAT-008), as pure logic.
//!
//! The Windows hooks (`mc-win`) turn each keyboard and mouse event into a
//! [`RawEvent`], ask [`Engine::on_event`] whether to pass or suppress it, and
//! hand the [`Emit`]s to another thread. Nothing here blocks, allocates per
//! event beyond the output vector, or touches the OS (APP_SPEC §3):
//! - a key or button is suppressed only if its down-event was, so nothing is
//!   ever left held down ([`Ledger`]);
//! - a held-back mouse button is replayed as a click when it wasn't a gesture;
//! - events MouseComb injects itself never reach the engine (they are tagged).

use std::collections::HashSet;
use std::hash::Hash;

use serde::{Deserialize, Serialize};

use crate::bindings::Trigger;

pub const VK_CAPSLOCK: u32 = 0x14;
pub const VK_ESCAPE: u32 = 0x1B;
/// A gesture whose mouse-up never arrives (focus moved to a secure desktop) is dropped after this.
const STALE_GESTURE_MS: i64 = 10_000;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Direction {
    Left,
    Right,
    Up,
    Down,
}

impl Direction {
    pub fn name(self) -> &'static str {
        match self {
            Self::Left => "left",
            Self::Right => "right",
            Self::Up => "up",
            Self::Down => "down",
        }
    }

    pub fn parse(text: &str) -> Option<Self> {
        match text {
            "left" => Some(Self::Left),
            "right" => Some(Self::Right),
            "up" => Some(Self::Up),
            "down" => Some(Self::Down),
            _ => None,
        }
    }
}

/// What starts a gesture. `Caps`: hold CapsLock and drag the left button.
/// `Rmb`: drag the right button (opt-in; a plain right click still works).
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum GestureMode {
    #[default]
    Off,
    Caps,
    Rmb,
}

impl GestureMode {
    pub fn name(self) -> &'static str {
        match self {
            Self::Off => "off",
            Self::Caps => "caps",
            Self::Rmb => "rmb",
        }
    }

    pub fn parse(text: &str) -> Self {
        match text {
            "caps" => Self::Caps,
            "rmb" => Self::Rmb,
            _ => Self::Off,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct GestureConfig {
    /// Least travel, in pixels, for a drag to count.
    pub threshold_px: i32,
    /// How much longer one axis must be than the other; diagonals are ignored.
    pub axis_ratio: f64,
    pub max_duration_ms: i64,
}

impl Default for GestureConfig {
    fn default() -> Self {
        Self { threshold_px: 18, axis_ratio: 2.0, max_duration_ms: 1500 }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Outcome {
    Gesture(Direction),
    /// It never travelled `threshold_px`: an ordinary click.
    Click,
    /// Too slow, diagonal, or dragged out and back: do nothing.
    Ignored,
}

/// Follows one press-drag-release.
#[derive(Debug, Default)]
pub struct GestureTracker {
    start: Option<(i32, i32, i64)>,
    farthest: f64,
}

impl GestureTracker {
    pub fn begin(&mut self, x: i32, y: i32, t: i64) {
        self.start = Some((x, y, t));
        self.farthest = 0.0;
    }

    pub fn active(&self) -> bool {
        self.start.is_some()
    }

    pub fn started_at(&self) -> Option<i64> {
        self.start.map(|(_, _, t)| t)
    }

    pub fn cancel(&mut self) {
        self.start = None;
    }

    pub fn moved(&mut self, x: i32, y: i32) {
        if let Some((sx, sy, _)) = self.start {
            self.farthest = self.farthest.max(f64::from(x - sx).hypot(f64::from(y - sy)));
        }
    }

    pub fn finish(&mut self, x: i32, y: i32, t: i64, cfg: &GestureConfig) -> Outcome {
        self.moved(x, y);
        let Some((sx, sy, st)) = self.start.take() else { return Outcome::Ignored };
        let (dx, dy) = (f64::from(x - sx), f64::from(y - sy));
        let threshold = f64::from(cfg.threshold_px);
        if self.farthest < threshold {
            return Outcome::Click;
        }
        // Dragged out and came back: the user changed their mind.
        if dx.hypot(dy) < threshold || t - st > cfg.max_duration_ms {
            return Outcome::Ignored;
        }
        let (ax, ay) = (dx.abs(), dy.abs());
        if ax >= ay * cfg.axis_ratio {
            Outcome::Gesture(if dx < 0.0 { Direction::Left } else { Direction::Right })
        } else if ay >= ax * cfg.axis_ratio {
            Outcome::Gesture(if dy < 0.0 { Direction::Up } else { Direction::Down })
        } else {
            Outcome::Ignored
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CapsUp {
    Nothing,
    /// Held alone for the toggle time: switch real CapsLock.
    ToggleCapsLock,
}

/// CapsLock as the Hyper-Key (FEAT-008): held, the next key is a binding.
#[derive(Debug)]
pub struct Hyper {
    toggle_ms: i64,
    down_since: Option<i64>,
    used: bool,
}

impl Hyper {
    pub fn new(toggle_ms: i64) -> Self {
        Self { toggle_ms, down_since: None, used: false }
    }

    pub fn is_down(&self) -> bool {
        self.down_since.is_some()
    }

    /// `true` for a fresh press, `false` for the keyboard's auto-repeat.
    pub fn caps_down(&mut self, t: i64) -> bool {
        if self.down_since.is_some() {
            return false;
        }
        self.down_since = Some(t);
        self.used = false;
        true
    }

    /// A key or the mouse was used while held: releasing it does nothing.
    pub fn mark_used(&mut self) {
        self.used = true;
    }

    pub fn caps_up(&mut self, t: i64) -> CapsUp {
        let held = self.down_since.take().map(|since| t - since);
        match held {
            Some(ms) if !self.used && ms >= self.toggle_ms => CapsUp::ToggleCapsLock,
            _ => CapsUp::Nothing,
        }
    }

    pub fn reset(&mut self) {
        self.down_since = None;
        self.used = false;
    }
}

/// Remembers which presses were suppressed so releases match them:
/// an up is suppressed only if its down was. A down that passes clears
/// any older mark, so a lost release can never leave a key stuck.
#[derive(Debug)]
pub struct Ledger<T: Hash + Eq + Copy> {
    suppressed: HashSet<T>,
}

impl<T: Hash + Eq + Copy> Default for Ledger<T> {
    fn default() -> Self {
        Self { suppressed: HashSet::new() }
    }
}

impl<T: Hash + Eq + Copy> Ledger<T> {
    pub fn down(&mut self, key: T, suppress: bool) {
        if suppress {
            self.suppressed.insert(key);
        } else {
            self.suppressed.remove(&key);
        }
    }

    pub fn is_suppressed(&self, key: T) -> bool {
        self.suppressed.contains(&key)
    }

    /// `true` if this release must be suppressed too.
    pub fn up(&mut self, key: T) -> bool {
        self.suppressed.remove(&key)
    }

    pub fn clear(&mut self) {
        self.suppressed.clear();
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum Button {
    Left,
    Right,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RawEvent {
    KeyDown(u32),
    KeyUp(u32),
    ButtonDown(Button, i32, i32),
    ButtonUp(Button, i32, i32),
    Move(i32, i32),
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Verdict {
    Pass,
    Suppress,
}

/// What the engine asks the rest of the app to do, off the input path.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Emit {
    Trigger(Trigger),
    ToggleCapsLock,
    /// A held-back click that wasn't a gesture: press and release it again.
    ReplayClick(Button, i32, i32),
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct EngineConfig {
    pub gestures: GestureMode,
    pub gesture: GestureConfig,
    /// CapsLock is the Hyper-Key. Off: CapsLock stays a normal key (gestures
    /// in `Caps` mode then never start).
    pub hyper: bool,
    pub hyper_toggle_ms: i64,
}

impl Default for EngineConfig {
    fn default() -> Self {
        Self { gestures: GestureMode::Off, gesture: GestureConfig::default(), hyper: true, hyper_toggle_ms: 1500 }
    }
}

pub struct Engine {
    cfg: EngineConfig,
    hyper: Hyper,
    gesture: GestureTracker,
    tracking: Option<(Button, GestureMode)>,
    keys: Ledger<u32>,
    buttons: Ledger<Button>,
}

impl Engine {
    pub fn new(cfg: EngineConfig) -> Self {
        Self {
            hyper: Hyper::new(cfg.hyper_toggle_ms),
            cfg,
            gesture: GestureTracker::default(),
            tracking: None,
            keys: Ledger::default(),
            buttons: Ledger::default(),
        }
    }

    /// New settings apply from the next event; a press in progress is dropped.
    pub fn set_config(&mut self, cfg: EngineConfig) {
        *self = Self::new(cfg);
    }

    /// Back to idle (switched off, or the panic key). Presses already held
    /// back were never seen by apps, so their releases are simply let through.
    pub fn reset(&mut self) {
        *self = Self::new(self.cfg);
    }

    pub fn on_event(&mut self, ev: RawEvent, t: i64, out: &mut Vec<Emit>) -> Verdict {
        if let Some(started) = self.gesture.started_at()
            && t - started > STALE_GESTURE_MS
        {
            self.gesture.cancel();
            self.tracking = None;
        }
        match ev {
            RawEvent::KeyDown(vk) => self.key_down(vk, t, out),
            RawEvent::KeyUp(vk) => self.key_up(vk, t, out),
            RawEvent::ButtonDown(b, x, y) => self.button_down(b, x, y, t),
            RawEvent::ButtonUp(b, x, y) => self.button_up(b, x, y, t, out),
            RawEvent::Move(x, y) => {
                self.gesture.moved(x, y);
                Verdict::Pass
            }
        }
    }

    fn verdict(suppress: bool) -> Verdict {
        if suppress { Verdict::Suppress } else { Verdict::Pass }
    }

    fn key_down(&mut self, vk: u32, t: i64, out: &mut Vec<Emit>) -> Verdict {
        if vk == VK_CAPSLOCK && self.cfg.hyper {
            self.hyper.caps_down(t);
            self.keys.down(vk, true);
            return Verdict::Suppress;
        }
        if vk == VK_ESCAPE && self.gesture.active() {
            // Esc cancels a gesture in progress; the release is swallowed in `button_up`.
            self.gesture.cancel();
            self.tracking = self.tracking.map(|(b, _)| (b, GestureMode::Off));
        }
        if self.hyper.is_down() && !is_modifier(vk) {
            self.hyper.mark_used();
            let repeat = self.keys.is_suppressed(vk);
            self.keys.down(vk, true);
            if !repeat && let Some(name) = key_name(vk) {
                out.push(Emit::Trigger(Trigger::Hyper(name.to_owned())));
            }
            return Verdict::Suppress;
        }
        self.keys.down(vk, false);
        Verdict::Pass
    }

    fn key_up(&mut self, vk: u32, t: i64, out: &mut Vec<Emit>) -> Verdict {
        if vk == VK_CAPSLOCK && self.cfg.hyper && self.hyper.caps_up(t) == CapsUp::ToggleCapsLock {
            out.push(Emit::ToggleCapsLock);
        }
        Self::verdict(self.keys.up(vk))
    }

    fn button_down(&mut self, b: Button, x: i32, y: i32, t: i64) -> Verdict {
        let mode = match (self.cfg.gestures, b) {
            (GestureMode::Caps, Button::Left) if self.hyper.is_down() => Some(GestureMode::Caps),
            (GestureMode::Rmb, Button::Right) => Some(GestureMode::Rmb),
            _ => None,
        };
        let Some(mode) = mode else {
            self.buttons.down(b, false);
            return Verdict::Pass;
        };
        self.hyper.mark_used();
        self.gesture.begin(x, y, t);
        self.tracking = Some((b, mode));
        self.buttons.down(b, true);
        Verdict::Suppress
    }

    fn button_up(&mut self, b: Button, x: i32, y: i32, t: i64, out: &mut Vec<Emit>) -> Verdict {
        if let Some((tracked, mode)) = self.tracking
            && tracked == b
        {
            self.tracking = None;
            // `mode` is Off when Esc cancelled the gesture.
            if mode != GestureMode::Off {
                match self.gesture.finish(x, y, t, &self.cfg.gesture) {
                    Outcome::Gesture(dir) => out.push(Emit::Trigger(Trigger::Gesture(mode, dir))),
                    Outcome::Click => out.push(Emit::ReplayClick(b, x, y)),
                    Outcome::Ignored => {}
                }
            }
            self.gesture.cancel();
        }
        Self::verdict(self.buttons.up(b))
    }
}

/// Shift, Ctrl, Alt and the Windows keys: they pass through while Hyper is held.
pub fn is_modifier(vk: u32) -> bool {
    matches!(vk, 0x10..=0x12 | 0x5B | 0x5C | 0xA0..=0xA5)
}

/// The name a key has in bindings (`hyper:K`), or `None` for keys we don't bind.
pub fn key_name(vk: u32) -> Option<&'static str> {
    const LETTERS: [&str; 26] = [
        "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V",
        "W", "X", "Y", "Z",
    ];
    const DIGITS: [&str; 10] = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
    const FKEYS: [&str; 24] = [
        "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12", "F13", "F14", "F15", "F16", "F17",
        "F18", "F19", "F20", "F21", "F22", "F23", "F24",
    ];
    Some(match vk {
        0x41..=0x5A => LETTERS[(vk - 0x41) as usize],
        0x30..=0x39 => DIGITS[(vk - 0x30) as usize],
        0x70..=0x87 => FKEYS[(vk - 0x70) as usize],
        0x20 => "Space",
        0x0D => "Enter",
        0x09 => "Tab",
        0x08 => "Backspace",
        0x25 => "ArrowLeft",
        0x26 => "ArrowUp",
        0x27 => "ArrowRight",
        0x28 => "ArrowDown",
        0x24 => "Home",
        0x23 => "End",
        0x21 => "PageUp",
        0x22 => "PageDown",
        0x2D => "Insert",
        0x2E => "Delete",
        0xBA => "Semicolon",
        0xBB => "Equal",
        0xBC => "Comma",
        0xBD => "Minus",
        0xBE => "Period",
        0xBF => "Slash",
        0xC0 => "Backquote",
        0xDB => "BracketLeft",
        0xDC => "Backslash",
        0xDD => "BracketRight",
        0xDE => "Quote",
        _ => return None,
    })
}

/// Keys that can be sent but are never Hyper keys: name and virtual-key code.
const SEND_ONLY: &[(&str, u32)] = &[
    ("Escape", 0x1B),
    ("Pause", 0x13),
    ("PrintScreen", 0x2C),
    ("ScrollLock", 0x91),
    ("AudioVolumeMute", 0xAD),
    ("AudioVolumeDown", 0xAE),
    ("AudioVolumeUp", 0xAF),
    ("MediaTrackNext", 0xB0),
    ("MediaTrackPrevious", 0xB1),
    ("MediaPlayPause", 0xB3),
];

/// The virtual-key code for a key or modifier name written the way bindings write them
/// (`Ctrl`, `K`, `ArrowLeft`, `MediaPlayPause`), the reverse of [`key_name`].
pub fn vk_of(name: &str) -> Option<u32> {
    match name {
        "Shift" => return Some(0x10),
        "Ctrl" => return Some(0x11),
        "Alt" => return Some(0x12),
        "Super" => return Some(0x5B),
        _ => {}
    }
    if let Some(n) = name.strip_prefix("Numpad").and_then(|n| n.parse::<u32>().ok())
        && n <= 9
    {
        return Some(0x60 + n);
    }
    if let Some((_, vk)) = SEND_ONLY.iter().find(|(n, _)| *n == name) {
        return Some(*vk);
    }
    (0x08..=0xDE).find(|vk| key_name(*vk) == Some(name))
}

/// The modifier codes and key code for a shortcut such as `Ctrl+Shift+T`, or `None` if it isn't one.
pub fn combo_vks(shortcut: &str) -> Option<(Vec<u32>, u32)> {
    let normal = crate::bindings::normalize_shortcut(shortcut)?;
    let mut parts: Vec<&str> = normal.split('+').collect();
    let key = vk_of(parts.pop()?)?;
    let modifiers = parts.into_iter().map(vk_of).collect::<Option<Vec<_>>>()?;
    Some((modifiers, key))
}

#[cfg(test)]
mod tests {
    use super::*;

    const K: u32 = 0x4B;
    const CFG: GestureConfig = GestureConfig { threshold_px: 18, axis_ratio: 2.0, max_duration_ms: 1500 };

    fn drag(from: (i32, i32), to: (i32, i32), ms: i64) -> Outcome {
        let mut g = GestureTracker::default();
        g.begin(from.0, from.1, 0);
        g.moved(to.0, to.1);
        g.finish(to.0, to.1, ms, &CFG)
    }

    #[test]
    fn four_directions_a_click_and_the_ignored_cases() {
        assert_eq!(drag((100, 100), (40, 105), 300), Outcome::Gesture(Direction::Left));
        assert_eq!(drag((100, 100), (180, 90), 300), Outcome::Gesture(Direction::Right));
        assert_eq!(drag((100, 100), (95, 30), 300), Outcome::Gesture(Direction::Up));
        assert_eq!(drag((100, 100), (110, 190), 300), Outcome::Gesture(Direction::Down));
        assert_eq!(drag((100, 100), (104, 102), 80), Outcome::Click, "under the threshold");
        assert_eq!(drag((100, 100), (160, 160), 300), Outcome::Ignored, "diagonal");
        assert_eq!(drag((100, 100), (40, 100), 2000), Outcome::Ignored, "too slow");
    }

    #[test]
    fn dragging_out_and_back_cancels_instead_of_clicking() {
        let mut g = GestureTracker::default();
        g.begin(100, 100, 0);
        g.moved(200, 100);
        assert_eq!(g.finish(102, 101, 400, &CFG), Outcome::Ignored);
        assert!(!g.active());
    }

    #[test]
    fn hyper_toggles_capslock_only_when_held_alone_long_enough() {
        let mut h = Hyper::new(1500);
        assert!(h.caps_down(0));
        assert!(!h.caps_down(100), "auto-repeat");
        assert_eq!(h.caps_up(200), CapsUp::Nothing, "a tap");
        h.caps_down(1000);
        assert_eq!(h.caps_up(2600), CapsUp::ToggleCapsLock);
        h.caps_down(5000);
        h.mark_used();
        assert_eq!(h.caps_up(9000), CapsUp::Nothing, "used with another key");
    }

    #[test]
    fn ledger_never_suppresses_the_release_of_a_press_that_passed() {
        let mut l = Ledger::<u32>::default();
        l.down(1, true);
        assert!(l.up(1));
        assert!(!l.up(1), "released once");
        l.down(2, true);
        l.down(2, false); // the next press passed: the old mark is stale
        assert!(!l.up(2));
    }

    fn engine(gestures: GestureMode) -> Engine {
        Engine::new(EngineConfig { gestures, ..EngineConfig::default() })
    }

    fn run(e: &mut Engine, events: &[(RawEvent, i64)]) -> (Vec<Verdict>, Vec<Emit>) {
        let mut out = vec![];
        let verdicts = events.iter().map(|(ev, t)| e.on_event(*ev, *t, &mut out)).collect();
        (verdicts, out)
    }

    #[test]
    fn caps_plus_a_key_fires_a_hyper_trigger_and_nothing_leaks_to_the_app() {
        let mut e = engine(GestureMode::Off);
        let (v, out) = run(
            &mut e,
            &[
                (RawEvent::KeyDown(VK_CAPSLOCK), 0),
                (RawEvent::KeyDown(K), 50),
                (RawEvent::KeyDown(K), 90), // auto-repeat
                (RawEvent::KeyUp(K), 120),
                (RawEvent::KeyUp(VK_CAPSLOCK), 200),
            ],
        );
        assert!(v.iter().all(|v| *v == Verdict::Suppress));
        assert_eq!(out, vec![Emit::Trigger(Trigger::Hyper("K".into()))]);
        // Afterwards K types normally again.
        let (v, out) = run(&mut e, &[(RawEvent::KeyDown(K), 300), (RawEvent::KeyUp(K), 330)]);
        assert_eq!((v, out), (vec![Verdict::Pass, Verdict::Pass], vec![]));
    }

    #[test]
    fn a_key_held_before_capslock_still_gets_its_release() {
        let mut e = engine(GestureMode::Off);
        let (v, _) = run(
            &mut e,
            &[
                (RawEvent::KeyDown(K), 0),
                (RawEvent::KeyDown(VK_CAPSLOCK), 10),
                (RawEvent::KeyUp(K), 20),
                (RawEvent::KeyUp(VK_CAPSLOCK), 30),
            ],
        );
        assert_eq!(v, vec![Verdict::Pass, Verdict::Suppress, Verdict::Pass, Verdict::Suppress]);
    }

    #[test]
    fn long_hold_alone_toggles_real_capslock() {
        let mut e = engine(GestureMode::Off);
        let (_, out) = run(&mut e, &[(RawEvent::KeyDown(VK_CAPSLOCK), 0), (RawEvent::KeyUp(VK_CAPSLOCK), 1600)]);
        assert_eq!(out, vec![Emit::ToggleCapsLock]);
    }

    #[test]
    fn caps_drag_with_the_left_button_is_a_gesture() {
        let mut e = engine(GestureMode::Caps);
        let (v, out) = run(
            &mut e,
            &[
                (RawEvent::KeyDown(VK_CAPSLOCK), 0),
                (RawEvent::ButtonDown(Button::Left, 500, 400), 10),
                (RawEvent::Move(400, 402), 100),
                (RawEvent::ButtonUp(Button::Left, 300, 405), 200),
                (RawEvent::KeyUp(VK_CAPSLOCK), 250),
            ],
        );
        assert_eq!(v[1], Verdict::Suppress);
        assert_eq!(v[3], Verdict::Suppress);
        assert_eq!(out, vec![Emit::Trigger(Trigger::Gesture(GestureMode::Caps, Direction::Left))]);
    }

    #[test]
    fn a_plain_left_click_without_capslock_is_untouched() {
        let mut e = engine(GestureMode::Caps);
        let (v, out) =
            run(&mut e, &[(RawEvent::ButtonDown(Button::Left, 5, 5), 0), (RawEvent::ButtonUp(Button::Left, 5, 5), 40)]);
        assert_eq!((v, out), (vec![Verdict::Pass, Verdict::Pass], vec![]));
    }

    #[test]
    fn right_button_click_is_replayed_so_context_menus_still_work() {
        let mut e = engine(GestureMode::Rmb);
        let (v, out) = run(
            &mut e,
            &[(RawEvent::ButtonDown(Button::Right, 50, 60), 0), (RawEvent::ButtonUp(Button::Right, 52, 61), 90)],
        );
        assert_eq!(v, vec![Verdict::Suppress, Verdict::Suppress]);
        assert_eq!(out, vec![Emit::ReplayClick(Button::Right, 52, 61)]);
    }

    #[test]
    fn right_drag_fires_and_esc_cancels() {
        let mut e = engine(GestureMode::Rmb);
        let (_, out) = run(
            &mut e,
            &[(RawEvent::ButtonDown(Button::Right, 300, 300), 0), (RawEvent::ButtonUp(Button::Right, 300, 200), 300)],
        );
        assert_eq!(out, vec![Emit::Trigger(Trigger::Gesture(GestureMode::Rmb, Direction::Up))]);

        let (v, out) = run(
            &mut e,
            &[
                (RawEvent::ButtonDown(Button::Right, 300, 300), 1000),
                (RawEvent::KeyDown(VK_ESCAPE), 1100),
                (RawEvent::ButtonUp(Button::Right, 300, 200), 1300),
            ],
        );
        assert_eq!(v, vec![Verdict::Suppress, Verdict::Pass, Verdict::Suppress]);
        assert!(out.is_empty(), "cancelled: no gesture and no click");
    }

    #[test]
    fn a_lost_release_never_leaves_a_button_stuck() {
        let mut e = engine(GestureMode::Rmb);
        run(&mut e, &[(RawEvent::ButtonDown(Button::Right, 1, 1), 0)]);
        // Much later the release never came; the next press-release pair is judged on its own.
        let (v, _) = run(
            &mut e,
            &[(RawEvent::ButtonDown(Button::Right, 9, 9), 20_000), (RawEvent::ButtonUp(Button::Right, 9, 9), 20_050)],
        );
        assert_eq!(v, vec![Verdict::Suppress, Verdict::Suppress]);
        let (v, _) = run(
            &mut e,
            &[(RawEvent::ButtonDown(Button::Left, 9, 9), 21_000), (RawEvent::ButtonUp(Button::Left, 9, 9), 21_050)],
        );
        assert_eq!(v, vec![Verdict::Pass, Verdict::Pass]);
    }

    #[test]
    fn reset_lets_everything_through_again() {
        let mut e = engine(GestureMode::Caps);
        run(&mut e, &[(RawEvent::KeyDown(VK_CAPSLOCK), 0)]);
        e.reset();
        let (v, out) = run(&mut e, &[(RawEvent::KeyDown(K), 10), (RawEvent::KeyUp(K), 20)]);
        assert_eq!((v, out), (vec![Verdict::Pass, Verdict::Pass], vec![]));
    }

    #[test]
    fn names_map_back_to_virtual_keys() {
        for vk in [0x4B, 0x31, 0x7B, 0x20, 0xBF, 0x25, 0x2E] {
            assert_eq!(vk_of(key_name(vk).unwrap()), Some(vk));
        }
        assert_eq!(vk_of("Ctrl"), Some(0x11));
        assert_eq!(vk_of("Numpad3"), Some(0x63));
        assert_eq!(vk_of("MediaPlayPause"), Some(0xB3));
        assert_eq!(vk_of("Escape"), Some(0x1B));
        assert_eq!(vk_of("Banana"), None);
    }

    #[test]
    fn a_shortcut_becomes_modifier_and_key_codes() {
        assert_eq!(combo_vks("ctrl+shift+t"), Some((vec![0x11, 0x10], 0x54)));
        assert_eq!(combo_vks("MediaPlayPause"), Some((vec![], 0xB3)));
        assert_eq!(combo_vks("Ctrl+Super+ArrowLeft"), Some((vec![0x11, 0x5B], 0x25)));
        assert_eq!(combo_vks("Ctrl+"), None);
    }

    #[test]
    fn key_names_match_what_the_recorder_writes() {
        assert_eq!(key_name(0x4B), Some("K"));
        assert_eq!(key_name(0x31), Some("1"));
        assert_eq!(key_name(0x7B), Some("F12"));
        assert_eq!(key_name(0x20), Some("Space"));
        assert_eq!(key_name(0xBF), Some("Slash"));
        assert_eq!(key_name(0x5B), None);
        assert!(is_modifier(0xA0) && !is_modifier(K));
    }
}

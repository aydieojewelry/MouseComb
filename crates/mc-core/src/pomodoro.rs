//! Pomodoro timer (FEAT-002) as a plain state machine.
//!
//! No clocks or threads here: every call takes `now` in milliseconds since
//! the Unix epoch, so the desktop, the phone and tests all drive it the same
//! way. The desktop ticks it once a second and saves it after each change.

use serde::{Deserialize, Serialize};

const MINUTE_MS: i64 = 60_000;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "specta", derive(specta::Type))]
#[serde(rename_all = "snake_case")]
pub enum Phase {
    Focus,
    ShortBreak,
    LongBreak,
}

/// The user's durations (synced settings `pomodoro.*`, APP_SPEC §10).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Config {
    pub focus_min: u32,
    pub short_break_min: u32,
    pub long_break_min: u32,
    /// A long break after this many focus sessions.
    pub long_break_every: u32,
    /// Start the next phase by itself when one ends.
    pub auto_start: bool,
}

impl Default for Config {
    fn default() -> Self {
        Self { focus_min: 25, short_break_min: 5, long_break_min: 15, long_break_every: 4, auto_start: false }
    }
}

impl Config {
    pub fn duration_ms(&self, phase: Phase) -> i64 {
        let minutes = match phase {
            Phase::Focus => self.focus_min,
            Phase::ShortBreak => self.short_break_min,
            Phase::LongBreak => self.long_break_min,
        };
        i64::from(minutes.max(1)) * MINUTE_MS
    }
}

/// The timer. Serialized as-is to the device-only setting `pomodoro.state`
/// and sent to every window in the `pomodoro-changed` event.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "specta", derive(specta::Type))]
pub struct Pomodoro {
    pub phase: Phase,
    pub running: bool,
    /// While running: when the phase ends (ms since the Unix epoch).
    #[cfg_attr(feature = "specta", specta(type = Option<specta_typescript::Number>))]
    pub ends_at: Option<i64>,
    /// While stopped: time left in the phase.
    #[cfg_attr(feature = "specta", specta(type = specta_typescript::Number))]
    pub remaining_ms: i64,
    /// Length of the current phase.
    #[cfg_attr(feature = "specta", specta(type = specta_typescript::Number))]
    pub total_ms: i64,
    /// Focus sessions finished since the last reset (a long break follows every Nth).
    pub completed: u32,
    /// The phase hasn't been started yet, so new durations apply to it.
    pub fresh: bool,
    /// When the current focus phase was first started.
    #[cfg_attr(feature = "specta", specta(type = Option<specta_typescript::Number>))]
    pub started_at: Option<i64>,
}

/// A phase that just ended, returned by [`Pomodoro::tick`].
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Finished {
    pub phase: Phase,
    /// What comes next.
    pub next: Phase,
    /// For a focus phase: when it started and how long it was.
    pub started_at: Option<i64>,
    pub minutes: u32,
}

impl Pomodoro {
    pub fn new(config: &Config) -> Self {
        let total = config.duration_ms(Phase::Focus);
        Self {
            phase: Phase::Focus,
            running: false,
            ends_at: None,
            remaining_ms: total,
            total_ms: total,
            completed: 0,
            fresh: true,
            started_at: None,
        }
    }

    pub fn remaining(&self, now: i64) -> i64 {
        match (self.running, self.ends_at) {
            (true, Some(end)) => (end - now).max(0),
            _ => self.remaining_ms,
        }
    }

    pub fn start(&mut self, now: i64) {
        if self.running {
            return;
        }
        if self.phase == Phase::Focus && self.started_at.is_none() {
            self.started_at = Some(now);
        }
        self.running = true;
        self.fresh = false;
        self.ends_at = Some(now + self.remaining_ms);
    }

    pub fn pause(&mut self, now: i64) {
        if !self.running {
            return;
        }
        self.remaining_ms = self.remaining(now);
        self.running = false;
        self.ends_at = None;
    }

    pub fn toggle(&mut self, now: i64) {
        if self.running { self.pause(now) } else { self.start(now) }
    }

    /// Back to a fresh focus phase; the session count starts over.
    pub fn reset(&mut self, config: &Config) {
        *self = Self::new(config);
    }

    /// Jump to the next phase. A skipped focus phase doesn't count.
    pub fn skip(&mut self, now: i64, config: &Config) {
        let next = match self.phase {
            Phase::Focus => Phase::ShortBreak,
            _ => Phase::Focus,
        };
        let keep_running = self.running;
        self.enter(next, now, config, keep_running);
    }

    /// New durations take effect for a phase that hasn't started yet.
    pub fn apply_config(&mut self, config: &Config) {
        if self.fresh && !self.running {
            self.total_ms = config.duration_ms(self.phase);
            self.remaining_ms = self.total_ms;
        }
    }

    /// Call about once a second. Returns the phase that ended, if one did.
    pub fn tick(&mut self, now: i64, config: &Config) -> Option<Finished> {
        if !self.running || self.remaining(now) > 0 {
            return None;
        }
        let ended = self.phase;
        let started_at = self.started_at;
        let minutes = u32::try_from(self.total_ms / MINUTE_MS).unwrap_or(u32::MAX);
        let next = match ended {
            Phase::Focus => {
                self.completed += 1;
                if self.completed.is_multiple_of(config.long_break_every.max(1)) {
                    Phase::LongBreak
                } else {
                    Phase::ShortBreak
                }
            }
            Phase::ShortBreak | Phase::LongBreak => Phase::Focus,
        };
        // Count from now, not from the old end: after a sleep the PC resumes
        // with one finished phase instead of a burst of them.
        self.enter(next, now, config, config.auto_start);
        Some(Finished {
            phase: ended,
            next,
            started_at: if ended == Phase::Focus { started_at } else { None },
            minutes,
        })
    }

    fn enter(&mut self, phase: Phase, now: i64, config: &Config, run: bool) {
        self.phase = phase;
        self.total_ms = config.duration_ms(phase);
        self.remaining_ms = self.total_ms;
        self.running = false;
        self.ends_at = None;
        self.fresh = true;
        self.started_at = None;
        if run {
            self.start(now);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const M: i64 = MINUTE_MS;

    #[test]
    fn runs_pauses_and_resumes() {
        let cfg = Config::default();
        let mut p = Pomodoro::new(&cfg);
        assert_eq!(p.remaining(0), 25 * M);
        p.start(1_000);
        assert_eq!(p.remaining(1_000 + 10 * M), 15 * M);
        p.pause(1_000 + 10 * M);
        assert_eq!(p.remaining(1_000 + 60 * M), 15 * M, "paused time doesn't count");
        p.start(2_000_000);
        assert_eq!(p.ends_at, Some(2_000_000 + 15 * M));
        assert_eq!(p.started_at, Some(1_000), "a resume keeps the original start");
    }

    #[test]
    fn focus_then_breaks_with_a_long_one_every_fourth() {
        let cfg = Config { auto_start: true, ..Config::default() };
        let mut p = Pomodoro::new(&cfg);
        let mut now = 0;
        p.start(now);
        let mut breaks = vec![];
        for _ in 0..4 {
            now += 25 * M;
            let done = p.tick(now, &cfg).expect("focus ends");
            assert_eq!((done.phase, done.minutes), (Phase::Focus, 25));
            breaks.push(done.next);
            now += cfg.duration_ms(done.next);
            assert_eq!(p.tick(now, &cfg).map(|f| f.next), Some(Phase::Focus));
        }
        assert_eq!(breaks, [Phase::ShortBreak, Phase::ShortBreak, Phase::ShortBreak, Phase::LongBreak]);
        assert_eq!(p.completed, 4);
    }

    #[test]
    fn without_auto_start_the_next_phase_waits() {
        let cfg = Config::default();
        let mut p = Pomodoro::new(&cfg);
        p.start(0);
        assert_eq!(p.tick(10 * M, &cfg), None, "not over yet");
        let done = p.tick(25 * M + 300, &cfg).unwrap();
        assert_eq!(done.started_at, Some(0));
        assert!(!p.running);
        assert_eq!((p.phase, p.remaining(99 * M)), (Phase::ShortBreak, 5 * M));
    }

    #[test]
    fn a_long_sleep_ends_only_one_phase() {
        let cfg = Config { auto_start: true, ..Config::default() };
        let mut p = Pomodoro::new(&cfg);
        p.start(0);
        let wake = 8 * 60 * M;
        assert!(p.tick(wake, &cfg).is_some());
        assert_eq!(p.tick(wake + 1_000, &cfg), None);
        assert_eq!(p.remaining(wake), 5 * M);
    }

    #[test]
    fn skip_reset_and_new_durations() {
        let cfg = Config::default();
        let mut p = Pomodoro::new(&cfg);
        p.start(0);
        p.skip(M, &cfg);
        assert_eq!((p.phase, p.completed, p.running), (Phase::ShortBreak, 0, true));
        p.reset(&cfg);
        assert_eq!(p, Pomodoro::new(&cfg));

        let longer = Config { focus_min: 50, ..cfg };
        p.apply_config(&longer);
        assert_eq!(p.remaining(0), 50 * M, "a fresh phase picks up new durations");
        p.start(0);
        p.apply_config(&cfg);
        assert_eq!(p.remaining(0), 50 * M, "a started phase keeps its length");
    }

    #[test]
    fn state_round_trips_as_json() {
        let mut p = Pomodoro::new(&Config::default());
        p.start(42);
        let back: Pomodoro = serde_json::from_value(serde_json::to_value(&p).unwrap()).unwrap();
        assert_eq!(back, p);
    }
}

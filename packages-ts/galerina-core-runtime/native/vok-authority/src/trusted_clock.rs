//! MEM-R21: trusted-clock window for the VOK checker, in lock-step with SLIDE.
//!
//! Gap map rows 4.1 / 4.3 / 4.6 / H13 / H14 (memory-research gap map 2026-10-28).
//! SLIDE `src/k3-wire.mjs` classifies a Unix-seconds reading with
//! `k3ClassifyTrustedClock` into `OK`, `BELOW_FLOOR`, `AT_OR_ABOVE_CEILING`
//! (and `NOT_A_NUMBER`, which an `i64` cannot be). This module is the Rust
//! mirror, using the same half-open window `[TRUSTED_CLOCK_FLOOR_UNIX_S,
//! TRUSTED_CLOCK_CEILING_UNIX_S)`, so both trees refuse the same readings.
//!
//! Rules (zero trust, fail closed):
//! - any clock value `<= 0` is refused (it is below the floor);
//! - a reading that does not fit `i64` is refused, never saturated to
//!   `i64::MAX` and never wrapped (gap 4.3 "refuse, not saturate");
//! - nanoseconds are converted with checked, flooring arithmetic and a
//!   negative count is refused (H13 "checked ns to s");
//! - `2147483648` (one past `i32::MAX`) is an ordinary `i64` time inside the
//!   window and is accepted; there is no `i32` truncation on this path (4.6).
//!
//! This is the VOK checker only (not shipped). Production admission belongs to
//! SLIDE. Pure functions take the reading as input; only
//! `process_unix_seconds` and `trusted_clock_status` read the process clock.

use crate::{TRUSTED_CLOCK_CEILING_UNIX_S, TRUSTED_CLOCK_FLOOR_UNIX_S};

/// Nanoseconds per second, named once.
pub const NANOS_PER_SECOND: i64 = 1_000_000_000;

/// Classification of one Unix-seconds reading. Labels match SLIDE's strings.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TrustedClockClass {
    /// `floor <= now < ceiling`.
    Ok,
    /// `now < floor`, including every value `<= 0`.
    BelowFloor,
    /// `now >= ceiling`.
    AtOrAboveCeiling,
}

impl TrustedClockClass {
    /// The SLIDE label for this class (`K3_CLOCK_OK` and friends).
    #[must_use]
    pub const fn label(self) -> &'static str {
        match self {
            Self::Ok => "OK",
            Self::BelowFloor => "BELOW_FLOOR",
            Self::AtOrAboveCeiling => "AT_OR_ABOVE_CEILING",
        }
    }

    /// True only for `Ok`. Gates must use this, never a partial comparison.
    #[must_use]
    pub const fn is_trusted(self) -> bool {
        matches!(self, Self::Ok)
    }
}

/// Pure classifier, mirror of SLIDE `k3ClassifyTrustedClock`. No clock read.
#[must_use]
pub const fn classify_trusted_clock(now_unix_s: i64) -> TrustedClockClass {
    if now_unix_s < TRUSTED_CLOCK_FLOOR_UNIX_S {
        return TrustedClockClass::BelowFloor;
    }
    if now_unix_s >= TRUSTED_CLOCK_CEILING_UNIX_S {
        return TrustedClockClass::AtOrAboveCeiling;
    }
    TrustedClockClass::Ok
}

/// The reading itself when it is trusted, otherwise `None`.
#[must_use]
pub const fn trusted_unix_s(now_unix_s: i64) -> Option<i64> {
    if classify_trusted_clock(now_unix_s).is_trusted() {
        Some(now_unix_s)
    } else {
        None
    }
}

/// Elapsed whole seconds since the Unix epoch (as reported by the OS) to `i64`.
/// A count that does not fit `i64` is refused as `None`; it is never saturated.
#[must_use]
pub fn unix_seconds_from_elapsed_secs(secs: u64) -> Option<i64> {
    i64::try_from(secs).ok()
}

/// Signed nanoseconds to Unix seconds, flooring. Negative counts are refused
/// (a pre-epoch reading is not a trusted time), and the result must be inside
/// the trusted window.
#[must_use]
pub const fn signed_ns_to_trusted_unix_s(ns: i64) -> Option<i64> {
    if ns < 0 {
        return None;
    }
    // ns >= 0, so truncating division is floor division and cannot overflow.
    trusted_unix_s(ns / NANOS_PER_SECOND)
}

/// Unsigned nanoseconds (for example WASI `clock_time_get` realtime) to Unix
/// seconds. Values above `i64::MAX` are refused, then the window applies.
#[must_use]
pub fn unsigned_ns_to_trusted_unix_s(ns: u64) -> Option<i64> {
    let signed = i64::try_from(ns).ok()?;
    signed_ns_to_trusted_unix_s(signed)
}

/// Process clock in i64 Unix seconds. Pre-epoch or unrepresentable readings
/// fail closed as `0`, which every gate refuses (`<= 0` fails closed).
#[must_use]
pub fn process_unix_seconds() -> i64 {
    match std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH) {
        Ok(elapsed) => unix_seconds_from_elapsed_secs(elapsed.as_secs()).unwrap_or(0),
        Err(_) => 0,
    }
}

/// Mirror of SLIDE `k3TrustedClockStatus`: classify the live process clock.
#[must_use]
pub fn trusted_clock_status() -> TrustedClockClass {
    classify_trusted_clock(process_unix_seconds())
}

#[cfg(test)]
mod tests {
    use super::*;

    const F: i64 = TRUSTED_CLOCK_FLOOR_UNIX_S;
    const C: i64 = TRUSTED_CLOCK_CEILING_UNIX_S;

    #[test]
    fn window_constants_match_slide() {
        assert_eq!(F, 1_790_812_800, "2026-10-01T00:00:00Z");
        assert_eq!(C, 4_102_444_800, "2100-01-01T00:00:00Z");
    }

    #[test]
    fn edges_are_half_open() {
        assert_eq!(classify_trusted_clock(F - 1), TrustedClockClass::BelowFloor);
        assert_eq!(classify_trusted_clock(F), TrustedClockClass::Ok);
        assert_eq!(classify_trusted_clock(C - 1), TrustedClockClass::Ok);
        assert_eq!(classify_trusted_clock(C), TrustedClockClass::AtOrAboveCeiling);
    }

    #[test]
    fn non_positive_is_never_trusted() {
        for v in [i64::MIN, -1, 0] {
            assert_eq!(classify_trusted_clock(v), TrustedClockClass::BelowFloor, "{v}");
            assert_eq!(trusted_unix_s(v), None, "{v}");
        }
    }

    #[test]
    fn overflowing_elapsed_is_refused_not_saturated() {
        assert_eq!(unix_seconds_from_elapsed_secs(u64::MAX), None);
        assert_eq!(unix_seconds_from_elapsed_secs(i64::MAX as u64 + 1), None);
        assert_eq!(unix_seconds_from_elapsed_secs(i64::MAX as u64), Some(i64::MAX));
        assert_eq!(unix_seconds_from_elapsed_secs(0), Some(0));
    }

    #[test]
    fn process_reading_is_not_saturated_source_pin() {
        let src = include_str!("trusted_clock.rs");
        let body_start = src.find("pub fn process_unix_seconds").expect("fn present");
        let body = &src[body_start..body_start + 400];
        assert!(!body.contains("i64::MAX"), "process clock must not saturate to i64::MAX");
        assert!(body.contains("unwrap_or(0)"), "unrepresentable reading fails closed as 0");
    }
}

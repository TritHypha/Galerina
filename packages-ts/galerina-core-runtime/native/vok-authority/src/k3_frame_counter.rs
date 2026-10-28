//! N2 (2026-10-28): the process wrapper's legacy-0 counter cannot be raced past the cap.
//! B2 (2026-10-28): the invalid and closed failure ids are named constants, not raw literals.
//! Synthetic inputs only. The clock is a fixed value inside the bridge window, so these
//! tests never depend on today's date.

use crate::k3_frame::decode_legacy_frame_counted;
use crate::{
    FrameAlert, FrameLabel, K3_UNKNOWN_WIRE, LEGACY_UNKNOWN_ZERO_BRIDGE, LEGACY_UNKNOWN_ZERO_CAP,
    LEGACY_UNKNOWN_ZERO_EXPIRY_UNIX_S, VOK_TRIT_BARE_LEGACY_ZERO, VOK_TRIT_INVALID,
    VOK_TRIT_LEGACY_CLOSED,
};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Barrier};
use std::thread;

const LIB_RS: &str = include_str!("lib.rs");
const FRAME_RS: &str = include_str!("k3_frame.rs");
const LATTICE_RS: &str = include_str!("lattice.rs");

/// A trusted clock one second before the bridge expiry.
const OPEN_NOW: i64 = LEGACY_UNKNOWN_ZERO_EXPIRY_UNIX_S - 1;

fn fn_body<'a>(src: &'a str, sig: &str) -> &'a str {
    let start = src.find(sig).unwrap_or_else(|| panic!("missing {sig}"));
    let rest = &src[start..];
    let open = rest.find('{').expect("fn body open");
    let mut depth = 0usize;
    for (i, ch) in rest[open..].char_indices() {
        match ch {
            '{' => depth += 1,
            '}' => {
                depth -= 1;
                if depth == 0 {
                    return &rest[..open + i + 1];
                }
            }
            _ => {}
        }
    }
    panic!("unbalanced body for {sig}");
}

/// Source before the first inline test module (the whole file when there is none).
fn non_test_part(src: &str) -> &str {
    match src.find("mod tests {") {
        Some(at) => &src[..at],
        None => src,
    }
}

fn race_round(headroom: u64, threads: usize, calls: usize) -> (u64, u64, u64) {
    let counter = Arc::new(AtomicU64::new(LEGACY_UNKNOWN_ZERO_CAP - headroom));
    let gate = Arc::new(Barrier::new(threads));
    let expect_alert = if LEGACY_UNKNOWN_ZERO_BRIDGE {
        FrameAlert::CapReached
    } else {
        FrameAlert::None
    };
    let handles: Vec<_> = (0..threads)
        .map(|_| {
            let counter = Arc::clone(&counter);
            let gate = Arc::clone(&gate);
            thread::spawn(move || {
                gate.wait();
                let (mut accepted, mut closed) = (0u64, 0u64);
                for _ in 0..calls {
                    let got = decode_legacy_frame_counted(0, OPEN_NOW, &counter);
                    match got.label {
                        FrameLabel::Unknown => accepted += 1,
                        FrameLabel::LegacyClosed => {
                            assert_eq!(got.alert, expect_alert, "closed alert");
                            closed += 1;
                        }
                        other => panic!("framed legacy 0 decoded as {other:?}"),
                    }
                }
                (accepted, closed)
            })
        })
        .collect();
    let (mut accepted, mut closed) = (0u64, 0u64);
    for handle in handles {
        let (a, c) = handle.join().expect("racing caller panicked");
        accepted += a;
        closed += c;
    }
    (accepted, closed, counter.load(Ordering::SeqCst))
}

#[test]
fn n2_racing_callers_never_pass_the_cap() {
    const HEADROOM: u64 = 8;
    const THREADS: usize = 16;
    const CALLS: usize = 64;
    const ROUNDS: usize = 25;
    let total = (THREADS * CALLS) as u64;
    for round in 0..ROUNDS {
        let (accepted, closed, end) = race_round(HEADROOM, THREADS, CALLS);
        assert_eq!(accepted + closed, total, "round {round}: every call is labelled");
        if LEGACY_UNKNOWN_ZERO_BRIDGE {
            assert_eq!(accepted, HEADROOM, "round {round}: accepts must equal the headroom");
            assert_eq!(end, LEGACY_UNKNOWN_ZERO_CAP, "round {round}: counter lands on the cap");
        } else {
            assert_eq!(accepted, 0, "round {round}: closed bridge accepts nothing");
            assert_eq!(end, LEGACY_UNKNOWN_ZERO_CAP - HEADROOM, "round {round}: untouched");
        }
    }
}

#[test]
fn n2_racing_from_zero_counts_every_accept_exactly_once() {
    const THREADS: usize = 8;
    const CALLS: usize = 500;
    let counter = Arc::new(AtomicU64::new(0));
    let gate = Arc::new(Barrier::new(THREADS));
    let handles: Vec<_> = (0..THREADS)
        .map(|_| {
            let counter = Arc::clone(&counter);
            let gate = Arc::clone(&gate);
            thread::spawn(move || {
                gate.wait();
                let mut first_seen = 0u64;
                for _ in 0..CALLS {
                    if decode_legacy_frame_counted(0, OPEN_NOW, &counter).alert
                        == FrameAlert::FirstSeen
                    {
                        first_seen += 1;
                    }
                }
                first_seen
            })
        })
        .collect();
    let first_seen: u64 = handles.into_iter().map(|h| h.join().expect("caller")).sum();
    if LEGACY_UNKNOWN_ZERO_BRIDGE {
        assert_eq!(counter.load(Ordering::SeqCst), (THREADS * CALLS) as u64);
        assert_eq!(first_seen, 1, "FIRST_SEEN fires once per counter, not once per thread");
    } else {
        assert_eq!(counter.load(Ordering::SeqCst), 0);
        assert_eq!(first_seen, 0);
    }
}

#[test]
fn n2_sequential_reads_count_exactly() {
    let counter = AtomicU64::new(0);
    let first = decode_legacy_frame_counted(0, OPEN_NOW, &counter);
    if !LEGACY_UNKNOWN_ZERO_BRIDGE {
        assert_eq!(first.label, FrameLabel::LegacyClosed);
        assert_eq!(counter.load(Ordering::SeqCst), 0);
        return;
    }
    assert_eq!(first.label, FrameLabel::Unknown);
    assert_eq!(first.alert, FrameAlert::FirstSeen);
    assert_eq!(first.reads_after, 1);
    for n in 2..=3u64 {
        let got = decode_legacy_frame_counted(0, OPEN_NOW, &counter);
        assert_eq!(got.label, FrameLabel::Unknown);
        assert_eq!(got.alert, FrameAlert::None);
        assert_eq!(got.reads_after, n);
    }
    assert_eq!(counter.load(Ordering::SeqCst), 3);
}

#[test]
fn n2_refusals_and_canonical_values_never_write_the_counter() {
    let counter = AtomicU64::new(5);
    for (value, label) in [
        (1, FrameLabel::Admit),
        (-1, FrameLabel::Deny),
        (K3_UNKNOWN_WIRE, FrameLabel::Unknown),
    ] {
        let got = decode_legacy_frame_counted(value, OPEN_NOW, &counter);
        assert_eq!(got.label, label, "canonical {value}");
        assert_eq!(got.reads_after, 5, "canonical {value}");
    }
    for value in [2, -2, 128, 255, 0x80, i32::MAX, i32::MIN] {
        let got = decode_legacy_frame_counted(value, OPEN_NOW, &counter);
        assert_eq!(got.label, FrameLabel::Invalid, "invalid {value}");
        assert_eq!(got.alert, FrameAlert::None, "invalid {value}");
    }
    for now in [0, -1, i64::MIN, LEGACY_UNKNOWN_ZERO_EXPIRY_UNIX_S, i64::MAX] {
        let got = decode_legacy_frame_counted(0, now, &counter);
        assert_eq!(got.label, FrameLabel::LegacyClosed, "clock {now} fails closed");
        assert_eq!(got.alert, FrameAlert::None, "clock {now}");
    }
    assert_eq!(counter.load(Ordering::SeqCst), 5, "no refusal or canonical read was counted");
}

#[test]
fn n2_counter_at_or_past_cap_stays_put() {
    for start in [LEGACY_UNKNOWN_ZERO_CAP, LEGACY_UNKNOWN_ZERO_CAP + 1, u64::MAX] {
        let counter = AtomicU64::new(start);
        let got = decode_legacy_frame_counted(0, OPEN_NOW, &counter);
        assert_eq!(got.label, FrameLabel::LegacyClosed, "start {start}");
        if LEGACY_UNKNOWN_ZERO_BRIDGE {
            assert_eq!(got.alert, FrameAlert::CapReached, "start {start}");
        }
        assert_eq!(counter.load(Ordering::SeqCst), start, "start {start}");
    }
}

#[test]
fn n2_wrapper_has_no_read_then_add() {
    let wrapper = fn_body(LIB_RS, "pub fn decode_legacy_frame(value: i32)");
    assert!(wrapper.contains("decode_legacy_frame_counted("));
    assert!(wrapper.contains("&LEGACY_UNKNOWN_ZERO_READS"));
    for needle in [".load(", "fetch_update", "fetch_add", ".store("] {
        assert!(!wrapper.contains(needle), "decode_legacy_frame must not contain {needle}");
    }
    let counted = fn_body(FRAME_RS, "pub(crate) fn decode_legacy_frame_counted(");
    assert!(counted.contains("compare_exchange("), "accept must commit by compare-exchange");
    assert!(counted.contains("decode_legacy_frame_pure("));
    for needle in ["fetch_update", "fetch_add", ".store(", "SystemTime", "UNIX_EPOCH"] {
        assert!(!counted.contains(needle), "decode_legacy_frame_counted must not contain {needle}");
    }
}

#[test]
fn b2_failure_ids_are_pinned_and_distinct() {
    assert_eq!(VOK_TRIT_INVALID, "VOK_TRIT_INVALID");
    assert_eq!(VOK_TRIT_LEGACY_CLOSED, "VOK_TRIT_LEGACY_CLOSED");
    assert_ne!(VOK_TRIT_INVALID, VOK_TRIT_LEGACY_CLOSED);
    assert_ne!(VOK_TRIT_INVALID, VOK_TRIT_BARE_LEGACY_ZERO);
    assert_ne!(VOK_TRIT_LEGACY_CLOSED, VOK_TRIT_BARE_LEGACY_ZERO);
}

#[test]
fn b2_no_raw_failure_literals_in_non_test_code() {
    let invalid = concat!("\"", "VOK_TRIT_INVALID", "\"");
    let closed = concat!("\"", "VOK_TRIT_LEGACY_CLOSED", "\"");
    for (name, src) in [("lib.rs", LIB_RS), ("k3_frame.rs", FRAME_RS), ("lattice.rs", LATTICE_RS)] {
        let code = non_test_part(src);
        let allowed = usize::from(name == "lib.rs");
        assert_eq!(code.matches(invalid).count(), allowed, "{name}: raw invalid-trit literal");
        assert_eq!(code.matches(closed).count(), allowed, "{name}: raw legacy-closed literal");
    }
}

/// Bridge-flag mutant (step 2c): this fails the moment LEGACY_UNKNOWN_ZERO_BRIDGE is flipped.
/// The Step Z sunset flips it on purpose; when it does, change this pin in the same commit.
#[test]
fn bridge_flag_is_pinned_open_until_the_step_z_sunset() {
    assert!(
        LEGACY_UNKNOWN_ZERO_BRIDGE,
        "LEGACY_UNKNOWN_ZERO_BRIDGE was flipped; only the Step Z sunset may do that, with this pin"
    );
    let counter = AtomicU64::new(0);
    let got = decode_legacy_frame_counted(0, OPEN_NOW, &counter);
    assert_eq!(got.label, FrameLabel::Unknown, "open bridge reads framed legacy 0 as UNKNOWN");
    assert_eq!(counter.load(Ordering::SeqCst), 1);
}

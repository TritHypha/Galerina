//! MEM-R21 process tests: VOK trusted-clock window in lock-step with SLIDE.
//!
//! Gap map rows 4.1 (clock 0, -1, 1759276799, 4102444801 fail closed),
//! 4.3 (ns 2^63-1 / negative refused, not wrapped or saturated),
//! 4.6 (2147483648 accepted as i64), H13 (checked ns to s) and
//! H14 (trusted clock in a fixed window). Synthetic readings only.

use galerina_vok_authority::trusted_clock::{
    classify_trusted_clock, signed_ns_to_trusted_unix_s, trusted_clock_status, trusted_unix_s,
    unix_seconds_from_elapsed_secs, unsigned_ns_to_trusted_unix_s, TrustedClockClass,
    NANOS_PER_SECOND,
};
use galerina_vok_authority::{
    decode_legacy_frame_pure, k3_wasi_realtime_ns_to_unix_s, FrameLabel,
    LEGACY_UNKNOWN_ZERO_EXPIRY_UNIX_S, TRUSTED_CLOCK_CEILING_UNIX_S, TRUSTED_CLOCK_FLOOR_UNIX_S,
};

const F: i64 = TRUSTED_CLOCK_FLOOR_UNIX_S;
const C: i64 = TRUSTED_CLOCK_CEILING_UNIX_S;
const X: i64 = LEGACY_UNKNOWN_ZERO_EXPIRY_UNIX_S;

/// (reading, SLIDE label). The same rows as SLIDE tests/k3-trusted-clock-bounds.test.mjs
/// where they fit Number.isSafeInteger; i64 extremes are Rust-only.
fn rows() -> Vec<(i64, &'static str)> {
    vec![
        (i64::MIN, "BELOW_FLOOR"),
        (-1, "BELOW_FLOOR"),
        (0, "BELOW_FLOOR"),
        (1, "BELOW_FLOOR"),
        (1_759_276_799, "BELOW_FLOOR"),
        (F - 1, "BELOW_FLOOR"),
        (F, "OK"),
        (F + 1, "OK"),
        (1_793_115_900, "OK"),
        (X - 1, "OK"),
        (X, "OK"),
        (i64::from(i32::MAX), "OK"),
        (2_147_483_648, "OK"),
        (C - 1, "OK"),
        (C, "AT_OR_ABOVE_CEILING"),
        (4_102_444_801, "AT_OR_ABOVE_CEILING"),
        (i64::MAX, "AT_OR_ABOVE_CEILING"),
    ]
}

#[test]
fn classifier_matches_slide_labels() {
    for (now, label) in rows() {
        assert_eq!(classify_trusted_clock(now).label(), label, "now={now}");
        assert_eq!(trusted_unix_s(now).is_some(), label == "OK", "now={now}");
    }
}

#[test]
fn gap_4_1_named_readings_fail_closed() {
    for now in [0_i64, -1, 1_759_276_799, 4_102_444_801] {
        assert!(!classify_trusted_clock(now).is_trusted(), "now={now}");
    }
}

#[test]
fn gap_4_6_one_past_i32_max_is_an_ordinary_i64_time() {
    let t = 2_147_483_648_i64;
    assert!(t > i64::from(i32::MAX));
    assert_eq!(trusted_unix_s(t), Some(t));
    // No i32 truncation: the low 32 bits read as i32 would be negative.
    assert!((t as i32) < 0);
    assert_eq!(classify_trusted_clock(i64::from(t as i32)), TrustedClockClass::BelowFloor);
}

#[test]
fn gap_4_3_ns_extremes_refused_not_wrapped() {
    assert_eq!(signed_ns_to_trusted_unix_s(i64::MAX), None, "2^63-1 ns is year 2262, above ceiling");
    assert_eq!(signed_ns_to_trusted_unix_s(-1), None);
    assert_eq!(signed_ns_to_trusted_unix_s(i64::MIN), None);
    assert_eq!(signed_ns_to_trusted_unix_s(0), None);
    assert_eq!(unsigned_ns_to_trusted_unix_s(u64::MAX), None);
    assert_eq!(unsigned_ns_to_trusted_unix_s(i64::MAX as u64 + 1), None);
    assert_eq!(unsigned_ns_to_trusted_unix_s(i64::MAX as u64), None);
}

#[test]
fn h13_ns_to_s_floors_inside_window() {
    let open = 1_793_115_900_i64;
    let ns = open * NANOS_PER_SECOND;
    assert_eq!(signed_ns_to_trusted_unix_s(ns), Some(open));
    assert_eq!(signed_ns_to_trusted_unix_s(ns + NANOS_PER_SECOND - 1), Some(open));
    assert_eq!(signed_ns_to_trusted_unix_s(ns - 1), Some(open - 1));
    assert_eq!(signed_ns_to_trusted_unix_s(F * NANOS_PER_SECOND), Some(F));
    assert_eq!(signed_ns_to_trusted_unix_s(F * NANOS_PER_SECOND - 1), None);
    assert_eq!(signed_ns_to_trusted_unix_s(C * NANOS_PER_SECOND - 1), Some(C - 1));
    assert_eq!(signed_ns_to_trusted_unix_s(C * NANOS_PER_SECOND), None);
}

#[test]
fn unsigned_ns_agrees_with_existing_wasi_helper() {
    let mut probes: Vec<u64> = vec![0, 1, u64::MAX, i64::MAX as u64, i64::MAX as u64 + 1];
    for (now, _) in rows() {
        if now >= 0 && now <= i64::MAX / NANOS_PER_SECOND {
            let base = (now * NANOS_PER_SECOND) as u64;
            probes.extend([base, base + 1, base + (NANOS_PER_SECOND as u64) - 1]);
            if base > 0 {
                probes.push(base - 1);
            }
        }
    }
    for ns in probes {
        assert_eq!(
            unsigned_ns_to_trusted_unix_s(ns),
            k3_wasi_realtime_ns_to_unix_s(ns),
            "ns={ns}"
        );
    }
}

#[test]
fn elapsed_seconds_refuse_instead_of_saturating() {
    assert_eq!(unix_seconds_from_elapsed_secs(u64::MAX), None);
    assert_eq!(unix_seconds_from_elapsed_secs(1 << 63), None);
    assert_eq!(unix_seconds_from_elapsed_secs((1 << 63) - 1), Some(i64::MAX));
    // Even the largest representable reading is refused by the window.
    assert_eq!(
        classify_trusted_clock(unix_seconds_from_elapsed_secs((1 << 63) - 1).unwrap()),
        TrustedClockClass::AtOrAboveCeiling
    );
}

#[test]
fn process_wrapper_opens_legacy_zero_only_inside_window_and_before_expiry() {
    // The process wrapper passes the process clock as both the frame epoch and now.
    for (now, label) in rows() {
        let decoded = decode_legacy_frame_pure(1, now, 0, now, 0);
        let opens = matches!(decoded.label, FrameLabel::Unknown);
        let expect = label == "OK" && now < X;
        assert_eq!(opens, expect, "now={now} label={label}");
        if !opens {
            assert!(matches!(decoded.label, FrameLabel::LegacyClosed), "now={now}");
            assert_eq!(decoded.reads_after, 0, "refusals are not counted, now={now}");
        }
    }
}

#[test]
fn canonical_values_do_not_depend_on_the_clock() {
    for (now, _) in rows() {
        for (value, want) in [(1, "admit"), (-1, "deny"), (-128, "unknown")] {
            let decoded = decode_legacy_frame_pure(1, now, value, now, 0);
            let got = match decoded.label {
                FrameLabel::Admit => "admit",
                FrameLabel::Deny => "deny",
                FrameLabel::Unknown => "unknown",
                FrameLabel::Invalid => "invalid",
                FrameLabel::LegacyClosed => "closed",
            };
            assert_eq!(got, want, "now={now} value={value}");
        }
    }
}

#[test]
fn live_process_clock_is_trusted_on_a_sane_host() {
    // The test host clock is real and between 2026-10-01 and 2100-01-01.
    assert_eq!(trusted_clock_status(), TrustedClockClass::Ok);
}

#[test]
fn lib_process_wrapper_delegates_to_checked_clock_source_pin() {
    let lib = include_str!("../src/lib.rs");
    let start = lib.find("fn trusted_unix_seconds() -> i64").expect("wrapper present");
    let end = start + lib[start..].find("\n}").expect("wrapper body ends");
    let body = &lib[start..end];
    assert!(body.contains("trusted_clock::process_unix_seconds()"), "{body}");
    assert!(!body.contains("i64::MAX"), "wrapper must not saturate: {body}");
    assert!(!body.contains("as i64"), "wrapper must not cast unchecked: {body}");
}

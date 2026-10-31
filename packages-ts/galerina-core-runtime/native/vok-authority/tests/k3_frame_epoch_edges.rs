//! MEM-R26 process tests: K3 legacy frame epoch edges (gap map row 3.6).
//!
//! Row 3.6 asks that frame epochs -1, 0 and i64::MAX fail closed and that no
//! u32/i32 truncation can turn a hostile i64 epoch into an admitted one.
//! The in-crate `epoch_close_gate` test already covers i64::MIN, -1 and 0;
//! this file adds i64::MAX, the full set of truncation aliases (values whose
//! low 32 bits are an admitted epoch), clock and read-counter extremes, and a
//! source pin on every narrowing cast in src/k3_frame.rs.
//! Synthetic values only. K3 UNKNOWN stays 0x80 at byte boundaries; legacy 0
//! is admitted only inside a framed version-1 header before expiry.

use galerina_vok_authority::{
    decode_legacy_frame_pure, decode_legacy_frame_with_bridge, k3_unix_s_to_ymd,
    k3_wasi_realtime_ns_to_unix_s, FrameAlert, FrameDecode, FrameLabel, K3AlertNoopSink,
    K3_EPOCH_YMD_MAX, K3_EPOCH_YMD_MIN, K3_WIRE_VERSION_CANONICAL, K3_WIRE_VERSION_LEGACY,
    LEGACY_UNKNOWN_ZERO_CAP, LEGACY_UNKNOWN_ZERO_EXPIRY_UNIX_S, TRUSTED_CLOCK_CEILING_UNIX_S,
    TRUSTED_CLOCK_FLOOR_UNIX_S,
};

/// 2026-10-27T00:00:00Z, inside the trusted window and before legacy-0 expiry.
const OPEN_UNIX: i64 = 1_793_059_200;
/// The same day as a transitional YYYYMMDD epoch.
const OPEN_YMD: i64 = 20_261_027;
const TWO_32: i64 = 1_i64 << 32;
const TWO_31: i64 = 1_i64 << 31;

const SRC: &str = include_str!("../src/k3_frame.rs");

fn legacy_zero(epoch: i64, now_unix_s: i64, reads: u64) -> FrameDecode {
    decode_legacy_frame_pure(K3_WIRE_VERSION_LEGACY, epoch, 0, now_unix_s, reads)
}

fn closed(reads: u64) -> FrameDecode {
    FrameDecode {
        label: FrameLabel::LegacyClosed,
        reads_after: reads,
        alert: FrameAlert::None,
    }
}

/// Epochs that must never open a legacy-0 frame, whatever the low bits say.
fn hostile_epochs() -> Vec<(i64, &'static str)> {
    vec![
        (i64::MIN, "i64::MIN"),
        (i64::MIN + 1, "i64::MIN+1"),
        (-TWO_32, "-2^32"),
        (-OPEN_UNIX, "-OPEN_UNIX"),
        (-OPEN_YMD, "-OPEN_YMD"),
        (-1, "-1"),
        (0, "0"),
        (1, "1"),
        (i64::MAX, "i64::MAX"),
        (i64::MAX - 1, "i64::MAX-1"),
        (i64::from(i32::MAX) + 1, "i32::MAX+1"),
        (i64::from(u32::MAX), "u32::MAX"),
        (TWO_32, "2^32"),
        (TWO_32 + OPEN_YMD, "2^32+OPEN_YMD"),
        (TWO_32 + OPEN_UNIX, "2^32+OPEN_UNIX"),
        (2 * TWO_32 + OPEN_UNIX, "2^33+OPEN_UNIX"),
        ((1_i64 << 40) | OPEN_UNIX, "2^40|OPEN_UNIX"),
        ((1_i64 << 62) | OPEN_YMD, "2^62|OPEN_YMD"),
        (i64::MIN | OPEN_UNIX, "i64::MIN|OPEN_UNIX"),
        (i64::MIN | OPEN_YMD, "i64::MIN|OPEN_YMD"),
        (OPEN_UNIX - TWO_32, "OPEN_UNIX-2^32"),
        (OPEN_YMD - TWO_32, "OPEN_YMD-2^32"),
        (OPEN_UNIX + TWO_31, "OPEN_UNIX+2^31 (2094, past expiry)"),
        (TRUSTED_CLOCK_CEILING_UNIX_S, "ceiling"),
        (TRUSTED_CLOCK_CEILING_UNIX_S + TWO_32, "ceiling+2^32"),
        (TRUSTED_CLOCK_FLOOR_UNIX_S - 1, "floor-1"),
        (i64::from(K3_EPOCH_YMD_MIN) - 1, "ymd min-1"),
        (i64::from(K3_EPOCH_YMD_MAX) + 1, "ymd max+1"),
        (LEGACY_UNKNOWN_ZERO_EXPIRY_UNIX_S, "expiry"),
    ]
}

#[test]
fn baseline_open_epochs_admit_legacy_zero() {
    // Without this baseline the closed rows below could pass for the wrong reason.
    for epoch in [OPEN_UNIX, OPEN_YMD, TRUSTED_CLOCK_FLOOR_UNIX_S] {
        let got = legacy_zero(epoch, OPEN_UNIX, 0);
        assert_eq!(
            got,
            FrameDecode {
                label: FrameLabel::Unknown,
                reads_after: 1,
                alert: FrameAlert::FirstSeen,
            },
            "epoch {epoch} should open legacy 0 at OPEN_UNIX"
        );
    }
}

#[test]
fn hostile_epochs_close_without_counting() {
    for (epoch, name) in hostile_epochs() {
        for reads in [0_u64, 7, LEGACY_UNKNOWN_ZERO_CAP - 1] {
            assert_eq!(
                legacy_zero(epoch, OPEN_UNIX, reads),
                closed(reads),
                "epoch {name} ({epoch}) reads {reads} must close legacy 0 and not count"
            );
        }
    }
}

#[test]
fn hostile_epochs_close_with_bridge_and_sink() {
    let sink = K3AlertNoopSink::new();
    for (epoch, name) in hostile_epochs() {
        for bridge in [true, false] {
            let got = decode_legacy_frame_with_bridge(
                K3_WIRE_VERSION_LEGACY,
                epoch,
                0,
                OPEN_UNIX,
                3,
                bridge,
                &sink,
            );
            assert_eq!(got, closed(3), "epoch {name} bridge {bridge}");
        }
    }
}

#[test]
fn truncation_aliases_are_not_their_low_bits() {
    // Each alias has the low 32 bits of an admitted epoch. A truncating cast
    // (as i32 / as u32) anywhere on the epoch path would admit it.
    let aliases = [
        (TWO_32 + OPEN_YMD, OPEN_YMD),
        (TWO_32 + OPEN_UNIX, OPEN_UNIX),
        (2 * TWO_32 + OPEN_UNIX, OPEN_UNIX),
        ((1_i64 << 40) | OPEN_UNIX, OPEN_UNIX),
        ((1_i64 << 62) | OPEN_YMD, OPEN_YMD),
        (i64::MIN | OPEN_UNIX, OPEN_UNIX),
        (i64::MIN | OPEN_YMD, OPEN_YMD),
        (OPEN_UNIX - TWO_32, OPEN_UNIX),
        (OPEN_YMD - TWO_32, OPEN_YMD),
    ];
    for (alias, low) in aliases {
        assert_eq!(alias as i32 as i64, low, "alias {alias} low bits");
        assert_eq!(i64::from(alias as u32), low, "alias {alias} low bits unsigned");
        assert_eq!(legacy_zero(low, OPEN_UNIX, 0).label, FrameLabel::Unknown);
        assert_eq!(
            legacy_zero(alias, OPEN_UNIX, 0),
            closed(0),
            "alias {alias} of admitted {low} must close"
        );
    }
}

#[test]
fn canonical_values_do_not_depend_on_epoch() {
    // Version 2 never reads the epoch; version 1 with a non-zero value decodes
    // canonically. Hostile epochs must not change either answer or the counter.
    let rows = [
        (1, FrameLabel::Admit),
        (-1, FrameLabel::Deny),
        (-128, FrameLabel::Unknown),
        (2, FrameLabel::Invalid),
        (-2, FrameLabel::Invalid),
        (127, FrameLabel::Invalid),
        (128, FrameLabel::Invalid),
        (255, FrameLabel::Invalid),
        (i32::MIN, FrameLabel::Invalid),
        (i32::MAX, FrameLabel::Invalid),
    ];
    for (epoch, name) in hostile_epochs() {
        for (value, want) in rows {
            for version in [K3_WIRE_VERSION_LEGACY, K3_WIRE_VERSION_CANONICAL] {
                let got = decode_legacy_frame_pure(version, epoch, value, OPEN_UNIX, 5);
                assert_eq!(got.label, want, "v{version} value {value} epoch {name}");
                assert_eq!(got.reads_after, 5, "v{version} value {value} epoch {name}");
                assert_eq!(got.alert, FrameAlert::None);
            }
        }
        // Canonical version 2 refuses bare 0 regardless of epoch.
        let v2_zero = decode_legacy_frame_pure(K3_WIRE_VERSION_CANONICAL, epoch, 0, OPEN_UNIX, 5);
        assert_eq!(v2_zero.label, FrameLabel::Invalid, "v2 bare 0 epoch {name}");
        assert_eq!(v2_zero.reads_after, 5);
    }
}

#[test]
fn unknown_versions_refuse_at_every_epoch() {
    for (epoch, name) in hostile_epochs().into_iter().chain([(OPEN_UNIX, "OPEN_UNIX")]) {
        for version in [i32::MIN, -1, 0, 3, 128, i32::MAX] {
            let got = decode_legacy_frame_pure(version, epoch, 0, OPEN_UNIX, 0);
            assert_eq!(got.label, FrameLabel::Invalid, "version {version} epoch {name}");
            assert_eq!(got.reads_after, 0);
        }
    }
}

#[test]
fn clock_extremes_close_an_open_epoch() {
    for now in [
        i64::MIN,
        -1,
        0,
        LEGACY_UNKNOWN_ZERO_EXPIRY_UNIX_S,
        TRUSTED_CLOCK_CEILING_UNIX_S,
        i64::MAX,
    ] {
        for epoch in [OPEN_UNIX, OPEN_YMD] {
            assert_eq!(
                legacy_zero(epoch, now, 2),
                closed(2),
                "now {now} epoch {epoch} must close"
            );
        }
    }
    // Last open second still admits.
    assert_eq!(
        legacy_zero(OPEN_UNIX, LEGACY_UNKNOWN_ZERO_EXPIRY_UNIX_S - 1, 0).label,
        FrameLabel::Unknown
    );
}

#[test]
fn read_counter_extremes_never_wrap() {
    let at_cap = legacy_zero(OPEN_UNIX, OPEN_UNIX, LEGACY_UNKNOWN_ZERO_CAP);
    assert_eq!(at_cap.label, FrameLabel::LegacyClosed);
    assert_eq!(at_cap.reads_after, LEGACY_UNKNOWN_ZERO_CAP);
    assert_eq!(at_cap.alert, FrameAlert::CapReached);

    let max = legacy_zero(OPEN_UNIX, OPEN_UNIX, u64::MAX);
    assert_eq!(max.label, FrameLabel::LegacyClosed);
    assert_eq!(max.reads_after, u64::MAX, "u64::MAX reads must not wrap to 0");
    assert_eq!(max.alert, FrameAlert::CapReached);

    let last = legacy_zero(OPEN_UNIX, OPEN_UNIX, LEGACY_UNKNOWN_ZERO_CAP - 1);
    assert_eq!(last.label, FrameLabel::Unknown);
    assert_eq!(last.reads_after, LEGACY_UNKNOWN_ZERO_CAP);
    assert_eq!(last.alert, FrameAlert::None);

    // A hostile epoch at the cap still reports a plain close, not CapReached:
    // the epoch gate runs before the counter is looked at.
    assert_eq!(legacy_zero(i64::MAX, OPEN_UNIX, u64::MAX), closed(u64::MAX));
}

#[test]
fn unix_to_ymd_refuses_out_of_window() {
    for unix in [
        i64::MIN,
        -1,
        0,
        TRUSTED_CLOCK_FLOOR_UNIX_S - 1,
        TRUSTED_CLOCK_CEILING_UNIX_S,
        TRUSTED_CLOCK_CEILING_UNIX_S + TWO_32,
        i64::MAX,
    ] {
        assert_eq!(k3_unix_s_to_ymd(unix), None, "unix {unix}");
    }
    assert_eq!(k3_unix_s_to_ymd(OPEN_UNIX), Some(20_261_027));
    assert_eq!(k3_unix_s_to_ymd(OPEN_UNIX + 86_399), Some(20_261_027));
    assert_eq!(k3_unix_s_to_ymd(TRUSTED_CLOCK_CEILING_UNIX_S - 1), Some(20_991_231));
}

#[test]
fn wasi_ns_extremes_refuse() {
    let floor_ns = (TRUSTED_CLOCK_FLOOR_UNIX_S as u64) * 1_000_000_000;
    for ns in [
        0_u64,
        1,
        floor_ns - 1,
        i64::MAX as u64,
        i64::MAX as u64 + 1,
        u64::MAX,
        u64::MAX - 999_999_999,
        (TRUSTED_CLOCK_CEILING_UNIX_S as u64) * 1_000_000_000,
    ] {
        assert_eq!(k3_wasi_realtime_ns_to_unix_s(ns), None, "ns {ns}");
    }
    assert_eq!(k3_wasi_realtime_ns_to_unix_s(floor_ns), Some(TRUSTED_CLOCK_FLOOR_UNIX_S));
    assert_eq!(
        k3_wasi_realtime_ns_to_unix_s(floor_ns + 999_999_999),
        Some(TRUSTED_CLOCK_FLOOR_UNIX_S)
    );
}

fn production_src() -> &'static str {
    let cut = SRC
        .find("#[cfg(test)]\nmod tests")
        .or_else(|| SRC.find("#[cfg(test)]\r\nmod tests"))
        .expect("k3_frame.rs test module marker");
    &SRC[..cut]
}

fn fn_body<'a>(src: &'a str, sig: &str) -> &'a str {
    let start = src.find(sig).unwrap_or_else(|| panic!("missing {sig}"));
    let open = start + src[start..].find('{').expect("body open");
    let mut depth = 0_i32;
    for (i, ch) in src[open..].char_indices() {
        match ch {
            '{' => depth += 1,
            '}' => {
                depth -= 1;
                if depth == 0 {
                    return &src[start..open + i + 1];
                }
            }
            _ => {}
        }
    }
    panic!("unterminated {sig}");
}

#[test]
fn narrowing_casts_are_pinned_and_guarded() {
    // Every numeric `as` cast in production k3_frame.rs, by trimmed line.
    // A new cast on the epoch/clock path must be reviewed against row 3.6.
    let allowed = [
        "out.push(HEX[(byte >> 4) as usize] as char);",
        "out.push(HEX[(byte & 0x0f) as usize] as char);",
        "recent_count: snapshot.recent.len() as u64,",
        "if !is_positive_in_range_ymd(ymd as i32) {",
        "&& is_positive_in_range_ymd(ymd as i32)",
        "if ns > i64::MAX as u64 {",
        "let secs = (ns as i64) / 1_000_000_000;",
        "if !(1..=12).contains(&month) || day < 1 || day > i64::from(days_in_month(year as i32, month as i32))",
    ];
    let cast = [
        " as i8", " as u8", " as i16", " as u16", " as i32", " as u32", " as i64", " as u64",
        " as usize", " as isize", " as i128", " as u128",
    ];
    let mut found = Vec::new();
    for line in production_src().lines() {
        let t = line.trim();
        if t.starts_with("//") {
            continue;
        }
        if cast.iter().any(|c| {
            t.match_indices(c).any(|(i, _)| {
                let rest = &t[i + c.len()..];
                !rest.starts_with(|ch: char| ch.is_ascii_alphanumeric() || ch == '_')
            })
        }) {
            found.push(t.to_string());
        }
    }
    assert_eq!(found, allowed, "numeric cast set in src/k3_frame.rs changed");

    let src = production_src();
    // Each `ymd as i32` sits behind an explicit i32::MAX bound in the same function.
    let from_ymd = fn_body(src, "fn unix_s_from_ymd(");
    let guard = from_ymd.find("ymd > i64::from(i32::MAX)").expect("unix_s_from_ymd i32 guard");
    assert!(guard < from_ymd.find("ymd as i32").expect("cast"));
    let transitional = fn_body(src, "fn k3_ymd_transitional(");
    let guard = transitional
        .find("ymd <= i64::from(i32::MAX)")
        .expect("k3_ymd_transitional i32 guard");
    assert!(guard < transitional.find("ymd as i32").expect("cast"));
    // The ns cast sits behind the i64::MAX bound.
    let wasi = fn_body(src, "pub fn k3_wasi_realtime_ns_to_unix_s(");
    assert!(wasi.find("ns > i64::MAX as u64").unwrap() < wasi.find("(ns as i64)").unwrap());
    // The epoch gate refuses <= 0 before any window or YYYYMMDD reading.
    let admitted = fn_body(src, "fn k3_epoch_admitted(");
    assert!(admitted.find("epoch <= 0").unwrap() < admitted.find("k3_ymd_transitional").unwrap());
    // Epoch and clock stay i64 through the public frame API.
    let pure = fn_body(src, "pub fn decode_legacy_frame_pure(");
    assert!(pure.contains("epoch: i64,") && pure.contains("now_unix_s: i64,"));
    // The counter only ever saturates.
    assert!(!src.contains("wrapping_add"));
    assert!(src.contains("reads_so_far.saturating_add(1)"));
}

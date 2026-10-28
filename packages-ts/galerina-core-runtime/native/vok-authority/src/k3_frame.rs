//! Versioned-frame parity (Step 2c, behaviour addition).
//! Clock and counter are inputs. The process wrapper supplies them.

use std::sync::atomic::{AtomicU64, Ordering};

use crate::{
    Trit, K3_EPOCH_YMD_MAX, K3_EPOCH_YMD_MIN, K3_WIRE_VERSION_CANONICAL, K3_WIRE_VERSION_LEGACY,
    LEGACY_UNKNOWN_ZERO_BRIDGE, LEGACY_UNKNOWN_ZERO_CAP, LEGACY_UNKNOWN_ZERO_EXPIRY_UNIX_S,
    TRUSTED_CLOCK_CEILING_UNIX_S, TRUSTED_CLOCK_FLOOR_UNIX_S,
};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum FrameAlert {
    None,
    FirstSeen,
    CapReached,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum FrameLabel {
    Admit,
    Deny,
    Unknown,
    Invalid,
    LegacyClosed,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct FrameDecode {
    pub label: FrameLabel,
    pub reads_after: u64,
    pub alert: FrameAlert,
}

fn refuse_invalid(reads_so_far: u64) -> FrameDecode {
    FrameDecode {
        label: FrameLabel::Invalid,
        reads_after: reads_so_far,
        alert: FrameAlert::None,
    }
}

fn refuse_closed(reads_so_far: u64, alert: FrameAlert) -> FrameDecode {
    FrameDecode {
        label: FrameLabel::LegacyClosed,
        reads_after: reads_so_far,
        alert,
    }
}

fn decode_canonical_label(value: i32, reads_so_far: u64) -> FrameDecode {
    let label = match Trit::decode_canonical(value) {
        Ok((Trit::Admit, _)) => FrameLabel::Admit,
        Ok((Trit::Refuse, _)) => FrameLabel::Deny,
        Ok((Trit::Unknown, _)) => FrameLabel::Unknown,
        Err(_) => return refuse_invalid(reads_so_far),
    };
    FrameDecode {
        label,
        reads_after: reads_so_far,
        alert: FrameAlert::None,
    }
}

/// Off golden path / compatibility YYYYMMDD helper.
fn days_in_month(year: i32, month: i32) -> i32 {
    if month == 2 {
        let leap = year % 4 == 0 && (year % 100 != 0 || year % 400 == 0);
        return if leap { 29 } else { 28 };
    }
    if month == 4 || month == 6 || month == 9 || month == 11 {
        return 30;
    }
    31
}

/// Off golden path / compatibility YYYYMMDD helper.
fn is_positive_in_range_ymd(ymd: i32) -> bool {
    if ymd <= 0 {
        return false;
    }
    let year = ymd / 10_000;
    let month = (ymd / 100) % 100;
    let day = ymd % 100;
    (1..=9999).contains(&year)
        && (1..=12).contains(&month)
        && day >= 1
        && day <= days_in_month(year, month)
}

/// Howard Hinnant days_from_civil. Days since 1970-01-01 for a valid Gregorian date.
fn days_from_civil(year: i64, month: i64, day: i64) -> i64 {
    let y = if month <= 2 { year - 1 } else { year };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let mp = if month > 2 { month - 3 } else { month + 9 };
    let doy = (153 * mp + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

fn unix_s_from_ymd(ymd: i64) -> Option<i64> {
    if ymd <= 0 || ymd > i64::from(i32::MAX) {
        return None;
    }
    if !is_positive_in_range_ymd(ymd as i32) {
        return None;
    }
    let year = ymd / 10_000;
    let month = (ymd / 100) % 100;
    let day = ymd % 100;
    days_from_civil(year, month, day).checked_mul(86_400)
}

fn k3_ymd_transitional(ymd: i64) -> bool {
    ymd >= i64::from(K3_EPOCH_YMD_MIN)
        && ymd <= i64::from(K3_EPOCH_YMD_MAX)
        && ymd <= i64::from(i32::MAX)
        && is_positive_in_range_ymd(ymd as i32)
}

fn k3_epoch_admitted(epoch: i64) -> bool {
    if epoch <= 0 {
        return false;
    }
    if k3_ymd_transitional(epoch) {
        return match unix_s_from_ymd(epoch) {
            Some(unix) => {
                unix >= TRUSTED_CLOCK_FLOOR_UNIX_S && unix < TRUSTED_CLOCK_CEILING_UNIX_S
            }
            None => false,
        };
    }
    epoch >= TRUSTED_CLOCK_FLOOR_UNIX_S && epoch < TRUSTED_CLOCK_CEILING_UNIX_S
}

fn k3_epoch_to_unix_s(epoch: i64) -> Option<i64> {
    if k3_ymd_transitional(epoch) {
        return unix_s_from_ymd(epoch);
    }
    if epoch >= TRUSTED_CLOCK_FLOOR_UNIX_S && epoch < TRUSTED_CLOCK_CEILING_UNIX_S {
        return Some(epoch);
    }
    None
}

/// K3-CW (a): legacy-0 frame-side expiry. Defence in depth beside the process clock.
fn k3_legacy_zero_frame_epoch_open(epoch: i64) -> bool {
    match k3_epoch_to_unix_s(epoch) {
        Some(unix) => unix < LEGACY_UNKNOWN_ZERO_EXPIRY_UNIX_S,
        None => false,
    }
}

/// K3-CW (b) rec 1: WASI realtime u64 ns -> i64 unix seconds, floor / 1e9.
/// Values above i64::MAX or outside the trusted window fail closed.
pub fn k3_wasi_realtime_ns_to_unix_s(ns: u64) -> Option<i64> {
    if ns > i64::MAX as u64 {
        return None;
    }
    let secs = (ns as i64) / 1_000_000_000;
    if secs < TRUSTED_CLOCK_FLOOR_UNIX_S || secs >= TRUSTED_CLOCK_CEILING_UNIX_S {
        return None;
    }
    Some(secs)
}

fn parse_two_digits(bytes: &[u8], at: usize) -> Option<i64> {
    let tens = bytes.get(at)?;
    let ones = bytes.get(at + 1)?;
    if !tens.is_ascii_digit() || !ones.is_ascii_digit() {
        return None;
    }
    Some(i64::from(tens - b'0') * 10 + i64::from(ones - b'0'))
}

fn parse_four_digits(bytes: &[u8], at: usize) -> Option<i64> {
    let a = parse_two_digits(bytes, at)?;
    let b = parse_two_digits(bytes, at + 2)?;
    Some(a * 100 + b)
}

/// K3-CW (c) rec 5: ISO 8601 / RFC 3339 instant with mandatory Z.
/// Accepts 2026-10-27T15:45Z (17) and 2026-10-27T15:45:00Z (20). Pin = 1793115900.
pub fn k3_parse_serial_instant_unix_s(text: &str) -> Option<i64> {
    let bytes = text.as_bytes();
    if bytes.last().copied() != Some(b'Z') {
        return None;
    }
    let second = match bytes.len() {
        17 => 0_i64,
        20 => {
            if bytes[16] != b':' {
                return None;
            }
            parse_two_digits(bytes, 17)?
        }
        _ => return None,
    };
    if bytes[4] != b'-' || bytes[7] != b'-' || bytes[10] != b'T' || bytes[13] != b':' {
        return None;
    }
    let year = parse_four_digits(bytes, 0)?;
    let month = parse_two_digits(bytes, 5)?;
    let day = parse_two_digits(bytes, 8)?;
    let hour = parse_two_digits(bytes, 11)?;
    let minute = parse_two_digits(bytes, 14)?;
    if year < 1 || year > 9999 {
        return None;
    }
    if !(1..=12).contains(&month) || day < 1 || day > i64::from(days_in_month(year as i32, month as i32))
    {
        return None;
    }
    if !(0..=23).contains(&hour) || !(0..=59).contains(&minute) || !(0..=59).contains(&second) {
        return None;
    }
    let ymd = year * 10_000 + month * 100 + day;
    let day_unix = unix_s_from_ymd(ymd)?;
    let unix = day_unix.checked_add(hour * 3600 + minute * 60 + second)?;
    if unix < TRUSTED_CLOCK_FLOOR_UNIX_S || unix >= TRUSTED_CLOCK_CEILING_UNIX_S {
        return None;
    }
    Some(unix)
}

/// Half-open [start, end). Rejects unparseable instants, end <= start, out of window.
pub fn k3_serial_window_contains(start_text: &str, end_text: &str, now_unix_s: i64) -> bool {
    let Some(start) = k3_parse_serial_instant_unix_s(start_text) else {
        return false;
    };
    let Some(end) = k3_parse_serial_instant_unix_s(end_text) else {
        return false;
    };
    if end <= start {
        return false;
    }
    if now_unix_s < TRUSTED_CLOCK_FLOOR_UNIX_S || now_unix_s >= TRUSTED_CLOCK_CEILING_UNIX_S {
        return false;
    }
    now_unix_s >= start && now_unix_s < end
}

/// Pure framed decode. No process clock, no process counter.
/// Clock input is i64 Unix seconds UTC. now_unix_s <= 0 fails closed.
/// Legacy 0 is accepted only while now_unix_s < LEGACY_UNKNOWN_ZERO_EXPIRY_UNIX_S.
/// K3-EP: epoch is i64. Canonical form is Unix seconds; YYYYMMDD is transitional.
pub fn decode_legacy_frame_pure(
    version: i32,
    epoch: i64,
    value: i32,
    now_unix_s: i64,
    reads_so_far: u64,
) -> FrameDecode {
    if version == K3_WIRE_VERSION_CANONICAL {
        return decode_canonical_label(value, reads_so_far);
    }
    if version != K3_WIRE_VERSION_LEGACY {
        return refuse_invalid(reads_so_far);
    }
    if value != 0 {
        return decode_canonical_label(value, reads_so_far);
    }
    if !k3_epoch_admitted(epoch) {
        return refuse_closed(reads_so_far, FrameAlert::None);
    }
    if !k3_legacy_zero_frame_epoch_open(epoch) {
        return refuse_closed(reads_so_far, FrameAlert::None);
    }
    if now_unix_s <= 0 {
        return refuse_closed(reads_so_far, FrameAlert::None);
    }
    if !LEGACY_UNKNOWN_ZERO_BRIDGE {
        return refuse_closed(reads_so_far, FrameAlert::None);
    }
    if now_unix_s >= LEGACY_UNKNOWN_ZERO_EXPIRY_UNIX_S {
        return refuse_closed(reads_so_far, FrameAlert::None);
    }
    if reads_so_far >= LEGACY_UNKNOWN_ZERO_CAP {
        return refuse_closed(reads_so_far, FrameAlert::CapReached);
    }
    FrameDecode {
        label: FrameLabel::Unknown,
        reads_after: reads_so_far.saturating_add(1),
        alert: if reads_so_far == 0 {
            FrameAlert::FirstSeen
        } else {
            FrameAlert::None
        },
    }
}

/// Counted framed decode for the process wrapper (N2, 2026-10-28).
/// The pure decode runs against the counter value this caller read. An accepted legacy-0 read
/// is committed with one compare_exchange from that same value; if another caller moved the
/// counter first, the decode is redone against the new value. The cap check and the increment
/// are therefore one atomic step, and racing callers can never push the counter past
/// LEGACY_UNKNOWN_ZERO_CAP. Refusals and canonical values never write the counter.
pub(crate) fn decode_legacy_frame_counted(
    value: i32,
    now_unix_s: i64,
    counter: &AtomicU64,
) -> FrameDecode {
    let mut reads = counter.load(Ordering::SeqCst);
    loop {
        let decoded =
            decode_legacy_frame_pure(K3_WIRE_VERSION_LEGACY, now_unix_s, value, now_unix_s, reads);
        if decoded.reads_after <= reads {
            return decoded;
        }
        match counter.compare_exchange(
            reads,
            decoded.reads_after,
            Ordering::SeqCst,
            Ordering::SeqCst,
        ) {
            Ok(_) => return decoded,
            Err(actual) => reads = actual,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        legacy_unknown_zero_reads, Trit, TritWireForm, K3_EPOCH_YMD_MAX, K3_EPOCH_YMD_MIN,
        K3_UNKNOWN_WIRE, K3_WIRE_VERSION_CANONICAL, K3_WIRE_VERSION_LEGACY,
        LEGACY_UNKNOWN_ZERO_BRIDGE, LEGACY_UNKNOWN_ZERO_CAP, LEGACY_UNKNOWN_ZERO_EXPIRY_EPOCH,
        LEGACY_UNKNOWN_ZERO_EXPIRY_UNIX_S, TRUSTED_CLOCK_CEILING_UNIX_S,
        TRUSTED_CLOCK_FLOOR_UNIX_S,
    };

    const FRAME_RS: &str = include_str!("k3_frame.rs");
    const LIB_RS: &str = include_str!("lib.rs");
    const ROWS: &str = include_str!("../vectors/k3-wire-vectors.rows.txt");
    const OPEN_UNIX: i64 = 1_793_059_200;
    const LAST_UNIX: i64 = 1_798_761_599;
    const CLOSED_UNIX: i64 = 1_798_761_600;

    fn fn_body<'a>(src: &'a str, sig: &str) -> &'a str {
        let start = src.find(sig).unwrap_or_else(|| panic!("missing {sig}"));
        let open = src[start..]
            .find('{')
            .map(|i| start + i)
            .expect("open brace");
        let bytes = src.as_bytes();
        let mut depth = 0_i32;
        let mut i = open;
        while i < src.len() {
            match bytes[i] {
                b'{' => depth += 1,
                b'}' => {
                    depth -= 1;
                    if depth == 0 {
                        return &src[start..=i];
                    }
                }
                _ => {}
            }
            i += 1;
        }
        panic!("unclosed {sig}");
    }

    fn label_str(label: FrameLabel) -> &'static str {
        match label {
            FrameLabel::Admit => "ADMIT",
            FrameLabel::Deny => "DENY",
            FrameLabel::Unknown => "UNKNOWN",
            FrameLabel::Invalid => "INVALID",
            FrameLabel::LegacyClosed => "LEGACY_CLOSED",
        }
    }

    fn alert_str(alert: FrameAlert) -> &'static str {
        match alert {
            FrameAlert::None => "NONE",
            FrameAlert::FirstSeen => "FIRST_SEEN",
            FrameAlert::CapReached => "CAP_REACHED",
        }
    }

    fn expect_frame(
        version: i32,
        epoch: i64,
        value: i32,
        now_unix_s: i64,
        reads: u64,
        label: FrameLabel,
        reads_after: u64,
        alert: FrameAlert,
        ctx: &str,
    ) {
        let got = decode_legacy_frame_pure(version, epoch, value, now_unix_s, reads);
        assert_eq!(label_str(got.label), label_str(label), "{ctx} label");
        assert_eq!(got.reads_after, reads_after, "{ctx} reads_after");
        assert_eq!(alert_str(got.alert), alert_str(alert), "{ctx} alert");
    }

    #[test]
    fn unknown_version_is_invalid() {
        for version in [i32::MIN, -1, 0, 3, 4, i32::MAX] {
            expect_frame(
                version,
                0,
                0,
                OPEN_UNIX,
                0,
                FrameLabel::Invalid,
                0,
                FrameAlert::None,
                &format!("version {version}"),
            );
        }
    }

    #[test]
    fn version_two_is_canonical_only() {
        expect_frame(
            K3_WIRE_VERSION_CANONICAL,
            0,
            0,
            OPEN_UNIX,
            0,
            FrameLabel::Invalid,
            0,
            FrameAlert::None,
            "v2 value 0",
        );
        expect_frame(
            K3_WIRE_VERSION_CANONICAL,
            0,
            K3_UNKNOWN_WIRE,
            OPEN_UNIX,
            4,
            FrameLabel::Unknown,
            4,
            FrameAlert::None,
            "v2 -128",
        );
        expect_frame(
            K3_WIRE_VERSION_CANONICAL,
            0,
            1,
            OPEN_UNIX,
            4,
            FrameLabel::Admit,
            4,
            FrameAlert::None,
            "v2 admit",
        );
        expect_frame(
            K3_WIRE_VERSION_CANONICAL,
            0,
            -1,
            OPEN_UNIX,
            4,
            FrameLabel::Deny,
            4,
            FrameAlert::None,
            "v2 deny",
        );
    }

    #[test]
    fn expiry_includes_end_day() {
        expect_frame(
            K3_WIRE_VERSION_LEGACY,
            OPEN_UNIX,
            0,
            LAST_UNIX,
            0,
            FrameLabel::Unknown,
            1,
            FrameAlert::FirstSeen,
            "1798761599 must accept (< 1798761600)",
        );
        expect_frame(
            K3_WIRE_VERSION_LEGACY,
            OPEN_UNIX,
            0,
            CLOSED_UNIX,
            0,
            FrameLabel::LegacyClosed,
            0,
            FrameAlert::None,
            "1798761600 must close",
        );
    }

    #[test]
    fn cap_off_by_one_lock() {
        expect_frame(
            K3_WIRE_VERSION_LEGACY,
            OPEN_UNIX,
            0,
            OPEN_UNIX,
            LEGACY_UNKNOWN_ZERO_CAP - 1,
            FrameLabel::Unknown,
            LEGACY_UNKNOWN_ZERO_CAP,
            FrameAlert::None,
            "cap-1 accepts",
        );
        expect_frame(
            K3_WIRE_VERSION_LEGACY,
            OPEN_UNIX,
            0,
            OPEN_UNIX,
            LEGACY_UNKNOWN_ZERO_CAP,
            FrameLabel::LegacyClosed,
            LEGACY_UNKNOWN_ZERO_CAP,
            FrameAlert::CapReached,
            "cap refuses and does not count",
        );
        expect_frame(
            K3_WIRE_VERSION_LEGACY,
            OPEN_UNIX,
            0,
            OPEN_UNIX,
            LEGACY_UNKNOWN_ZERO_CAP + 1,
            FrameLabel::LegacyClosed,
            LEGACY_UNKNOWN_ZERO_CAP + 1,
            FrameAlert::CapReached,
            "cap+1 refuses and does not count",
        );
    }

    #[test]
    fn alerts_first_seen_and_cap_reached() {
        expect_frame(
            K3_WIRE_VERSION_LEGACY,
            OPEN_UNIX,
            0,
            OPEN_UNIX,
            0,
            FrameLabel::Unknown,
            1,
            FrameAlert::FirstSeen,
            "first accept",
        );
        expect_frame(
            K3_WIRE_VERSION_LEGACY,
            OPEN_UNIX,
            0,
            OPEN_UNIX,
            1,
            FrameLabel::Unknown,
            2,
            FrameAlert::None,
            "second accept",
        );
        expect_frame(
            K3_WIRE_VERSION_LEGACY,
            OPEN_UNIX,
            0,
            OPEN_UNIX,
            LEGACY_UNKNOWN_ZERO_CAP,
            FrameLabel::LegacyClosed,
            LEGACY_UNKNOWN_ZERO_CAP,
            FrameAlert::CapReached,
            "cap alert",
        );
        expect_frame(
            K3_WIRE_VERSION_LEGACY,
            OPEN_UNIX,
            0,
            CLOSED_UNIX,
            LEGACY_UNKNOWN_ZERO_CAP,
            FrameLabel::LegacyClosed,
            LEGACY_UNKNOWN_ZERO_CAP,
            FrameAlert::None,
            "clock fails before cap, alert is not CAP_REACHED",
        );
    }

    #[test]
    fn now_unix_s_closed_a2f() {
        for now_unix_s in [i64::MIN, -1, 0, CLOSED_UNIX, i64::from(i32::MAX)] {
            expect_frame(
                K3_WIRE_VERSION_LEGACY,
                OPEN_UNIX,
                0,
                now_unix_s,
                0,
                FrameLabel::LegacyClosed,
                0,
                FrameAlert::None,
                &format!("closed now_unix_s {now_unix_s}"),
            );
        }
    }

    #[test]
    fn ymd_helpers_remain_off_golden_path() {
        assert!(!is_positive_in_range_ymd(-1));
        assert!(!is_positive_in_range_ymd(0));
        assert!(!is_positive_in_range_ymd(20260231));
        assert!(is_positive_in_range_ymd(20261027));
    }

    #[test]
    fn epoch_close_gate() {
        for epoch in [
            i64::MIN,
            -1,
            0,
            20_261_026,
            20_260_230,
            21_000_101,
            TRUSTED_CLOCK_FLOOR_UNIX_S - 1,
            TRUSTED_CLOCK_CEILING_UNIX_S,
        ] {
            expect_frame(
                K3_WIRE_VERSION_LEGACY,
                epoch,
                0,
                OPEN_UNIX,
                0,
                FrameLabel::LegacyClosed,
                0,
                FrameAlert::None,
                &format!("epoch {epoch}"),
            );
        }
        for epoch in [
            i64::from(K3_EPOCH_YMD_MIN),
            i64::from(LEGACY_UNKNOWN_ZERO_EXPIRY_EPOCH),
            TRUSTED_CLOCK_FLOOR_UNIX_S,
            OPEN_UNIX,
            LAST_UNIX,
        ] {
            expect_frame(
                K3_WIRE_VERSION_LEGACY,
                epoch,
                0,
                OPEN_UNIX,
                0,
                FrameLabel::Unknown,
                1,
                FrameAlert::FirstSeen,
                &format!("admitted open-expiry epoch {epoch}"),
            );
        }
        for epoch in [
            20_270_101,
            i64::from(K3_EPOCH_YMD_MAX),
            CLOSED_UNIX,
            i64::from(i32::MAX),
        ] {
            expect_frame(
                K3_WIRE_VERSION_LEGACY,
                epoch,
                0,
                OPEN_UNIX,
                0,
                FrameLabel::LegacyClosed,
                0,
                FrameAlert::None,
                &format!("frame-epoch expiry {epoch}"),
            );
        }
    }

    #[test]
    fn ymd_unix_roundtrip_and_date_edges() {
        assert_eq!(unix_s_from_ymd(20_261_027), Some(OPEN_UNIX));
        assert_eq!(crate::civil_ymd_from_unix_days(OPEN_UNIX / 86_400), 20_261_027);
        assert!(k3_ymd_transitional(i64::from(K3_EPOCH_YMD_MIN)));
        assert!(k3_ymd_transitional(i64::from(K3_EPOCH_YMD_MAX)));
        assert!(!k3_ymd_transitional(20_261_026));
        assert!(!k3_ymd_transitional(20_260_230));
        assert!(!k3_ymd_transitional(21_000_101));
        assert!(k3_epoch_admitted(OPEN_UNIX));
        assert!(!k3_epoch_admitted(0));
        assert!(!k3_epoch_admitted(TRUSTED_CLOCK_CEILING_UNIX_S));
    }

    #[test]
    fn fixture_frames_including_a2f_unix_clock() {
        let mut seen = 0_u32;
        for line in ROWS.lines() {
            let mut parts = line.splitn(3, '|');
            let Some("frames") = parts.next() else { continue };
            let input = parts.next().expect("frame input");
            let expected = parts.next().expect("frame expected");
            seen += 1;
            let mut version = 0;
            let mut epoch = 0_i64;
            let mut value = 0;
            let mut now_unix_s = 0_i64;
            let mut reads = 0_u64;
            for field in input.split(',') {
                let (k, v) = field.split_once('=').expect(field);
                match k {
                    "version" => version = v.parse().unwrap(),
                    "epoch" => epoch = v.parse().unwrap(),
                    "value" => value = v.parse().unwrap(),
                    "nowUnixSeconds" => now_unix_s = v.parse().unwrap(),
                    "readsSoFar" => reads = v.parse().unwrap(),
                    other => panic!("unknown frame key {other}"),
                }
            }
            let mut label = "";
            let mut reads_after = 0_u64;
            let mut alert = "";
            for field in expected.split(';') {
                if let Some(v) = field.strip_prefix("readsAfter=") {
                    reads_after = v.parse().unwrap();
                } else if let Some(v) = field.strip_prefix("alert=") {
                    alert = v;
                } else {
                    label = field;
                }
            }
            let got = decode_legacy_frame_pure(version, epoch, value, now_unix_s, reads);
            assert_eq!(label_str(got.label), label, "{input}");
            assert_eq!(got.reads_after, reads_after, "{input}");
            assert_eq!(alert_str(got.alert), alert, "{input}");
        }
        assert!(seen >= 32, "fixture frame rows, got {seen}");
    }

    #[test]
    fn pure_fn_does_not_read_a_clock() {
        let body = fn_body(
            FRAME_RS,
            "pub fn decode_legacy_frame_pure(",
        );
        for needle in [
            "SystemTime",
            "Instant",
            "UNIX_EPOCH",
            "std::time",
            "Utc::now",
            "DateTime",
            "now()",
        ] {
            assert!(
                !body.contains(needle),
                "decode_legacy_frame_pure must not contain {needle}"
            );
        }
    }

    #[test]
    fn pure_fn_does_not_call_lattice() {
        let body = fn_body(
            FRAME_RS,
            "pub fn decode_legacy_frame_pure(",
        );
        assert!(
            !body.contains("from_lattice")
                && !body.contains("to_lattice")
                && !body.contains("lattice::"),
            "decode_legacy_frame_pure must not call lattice converters"
        );
    }

    #[test]
    fn frame_decode_has_only_label_reads_after_alert() {
        let body = fn_body(FRAME_RS, "pub struct FrameDecode");
        assert!(body.contains("pub label: FrameLabel"));
        assert!(body.contains("pub reads_after: u64"));
        assert!(body.contains("pub alert: FrameAlert"));
        assert_eq!(
            body.matches("pub ").count(),
            4,
            "FrameDecode fields are label, reads_after, alert only"
        );
    }

    #[test]
    fn decode_legacy_frame_is_delegating_wrapper() {
        let body = fn_body(LIB_RS, "pub fn decode_legacy_frame(value: i32)");
        assert!(
            body.contains("decode_legacy_frame_counted("),
            "decode_legacy_frame must delegate to decode_legacy_frame_counted (N2)"
        );
        let counted = fn_body(FRAME_RS, "pub(crate) fn decode_legacy_frame_counted(");
        assert!(
            counted.contains("decode_legacy_frame_pure("),
            "decode_legacy_frame_counted must delegate to decode_legacy_frame_pure"
        );
    }

    #[test]
    fn civil_ymd_unix_epoch_and_today() {
        assert_eq!(crate::civil_ymd_from_unix_days(0), 19700101);
        assert_eq!(crate::civil_ymd_from_unix_days(20753), 20261027);
    }

    #[test]
    fn i32_api_unchanged_for_canonical_and_legacy_zero() {
        assert!(LEGACY_UNKNOWN_ZERO_BRIDGE);
        assert_eq!(
            Trit::decode_legacy_frame(-1),
            Ok((Trit::Refuse, TritWireForm::Canonical))
        );
        assert_eq!(
            Trit::decode_legacy_frame(-128),
            Ok((Trit::Unknown, TritWireForm::Canonical))
        );
        assert_eq!(
            Trit::decode_legacy_frame(1),
            Ok((Trit::Admit, TritWireForm::Canonical))
        );
        let now_unix_s = match std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH) {
            Ok(elapsed) => {
                let secs = elapsed.as_secs();
                if secs > i64::MAX as u64 {
                    i64::MAX
                } else {
                    secs as i64
                }
            }
            Err(_) => 0,
        };
        let clock_open = now_unix_s > 0 && now_unix_s < LEGACY_UNKNOWN_ZERO_EXPIRY_UNIX_S;
        if clock_open {
            let before = legacy_unknown_zero_reads();
            assert_eq!(
                Trit::decode_legacy_frame(0),
                Ok((Trit::Unknown, TritWireForm::LegacyUnknownZero))
            );
            assert!(legacy_unknown_zero_reads() > before);
        } else {
            let err = Trit::decode_legacy_frame(0)
                .expect_err("i32 wrapper must close when the trusted clock is past expiry");
            assert_eq!(err.outcome(), Trit::Refuse);
            assert_eq!(err.failure_id(), "VOK_TRIT_LEGACY_CLOSED");
        }
    }

    #[test]
    fn k3cw_wasi_realtime_ns_conversion() {
        let open_ns = (OPEN_UNIX as u64).checked_mul(1_000_000_000).unwrap();
        assert_eq!(k3_wasi_realtime_ns_to_unix_s(open_ns), Some(OPEN_UNIX));
        assert_eq!(
            k3_wasi_realtime_ns_to_unix_s(open_ns + 999_999_999),
            Some(OPEN_UNIX)
        );
        assert_eq!(k3_wasi_realtime_ns_to_unix_s(0), None);
        assert_eq!(k3_wasi_realtime_ns_to_unix_s(1_000_000_000), None);
        assert_eq!(
            k3_wasi_realtime_ns_to_unix_s(i64::MAX as u64 + 1),
            None,
            "WASI overflow edge ns > i64::MAX"
        );
        assert_eq!(k3_wasi_realtime_ns_to_unix_s(u64::MAX), None);
        let ceiling_ns = (TRUSTED_CLOCK_CEILING_UNIX_S as u64)
            .checked_mul(1_000_000_000)
            .unwrap();
        assert_eq!(k3_wasi_realtime_ns_to_unix_s(ceiling_ns), None);
    }

    #[test]
    fn k3cw_serial_window_parser() {
        assert_eq!(
            k3_parse_serial_instant_unix_s("2026-10-27T15:45Z"),
            Some(1_793_115_900)
        );
        assert_eq!(
            k3_parse_serial_instant_unix_s("2026-10-27T15:45:00Z"),
            Some(1_793_115_900)
        );
        assert_eq!(k3_parse_serial_instant_unix_s("2026-10-27T15:45:00"), None);
        assert_eq!(
            k3_parse_serial_instant_unix_s("2026-10-27T15:45:00+00:00"),
            None
        );
        assert_eq!(
            k3_parse_serial_instant_unix_s("2026-10-27T15:45:00+01:00"),
            None
        );
        assert_eq!(k3_parse_serial_instant_unix_s("2026-02-30T15:45Z"), None);
        assert_eq!(k3_parse_serial_instant_unix_s("1970-01-01T00:00:00Z"), None);
        assert_eq!(k3_parse_serial_instant_unix_s("2100-01-01T00:00:00Z"), None);
        assert!(k3_serial_window_contains(
            "2026-10-27T15:45Z",
            "2026-10-27T15:46Z",
            1_793_115_900
        ));
        assert!(!k3_serial_window_contains(
            "2026-10-27T15:45Z",
            "2026-10-27T15:46Z",
            1_793_115_960
        ));
        assert!(!k3_serial_window_contains(
            "2026-10-27T15:46Z",
            "2026-10-27T15:45Z",
            1_793_115_900
        ));
        assert!(!k3_serial_window_contains(
            "2026-10-27T15:45Z",
            "2026-10-27T15:45Z",
            1_793_115_900
        ));
    }
}

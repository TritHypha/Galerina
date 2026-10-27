//! Versioned-frame parity (Step 2c, behaviour addition).
//! Clock and counter are inputs. The process wrapper supplies them.

use crate::{
    Trit, K3_WIRE_VERSION_CANONICAL, K3_WIRE_VERSION_LEGACY, LEGACY_UNKNOWN_ZERO_BRIDGE,
    LEGACY_UNKNOWN_ZERO_CAP, LEGACY_UNKNOWN_ZERO_EXPIRY_EPOCH,
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

fn is_positive_in_range_ymd(ymd: i32) -> bool {
    if ymd <= 0 {
        return false;
    }
    let year = ymd / 10_000;
    let month = (ymd / 100) % 100;
    let day = ymd % 100;
    (1..=9999).contains(&year) && (1..=12).contains(&month) && (1..=31).contains(&day)
}

/// Pure framed decode. No process clock, no process counter.
pub fn decode_legacy_frame_pure(
    version: i32,
    epoch: i32,
    value: i32,
    now_ymd: i32,
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
    if epoch < 0 || epoch > LEGACY_UNKNOWN_ZERO_EXPIRY_EPOCH {
        return refuse_closed(reads_so_far, FrameAlert::None);
    }
    if !is_positive_in_range_ymd(now_ymd) {
        return refuse_closed(reads_so_far, FrameAlert::None);
    }
    if !LEGACY_UNKNOWN_ZERO_BRIDGE {
        return refuse_closed(reads_so_far, FrameAlert::None);
    }
    if now_ymd > LEGACY_UNKNOWN_ZERO_EXPIRY_EPOCH {
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        legacy_unknown_zero_reads, Trit, TritWireForm, K3_UNKNOWN_WIRE,
        LEGACY_UNKNOWN_ZERO_BRIDGE,
    };

    const FRAME_RS: &str = include_str!("k3_frame.rs");
    const LIB_RS: &str = include_str!("lib.rs");
    const ROWS: &str = include_str!("../vectors/k3-wire-vectors.rows.txt");

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
        epoch: i32,
        value: i32,
        now_ymd: i32,
        reads: u64,
        label: FrameLabel,
        reads_after: u64,
        alert: FrameAlert,
        ctx: &str,
    ) {
        let got = decode_legacy_frame_pure(version, epoch, value, now_ymd, reads);
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
                20261027,
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
            20261027,
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
            20261027,
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
            20261027,
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
            20261027,
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
            0,
            0,
            LEGACY_UNKNOWN_ZERO_EXPIRY_EPOCH,
            0,
            FrameLabel::Unknown,
            1,
            FrameAlert::FirstSeen,
            "20261231 must accept (<=)",
        );
        expect_frame(
            K3_WIRE_VERSION_LEGACY,
            0,
            0,
            20270101,
            0,
            FrameLabel::LegacyClosed,
            0,
            FrameAlert::None,
            "20270101 must close",
        );
    }

    #[test]
    fn cap_off_by_one_lock() {
        expect_frame(
            K3_WIRE_VERSION_LEGACY,
            0,
            0,
            20261027,
            LEGACY_UNKNOWN_ZERO_CAP - 1,
            FrameLabel::Unknown,
            LEGACY_UNKNOWN_ZERO_CAP,
            FrameAlert::None,
            "cap-1 accepts",
        );
        expect_frame(
            K3_WIRE_VERSION_LEGACY,
            0,
            0,
            20261027,
            LEGACY_UNKNOWN_ZERO_CAP,
            FrameLabel::LegacyClosed,
            LEGACY_UNKNOWN_ZERO_CAP,
            FrameAlert::CapReached,
            "cap refuses and does not count",
        );
        expect_frame(
            K3_WIRE_VERSION_LEGACY,
            0,
            0,
            20261027,
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
            0,
            0,
            20261027,
            0,
            FrameLabel::Unknown,
            1,
            FrameAlert::FirstSeen,
            "first accept",
        );
        expect_frame(
            K3_WIRE_VERSION_LEGACY,
            0,
            0,
            20261027,
            1,
            FrameLabel::Unknown,
            2,
            FrameAlert::None,
            "second accept",
        );
        expect_frame(
            K3_WIRE_VERSION_LEGACY,
            0,
            0,
            20261027,
            LEGACY_UNKNOWN_ZERO_CAP,
            FrameLabel::LegacyClosed,
            LEGACY_UNKNOWN_ZERO_CAP,
            FrameAlert::CapReached,
            "cap alert",
        );
        expect_frame(
            K3_WIRE_VERSION_LEGACY,
            0,
            0,
            20270101,
            LEGACY_UNKNOWN_ZERO_CAP,
            FrameLabel::LegacyClosed,
            LEGACY_UNKNOWN_ZERO_CAP,
            FrameAlert::None,
            "clock fails before cap, alert is not CAP_REACHED",
        );
    }

    #[test]
    fn now_ymd_invalid_fails_closed_a2_interim() {
        for now_ymd in [i32::MIN, -1, 0, 13, 20261301, 20260001, 2147483647] {
            expect_frame(
                K3_WIRE_VERSION_LEGACY,
                0,
                0,
                now_ymd,
                0,
                FrameLabel::LegacyClosed,
                0,
                FrameAlert::None,
                &format!("invalid now_ymd {now_ymd}"),
            );
        }
    }

    #[test]
    fn epoch_close_gate() {
        for epoch in [i32::MIN, -1, 20270101, i32::MAX] {
            expect_frame(
                K3_WIRE_VERSION_LEGACY,
                epoch,
                0,
                20261027,
                0,
                FrameLabel::LegacyClosed,
                0,
                FrameAlert::None,
                &format!("epoch {epoch}"),
            );
        }
        expect_frame(
            K3_WIRE_VERSION_LEGACY,
            LEGACY_UNKNOWN_ZERO_EXPIRY_EPOCH,
            0,
            LEGACY_UNKNOWN_ZERO_EXPIRY_EPOCH,
            0,
            FrameLabel::Unknown,
            1,
            FrameAlert::FirstSeen,
            "epoch at expiry still open",
        );
    }

    #[test]
    fn fixture_frames_except_a2_now_ymd_minus_one() {
        let mut seen = 0_u32;
        for line in ROWS.lines() {
            let mut parts = line.splitn(3, '|');
            let Some("frames") = parts.next() else { continue };
            let input = parts.next().expect("frame input");
            let expected = parts.next().expect("frame expected");
            if input.contains("nowYmd=-1") {
                continue;
            }
            seen += 1;
            let mut version = 0;
            let mut epoch = 0;
            let mut value = 0;
            let mut now_ymd = 0;
            let mut reads = 0_u64;
            for field in input.split(',') {
                let (k, v) = field.split_once('=').expect(field);
                match k {
                    "version" => version = v.parse().unwrap(),
                    "epoch" => epoch = v.parse().unwrap(),
                    "value" => value = v.parse().unwrap(),
                    "nowYmd" => now_ymd = v.parse().unwrap(),
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
            let got = decode_legacy_frame_pure(version, epoch, value, now_ymd, reads);
            assert_eq!(label_str(got.label), label, "{input}");
            assert_eq!(got.reads_after, reads_after, "{input}");
            assert_eq!(alert_str(got.alert), alert, "{input}");
        }
        assert!(seen >= 18, "fixture frame rows excluding A2, got {seen}");
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
            body.contains("decode_legacy_frame_pure"),
            "decode_legacy_frame must delegate to decode_legacy_frame_pure"
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
        let now_ymd = match std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH) {
            Ok(elapsed) => crate::civil_ymd_from_unix_days((elapsed.as_secs() / 86_400) as i64),
            Err(_) => -1,
        };
        let year = now_ymd / 10_000;
        let month = (now_ymd / 100) % 100;
        let day = now_ymd % 100;
        let clock_open = now_ymd > 0
            && (1..=9999).contains(&year)
            && (1..=12).contains(&month)
            && (1..=31).contains(&day)
            && now_ymd <= LEGACY_UNKNOWN_ZERO_EXPIRY_EPOCH;
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
}

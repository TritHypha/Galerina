//! Step 2a red tests: VOK u8 reader, signed wrapper, N6 load8 and encode round-trip.
//! Oracle is the pinned vectors rows file (sha256 header matches JSON digest D).

use super::*;

const ROWS: &str = include_str!("../vectors/k3-wire-vectors.rows.txt");
const LIB_RS: &str = include_str!("lib.rs");

fn rows(section: &str) -> Vec<(&'static str, &'static str)> {
    ROWS.lines()
        .filter_map(|line| {
            let mut parts = line.splitn(3, '|');
            let sec = parts.next()?;
            let input = parts.next()?;
            let expected = parts.next()?;
            (sec == section).then_some((input, expected))
        })
        .collect()
}

fn comma_i32(value: &str) -> Vec<i32> {
    value
        .split(',')
        .map(|part| part.parse::<i32>().unwrap_or_else(|_| panic!("i32 {part}")))
        .collect()
}

fn assert_label(got: Result<(Trit, TritWireForm), VokFailure>, label: &str, context: &str) {
    match label {
        "ADMIT" => assert_eq!(got, Ok((Trit::Admit, TritWireForm::Canonical)), "{context}"),
        "REFUSE" => assert_eq!(got, Ok((Trit::Refuse, TritWireForm::Canonical)), "{context}"),
        "UNKNOWN" => assert_eq!(got, Ok((Trit::Unknown, TritWireForm::Canonical)), "{context}"),
        "BARE_LEGACY_ZERO" => {
            let err = got.expect_err(context);
            assert_eq!(err.outcome(), Trit::Refuse, "{context}");
            assert_eq!(err.failure_id(), VOK_TRIT_BARE_LEGACY_ZERO, "{context}");
        }
        "INVALID" => {
            let err = got.expect_err(context);
            assert_eq!(err.outcome(), Trit::Refuse, "{context}");
            assert_eq!(err.failure_id(), "VOK_TRIT_INVALID", "{context}");
        }
        other => panic!("{context}: unknown oracle label {other}"),
    }
}

#[test]
fn trit_u8_oracle_256() {
    let table = rows("u8");
    assert_eq!(table.len(), 256, "fixture u8 oracle is exhaustive");
    for (input, expected) in table {
        let byte: u8 = input.parse().expect("u8 input");
        assert_label(
            Trit::decode_wire_u8(byte),
            expected,
            &format!("u8 {byte}"),
        );
    }
}

#[test]
fn trit_u8_refuses_zero() {
    let err = Trit::decode_wire_u8(0).expect_err("0x00 is bare legacy zero");
    assert_eq!(err.outcome(), Trit::Refuse);
    assert_eq!(err.failure_id(), VOK_TRIT_BARE_LEGACY_ZERO);
}

#[test]
fn trit_u8_zero_counts_as_bare_legacy_zero_refusal() {
    let before = bare_legacy_zero_refusals();
    let err = Trit::decode_wire_u8(0x00).expect_err("0x00 is bare legacy zero");
    assert_eq!(err.outcome(), Trit::Refuse);
    assert_eq!(err.failure_id(), VOK_TRIT_BARE_LEGACY_ZERO);
    assert!(
        bare_legacy_zero_refusals() > before,
        "decode_wire_u8(0x00) must count a bare-legacy-zero refusal"
    );
}

#[test]
fn trit_u8_refuses_0x7f_0x81() {
    for byte in [0x7F_u8, 0x81_u8] {
        let err = Trit::decode_wire_u8(byte).expect_err("non-named byte is INVALID");
        assert_eq!(err.outcome(), Trit::Refuse);
        assert_eq!(err.failure_id(), "VOK_TRIT_INVALID", "byte {byte}");
        assert_ne!(err.failure_id(), VOK_TRIT_BARE_LEGACY_ZERO);
    }
}

#[test]
fn trit_u8_ff_is_deny() {
    assert_eq!(
        Trit::decode_wire_u8(0xFF),
        Ok((Trit::Refuse, TritWireForm::Canonical))
    );
}

#[test]
fn trit_u8_80_is_unknown() {
    assert_eq!(
        Trit::decode_wire_u8(0x80),
        Ok((Trit::Unknown, TritWireForm::Canonical))
    );
}

#[test]
fn trit_wrapper_refuses_128_255() {
    for value in [128_i32, 255_i32] {
        let err = Trit::decode_wire(value).expect_err("unsigned byte as i32 stays refused");
        assert_eq!(err.outcome(), Trit::Refuse);
        assert_eq!(err.failure_id(), "VOK_TRIT_INVALID", "wrapper {value}");
        assert_ne!(err.failure_id(), VOK_TRIT_BARE_LEGACY_ZERO);
    }
}

#[test]
fn trit_signed_wrapper_oracle() {
    for (input, expected) in rows("signedWrapper") {
        let value: i32 = input.parse().expect("signed wrapper i32");
        assert_label(
            Trit::decode_wire(value),
            expected,
            &format!("signedWrapper {value}"),
        );
    }
}

#[test]
fn trit_u8_default_arm() {
    assert!(
        LIB_RS.contains("pub fn decode_wire_u8"),
        "reader exists so the 256-byte table can fail closed"
    );
    let mut named = 0_u32;
    for byte in 0_u8..=255 {
        if Trit::decode_wire_u8(byte).is_ok() {
            named += 1;
        }
    }
    assert_eq!(named, 3, "only the three named bytes admit");
}

#[test]
fn trit_one_byte_table() {
    assert_eq!(LIB_RS.matches("0x01").count(), 1, "K3_BYTE_ADMIT is the only 0x01");
    assert_eq!(LIB_RS.matches("0xFF").count(), 1, "K3_BYTE_DENY is the only 0xFF");
    assert_eq!(LIB_RS.matches("0x80").count(), 1, "K3_BYTE_UNKNOWN is the only 0x80");
    let start = LIB_RS
        .find("pub fn decode_wire(value: i32)")
        .expect("wrapper");
    let after = LIB_RS[start + 1..]
        .find("pub fn ")
        .map(|rel| start + 1 + rel)
        .unwrap_or(LIB_RS.len());
    let wrapper = &LIB_RS[start..after];
    assert!(
        !wrapper.contains("0x01") && !wrapper.contains("0xFF") && !wrapper.contains("0x80"),
        "wrapper has no second byte table"
    );
    assert!(
        !wrapper.contains("as i8") && !wrapper.contains("& 0xFF") && !wrapper.contains("- 256"),
        "wrapper has no byte arithmetic"
    );
    let reader_start = LIB_RS.find("pub fn decode_wire_u8").expect("reader");
    let reader_after = LIB_RS[reader_start + 1..]
        .find("pub fn ")
        .map(|rel| reader_start + 1 + rel)
        .unwrap_or(LIB_RS.len());
    let reader = &LIB_RS[reader_start..reader_after];
    assert!(reader.contains("_ =>"), "reader fail-closed default arm");
    assert!(
        !reader.contains("as i8") && !reader.contains("& 0xFF") && !reader.contains("- 256"),
        "reader decision has no byte arithmetic"
    );
}

#[test]
fn trit_load8_s_u_matches_fixture() {
    let mut bytes = Vec::new();
    let mut load8_s = Vec::new();
    let mut load8_u = Vec::new();
    for (input, expected) in rows("load8") {
        match input {
            "bytes" => bytes = comma_i32(expected),
            "load8_s" => load8_s = comma_i32(expected),
            "load8_u" => load8_u = comma_i32(expected),
            other => panic!("unknown load8 row {other}"),
        }
    }
    assert_eq!(bytes, vec![1, 255, 128, 0, 127, 129]);
    let raw: Vec<u8> = bytes.iter().map(|value| u8::try_from(*value).expect("byte")).collect();
    let signed: Vec<i32> = raw.iter().map(|byte| *byte as i8 as i32).collect();
    let unsigned: Vec<i32> = raw.iter().map(|byte| i32::from(*byte)).collect();
    assert_eq!(signed, load8_s, "load8_s is i8 as i32");
    assert_eq!(unsigned, load8_u, "load8_u is u8 as i32");
    for byte in raw.iter().copied() {
        let label = rows("u8")
            .into_iter()
            .find(|(input, _)| input.parse::<u8>().ok() == Some(byte))
            .map(|(_, expected)| expected)
            .expect("u8 row");
        assert_label(Trit::decode_wire_u8(byte), label, &format!("load8_u byte {byte}"));
    }
    for value in signed {
        if let Some((_, label)) = rows("signedWrapper")
            .into_iter()
            .find(|(input, _)| input.parse::<i32>().ok() == Some(value))
        {
            assert_label(
                Trit::decode_wire(value),
                label,
                &format!("load8_s value {value}"),
            );
        }
    }
    let err_ff = Trit::decode_wire(255).expect_err("load8_u 0xFF through wrapper");
    assert_eq!(err_ff.failure_id(), "VOK_TRIT_INVALID");
    let err_80 = Trit::decode_wire(128).expect_err("load8_u 0x80 through wrapper");
    assert_eq!(err_80.failure_id(), "VOK_TRIT_INVALID");
}

#[test]
fn trit_encode_lattice_round_trip() {
    let table = rows("encodeLattice");
    assert_eq!(table.len(), 3);
    for (input, expected) in table {
        let lattice: i32 = input.parse().expect("lattice");
        let byte: u8 = expected.parse().expect("byte");
        assert_eq!(Trit::encode_lattice_u8(lattice).expect("encode"), byte);
        assert_ne!(byte, 0, "encoder must not emit 0x00");
        let label = match lattice {
            -1 => "REFUSE",
            0 => "UNKNOWN",
            1 => "ADMIT",
            _ => panic!("encode lattice domain"),
        };
        assert_label(
            Trit::decode_wire_u8(byte),
            label,
            &format!("round-trip lattice {lattice}"),
        );
    }
    for lattice in [i32::MIN, -2, 2, 127, 128, 255, i32::MAX] {
        let err = Trit::encode_lattice_u8(lattice).expect_err("encode domain is lattice only");
        assert_eq!(err.failure_id(), "VOK_TRIT_INVALID");
    }
}

#[test]
fn decode_legacy_frame_and_to_wire_lock() {
    assert_eq!(Trit::Refuse.to_wire(), -1);
    assert_eq!(Trit::Unknown.to_wire(), -128);
    assert_eq!(Trit::Admit.to_wire(), 1);
    assert_eq!(
        Trit::decode_legacy_frame(0),
        Ok((Trit::Unknown, TritWireForm::LegacyUnknownZero))
    );
    assert_eq!(
        Trit::decode_legacy_frame(-128),
        Ok((Trit::Unknown, TritWireForm::Canonical))
    );
    assert_eq!(
        Trit::decode_legacy_frame(1),
        Ok((Trit::Admit, TritWireForm::Canonical))
    );
    assert_eq!(
        Trit::decode_legacy_frame(-1),
        Ok((Trit::Refuse, TritWireForm::Canonical))
    );
}

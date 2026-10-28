//! Internal lattice {-1, 0, 1} converters. Wire decode never calls these.

use crate::{Trit, VokFailure, VOK_TRIT_INVALID};

/// Map lattice {-1, 0, 1} to Trit. Lattice 0 is Unknown. A wire 0 never reaches this function.
pub fn from_lattice(v: i32) -> Result<Trit, VokFailure> {
    match v {
        -1 => Ok(Trit::Refuse),
        0 => Ok(Trit::Unknown),
        1 => Ok(Trit::Admit),
        _ => Err(VokFailure::new(Trit::Refuse, VOK_TRIT_INVALID)),
    }
}

/// Map Trit to lattice {-1, 0, 1}. Unknown is 0, not the wire value -128.
pub fn to_lattice(t: Trit) -> i32 {
    match t {
        Trit::Refuse => -1,
        Trit::Unknown => 0,
        Trit::Admit => 1,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::VOK_TRIT_BARE_LEGACY_ZERO;

    const LIB_RS: &str = include_str!("lib.rs");
    const LATTICE_RS: &str = include_str!("lattice.rs");
    const CARGO_TOML: &str = include_str!("../Cargo.toml");

    fn fn_body<'a>(src: &'a str, sig: &str) -> &'a str {
        let start = src.find(sig).unwrap_or_else(|| panic!("missing {sig}"));
        let open = src[start..].find('{').map(|i| start + i).expect("open brace");
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

    #[test]
    fn from_lattice_zero_is_unknown() {
        assert_eq!(from_lattice(0), Ok(Trit::Unknown));
    }

    #[test]
    fn from_lattice_two_is_invalid() {
        let err = from_lattice(2).expect_err("lattice domain is {-1,0,1}");
        assert_eq!(err.outcome(), Trit::Refuse);
        assert_eq!(err.failure_id(), "VOK_TRIT_INVALID");
    }

    #[test]
    fn to_lattice_unknown_is_zero() {
        assert_eq!(to_lattice(Trit::Unknown), 0);
    }

    #[test]
    fn from_lattice_closed_domain() {
        assert_eq!(from_lattice(-1), Ok(Trit::Refuse));
        assert_eq!(from_lattice(0), Ok(Trit::Unknown));
        assert_eq!(from_lattice(1), Ok(Trit::Admit));
        for malformed in [i32::MIN, -129, -128, -2, 2, 7, 127, 128, 255, i32::MAX] {
            let err = from_lattice(malformed).expect_err("malformed lattice");
            assert_eq!(err.outcome(), Trit::Refuse);
            assert_eq!(err.failure_id(), "VOK_TRIT_INVALID");
            assert_ne!(err.failure_id(), VOK_TRIT_BARE_LEGACY_ZERO);
        }
    }

    #[test]
    fn to_lattice_closed_domain() {
        assert_eq!(to_lattice(Trit::Refuse), -1);
        assert_eq!(to_lattice(Trit::Unknown), 0);
        assert_eq!(to_lattice(Trit::Admit), 1);
    }

    #[test]
    fn lattice_round_trip() {
        for value in [-1, 0, 1] {
            let trit = from_lattice(value).expect("lattice");
            assert_eq!(to_lattice(trit), value);
        }
    }

    #[test]
    fn to_lattice_is_match_not_as_i8() {
        let body = fn_body(LATTICE_RS, "pub fn to_lattice(t: Trit) -> i32");
        assert!(body.contains("match t"), "to_lattice is an exhaustive match");
        assert!(!body.contains("as i8"), "to_lattice must not use discriminant as i8");
    }

    #[test]
    fn lattice_not_on_wire_decode() {
        for sig in [
            "pub fn decode_wire_u8(byte: u8)",
            "pub fn decode_wire(value: i32)",
            "pub fn decode_legacy_frame(value: i32)",
            "fn decode_canonical(value: i32)",
            "pub fn encode_lattice_u8(lattice: i32)",
            "pub const fn to_wire(self) -> i32",
        ] {
            let body = fn_body(LIB_RS, sig);
            assert!(
                !body.contains("from_lattice")
                    && !body.contains("to_lattice")
                    && !body.contains("lattice::"),
                "{sig} must not call lattice converters"
            );
        }
    }

    #[test]
    fn cargo_toml_dependencies_empty() {
        let start = CARGO_TOML
            .find("[dependencies]")
            .expect("[dependencies] table");
        let rest = &CARGO_TOML[start + "[dependencies]".len()..];
        let next = rest.find("\n[").unwrap_or(rest.len());
        let body = rest[..next].trim();
        assert!(
            body.is_empty(),
            "Cargo.toml [dependencies] must stay empty, got {body:?}"
        );
    }
}

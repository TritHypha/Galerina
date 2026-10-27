//! Fixture pin: JSON digest is checked by this crate's sha256.rs (G9 preferred).
//! Byte-identical copy of SLIDE grok/slide-k3-fixture-v2-20261027 A2 fixture
//! sha256 c6b396d89dfd94cc1194f73c106d3cdaf24fffffd227893b639aa7bcbfefdbb0
//! git blob 41bc772aa91ab8658c8d36894bd57f802188942b.

const PINNED_DIGEST: &str = "c6b396d89dfd94cc1194f73c106d3cdaf24fffffd227893b639aa7bcbfefdbb0";
const V1_DIGEST: &str = "af50342a9f547b6523f632a56d45ea2c4b6eec69f35daf4c7b2f03f061d83f83";
const JSON: &[u8] = include_bytes!("../vectors/k3-wire-vectors.json");
const ROWS: &str = include_str!("../vectors/k3-wire-vectors.rows.txt");

fn hex_lower(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for &byte in bytes {
        out.push(HEX[(byte >> 4) as usize] as char);
        out.push(HEX[(byte & 0x0f) as usize] as char);
    }
    out
}

#[test]
fn k3_wire_vectors_json_digest_matches_pin_via_sha256_rs() {
    assert_ne!(PINNED_DIGEST, V1_DIGEST);
    let digest = hex_lower(&crate::sha256::sha256(JSON));
    assert_eq!(digest, PINNED_DIGEST);
}

#[test]
fn k3_wire_vectors_rows_header_matches_json_digest() {
    let header = ROWS.lines().next().expect("rows file has a header");
    assert_eq!(header, format!("sha256={PINNED_DIGEST}"));
    let digest = hex_lower(&crate::sha256::sha256(JSON));
    assert_eq!(header, format!("sha256={digest}"));
}

#[test]
fn k3_wire_vectors_json_has_no_cr_and_keeps_v1_keys() {
    assert!(!JSON.contains(&b'\r'), "fixture must stay LF");
    let text = std::str::from_utf8(JSON).expect("utf8 json");
    for key in [
        "\"comment\"",
        "\"lattice\"",
        "\"toWire\"",
        "\"canonical\"",
        "\"legacy\"",
        "\"legacyNote\"",
        "\"boundaryBareRefused\"",
        "\"invalid\"",
    ] {
        assert!(text.contains(key), "missing {key}");
    }
}

#[test]
fn flipping_one_json_byte_moves_the_digest() {
    let mut mutant = JSON.to_vec();
    let last = mutant.len() - 2;
    mutant[last] ^= 1;
    let digest = hex_lower(&crate::sha256::sha256(&mutant));
    assert_ne!(digest, PINNED_DIGEST);
}

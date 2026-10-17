use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use serde_json::{Map, Value};
use std::collections::BTreeMap;
use std::io::{self, Read};
use std::process::ExitCode;

const GRANT_DOMAIN: &str = "galerina.signet.grant.v1";
const SEAL_DOMAIN: &str = "galerina.signet.wax-seal.v1";
const MAX_STDIN: usize = 16_384;

const GRANT_KEYS: [&str; 11] = [
    "action",
    "envelopeDigest",
    "epoch",
    "expiryUnixMs",
    "grantId",
    "issuedAtUnixMs",
    "issuerKeyId",
    "kind",
    "profileDigest",
    "schemaVersion",
    "subjectId",
];
const SEAL_KEYS: [&str; 12] = [
    "action",
    "authentication",
    "authorizing",
    "envelopeDigest",
    "epoch",
    "grantId",
    "kind",
    "profileDigest",
    "replayable",
    "schemaVersion",
    "subjectId",
    "terminalOutcome",
];

fn emit(trit: i8, reason: &str, code: u8) -> ExitCode {
    let body = format!(
        "{{\"schema\":\"galerina.signet.verdict.v1\",\"trit\":{},\"reason\":{},\"authorizing\":false}}\n",
        trit,
        serde_json::to_string(reason).unwrap_or_else(|_| "\"UNKNOWN\"".to_string())
    );
    print!("{body}");
    ExitCode::from(code)
}

fn hex_decode(hex: &str, expected_len: usize) -> Option<Vec<u8>> {
    if hex.len() != expected_len * 2 || !hex.bytes().all(|b| b.is_ascii_hexdigit()) {
        return None;
    }
    if hex.bytes().any(|b| (b as char).is_ascii_uppercase()) {
        return None;
    }
    let mut out = Vec::with_capacity(expected_len);
    let bytes = hex.as_bytes();
    for i in (0..bytes.len()).step_by(2) {
        let pair = std::str::from_utf8(&bytes[i..i + 2]).ok()?;
        out.push(u8::from_str_radix(pair, 16).ok()?);
    }
    Some(out)
}

fn exact_keys(obj: &Map<String, Value>, expected: &[&str]) -> bool {
    if obj.len() != expected.len() {
        return false;
    }
    expected.iter().all(|key| obj.contains_key(*key))
}

fn canonical_object(obj: &Map<String, Value>) -> Option<String> {
    let mut ordered = BTreeMap::new();
    for (key, value) in obj {
        ordered.insert(key.clone(), value.clone());
    }
    serde_json::to_string(&ordered).ok()
}

fn framed(domain: &str, canonical: &str) -> Vec<u8> {
    format!(
        "{}:{}{}:{}",
        domain.len(),
        domain,
        canonical.len(),
        canonical
    )
    .into_bytes()
}

enum BoundReadError {
    Unavailable,
    TooLarge,
}

fn read_bounded<R: Read>(reader: R) -> Result<Vec<u8>, BoundReadError> {
    let mut limited = reader.take((MAX_STDIN as u64) + 1);
    let mut buf = Vec::new();
    match limited.read_to_end(&mut buf) {
        Ok(_) => {}
        Err(_) => return Err(BoundReadError::Unavailable),
    }
    if buf.len() > MAX_STDIN {
        return Err(BoundReadError::TooLarge);
    }
    Ok(buf)
}

fn main() -> ExitCode {
    let buf = match read_bounded(io::stdin().lock()) {
        Ok(v) => v,
        Err(BoundReadError::Unavailable) => return emit(0, "STDIN_UNAVAILABLE", 1),
        Err(BoundReadError::TooLarge) => return emit(-1, "STDIN_TOO_LARGE", 1),
    };
    let parsed: Value = match serde_json::from_slice(&buf) {
        Ok(v) => v,
        Err(_) => return emit(0, "JSON_MALFORMED", 1),
    };
    let obj = match parsed.as_object() {
        Some(o) => o,
        None => return emit(-1, "JSON_OBJECT_REQUIRED", 1),
    };
    if obj.get("schema").and_then(Value::as_str) != Some("galerina.signet.verify.v1") {
        return emit(-1, "VERIFY_SCHEMA", 1);
    }
    let public_key_hex = match obj.get("publicKeyHex").and_then(Value::as_str) {
        Some(v) => v,
        None => return emit(-1, "PUBLIC_KEY_MISSING", 1),
    };
    let pk_bytes = match hex_decode(public_key_hex, 32) {
        Some(v) => v,
        None => return emit(-1, "PUBLIC_KEY_HEX", 1),
    };
    let statement = match obj.get("statement").and_then(Value::as_object) {
        Some(v) => v,
        None => return emit(-1, "STATEMENT_MISSING", 1),
    };
    let signature_hex = match statement.get("signature").and_then(Value::as_str) {
        Some(v) => v,
        None => return emit(-1, "SIGNATURE_MISSING", 1),
    };
    let sig_bytes = match hex_decode(signature_hex, 64) {
        Some(v) => v,
        None => return emit(-1, "SIGNATURE_HEX", 1),
    };
    let mut payload = statement.clone();
    payload.remove("signature");
    let kind = match payload.get("kind").and_then(Value::as_str) {
        Some(v) => v,
        None => return emit(-1, "KIND_MISSING", 1),
    };
    let (domain, keys) = match kind {
        "GRANT" => (GRANT_DOMAIN, GRANT_KEYS.as_slice()),
        "WAX_SEAL" => (SEAL_DOMAIN, SEAL_KEYS.as_slice()),
        _ => return emit(-1, "KIND_UNKNOWN", 1),
    };
    if !exact_keys(&payload, keys) {
        return emit(-1, "CLOSED_KEYS", 1);
    }
    if kind == "WAX_SEAL" {
        match payload.get("authorizing") {
            Some(Value::Bool(false)) => {}
            _ => return emit(-1, "SEAL_AUTHORIZING", 1),
        }
        match payload.get("authentication").and_then(Value::as_str) {
            Some("AUTHENTICATED_SIGNET") => {}
            _ => return emit(-1, "SEAL_AUTHENTICATION", 1),
        }
    }
    let canonical = match canonical_object(&payload) {
        Some(v) => v,
        None => return emit(0, "CANONICAL_FAILED", 1),
    };
    let message = framed(domain, &canonical);
    let vk_array: [u8; 32] = match pk_bytes.as_slice().try_into() {
        Ok(v) => v,
        Err(_) => return emit(-1, "PUBLIC_KEY_LEN", 1),
    };
    let verifying_key = match VerifyingKey::from_bytes(&vk_array) {
        Ok(v) => v,
        Err(_) => return emit(-1, "PUBLIC_KEY_INVALID", 1),
    };
    let signature = match Signature::from_slice(&sig_bytes) {
        Ok(v) => v,
        Err(_) => return emit(-1, "SIGNATURE_LEN", 1),
    };
    // GATE1_GUARD_VERIFY
    match verifying_key.verify(&message, &signature) {
        Ok(()) => emit(1, "OK", 0),
        Err(_) => emit(-1, "TAMPER", 1),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{Signer, SigningKey};

    #[test]
    fn hex_decode_wrong_length() {
        assert!(hex_decode("ab", 32).is_none());
        assert!(hex_decode(&"ab".repeat(31), 32).is_none());
        assert!(hex_decode(&"ab".repeat(33), 32).is_none());
    }

    #[test]
    fn hex_decode_odd_and_non_hex() {
        assert!(hex_decode("abc", 2).is_none());
        assert!(hex_decode("zz", 1).is_none());
        assert!(hex_decode("AG", 1).is_none());
        assert_eq!(hex_decode("ab", 1), Some(vec![0xab]));
    }

    #[test]
    fn exact_keys_missing_and_extra() {
        let mut obj = Map::new();
        obj.insert("a".to_string(), Value::from("1"));
        assert!(!exact_keys(&obj, &["a", "b"]));
        obj.insert("b".to_string(), Value::from("2"));
        assert!(exact_keys(&obj, &["a", "b"]));
        obj.insert("c".to_string(), Value::from("3"));
        assert!(!exact_keys(&obj, &["a", "b"]));
    }

    #[test]
    fn canonical_object_orders_keys() {
        let mut obj = Map::new();
        obj.insert("b".to_string(), Value::from(1));
        obj.insert("a".to_string(), Value::from(2));
        assert_eq!(canonical_object(&obj).unwrap(), "{\"a\":2,\"b\":1}");
    }

    #[test]
    fn framed_domain_separation() {
        let left = framed("ab", "cd");
        let right = framed("a", "bcd");
        assert_ne!(left, right);
        assert_eq!(left, b"2:ab2:cd");
        assert_eq!(right, b"1:a3:bcd");
    }

    #[test]
    fn signature_valid_and_invalid_synthetic_key() {
        let signing = SigningKey::from_bytes(&[7u8; 32]);
        let verifying = signing.verifying_key();
        let message = framed(GRANT_DOMAIN, "{\"kind\":\"GRANT\"}");
        let good = signing.sign(&message);
        assert!(verifying.verify(&message, &good).is_ok());
        let mut tampered = good.to_bytes();
        tampered[0] ^= 1;
        let bad = Signature::from_slice(&tampered).expect("64-byte signature");
        assert!(verifying.verify(&message, &bad).is_err());
    }

    #[test]
    fn read_bounded_accepts_max_and_refuses_above() {
        let maxed = vec![b'x'; MAX_STDIN];
        match read_bounded(maxed.as_slice()) {
            Ok(buf) => assert_eq!(buf.len(), MAX_STDIN),
            Err(_) => panic!("MAX_STDIN must be accepted"),
        }
        let over = vec![b'y'; MAX_STDIN + 1];
        match read_bounded(over.as_slice()) {
            Err(BoundReadError::TooLarge) => {}
            Ok(_) => panic!("MAX_STDIN+1 must be TooLarge"),
            Err(BoundReadError::Unavailable) => panic!("cursor read must not be Unavailable"),
        }
        match read_bounded(&b"{}"[..]) {
            Ok(buf) => assert_eq!(buf, b"{}"),
            Err(_) => panic!("small stdin must be accepted"),
        }
    }

    #[test]
    fn read_bounded_does_not_pull_more_than_max_plus_one() {
        struct CountRead<'a> {
            inner: &'a [u8],
            pulled: usize,
        }
        impl Read for CountRead<'_> {
            fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
                let n = self.inner.read(buf)?;
                self.pulled += n;
                Ok(n)
            }
        }
        let data = vec![0u8; MAX_STDIN * 2];
        let mut counter = CountRead {
            inner: data.as_slice(),
            pulled: 0,
        };
        match read_bounded(&mut counter) {
            Err(BoundReadError::TooLarge) => {}
            Ok(_) => panic!("expected TooLarge for 2*MAX_STDIN"),
            Err(BoundReadError::Unavailable) => panic!("cursor read must not be Unavailable"),
        }
        assert_eq!(counter.pulled, MAX_STDIN + 1);
    }
}

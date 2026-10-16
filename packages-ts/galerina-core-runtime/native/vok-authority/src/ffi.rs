//! Production C ABI that binds a digest from
//! `wamr_secrets_gateway_load_for_authority` into VOK admit/lease/receipt.
//!
//! The 32-byte buffer is still forgeable without a shared-secret MAC. That
//! remaining forgeability is an owner decision (HMAC), not a public
//! caller-asserted setter on `MintRequest`.

use std::ptr;

use crate::native;
use crate::{
    AuthorityContext, AuthorityTable, AuthorityTag, MintRequest, OsNonceSource, Trit, VokFailure,
    WamrLoadedDigest, MAX_OBJECT_BYTES_LIMIT, RETURN_U64_OBJECT_BYTES,
};

pub const VOK_ABI_OK: i32 = 0;
pub const VOK_ABI_INVALID_ARGUMENT: i32 = 1;
pub const VOK_ABI_ARTIFACT_DIGEST_MISSING: i32 = 2;
pub const VOK_ABI_ARTIFACT_MISMATCH: i32 = 3;
pub const VOK_ABI_REFUSED: i32 = 4;

fn map_failure(failure: &VokFailure) -> i32 {
    match failure.failure_id() {
        "VOK_ARTIFACT_DIGEST_MISSING" => VOK_ABI_ARTIFACT_DIGEST_MISSING,
        "VOK_ARTIFACT_MISMATCH" => VOK_ABI_ARTIFACT_MISMATCH,
        _ => VOK_ABI_REFUSED,
    }
}

fn abi_context() -> AuthorityContext {
    AuthorityContext::new([0x11; 32], [0x22; 32], [0x33; 32], 1, 1)
}

fn canonical_tag() -> Result<AuthorityTag, VokFailure> {
    AuthorityTag::parse("slide.vok.execute.v1")
}

unsafe fn read_digest32(src: *const u8) -> Option<[u8; 32]> {
    if src.is_null() {
        return None;
    }
    let mut digest = [0_u8; 32];
    // Safety: caller contract requires 32 readable bytes or NULL.
    ptr::copy_nonoverlapping(src, digest.as_mut_ptr(), 32);
    Some(digest)
}

unsafe fn write_digest32(dest: *mut u8, digest: &[u8; 32]) {
    // Safety: caller contract requires 32 writable bytes.
    ptr::copy_nonoverlapping(digest.as_ptr(), dest, 32);
}

fn zero32(digest: &mut [u8; 32]) {
    digest.fill(0);
}

/// Copies a digest produced by `wamr_secrets_gateway_load_for_authority`.
/// All-zero input is `VOK_ABI_ARTIFACT_DIGEST_MISSING`. NULL is invalid.
#[no_mangle]
pub unsafe extern "C" fn vok_authority_wamr_loaded_digest_from_authority(
    digest: *const u8,
    out: *mut u8,
) -> i32 {
    if digest.is_null() || out.is_null() {
        return VOK_ABI_INVALID_ARGUMENT;
    }
    let mut bytes = match unsafe { read_digest32(digest) } {
        Some(bytes) => bytes,
        None => return VOK_ABI_INVALID_ARGUMENT,
    };
    let result = match WamrLoadedDigest::from_authority_output(bytes) {
        Ok(loaded) => {
            unsafe { write_digest32(out, loaded.as_bytes()) };
            VOK_ABI_OK
        }
        Err(failure) => map_failure(&failure),
    };
    zero32(&mut bytes);
    result
}

/// Encodes the closed native return-u64 object for the current host target.
#[no_mangle]
pub unsafe extern "C" fn vok_authority_encode_return_u64(
    value: u64,
    out: *mut u8,
    out_len: usize,
) -> i32 {
    if out.is_null() || out_len < RETURN_U64_OBJECT_BYTES {
        return VOK_ABI_INVALID_ARGUMENT;
    }
    let Some(target) = native::current_target() else {
        return VOK_ABI_REFUSED;
    };
    let bytes = native::encode_return_u64_object(value, target);
    // Safety: out_len was checked against RETURN_U64_OBJECT_BYTES.
    unsafe {
        ptr::copy_nonoverlapping(bytes.as_ptr(), out, RETURN_U64_OBJECT_BYTES);
    }
    VOK_ABI_OK
}

/// One production caller: mint a native object bound to a WAMR-loaded digest,
/// then open and consume the lease with `expected_digest`.
///
/// Match path: `mint_digest` and `expected_digest` are the 32 bytes copied
/// from a VALID `load_for_authority`. Missing (all-zero mint digest) and
/// mismatch (expected ≠ stored) refuse.
#[no_mangle]
pub unsafe extern "C" fn vok_authority_handoff_admit_lease_receipt(
    object_bytes: *const u8,
    object_len: usize,
    mint_digest: *const u8,
    expected_digest: *const u8,
    receipt_digest: *mut u8,
) -> i32 {
    if mint_digest.is_null() || expected_digest.is_null() || receipt_digest.is_null() {
        return VOK_ABI_INVALID_ARGUMENT;
    }
    if object_len > 0 && object_bytes.is_null() {
        return VOK_ABI_INVALID_ARGUMENT;
    }
    if object_len > MAX_OBJECT_BYTES_LIMIT {
        return VOK_ABI_REFUSED;
    }

    let mut mint_bytes = match unsafe { read_digest32(mint_digest) } {
        Some(bytes) => bytes,
        None => return VOK_ABI_INVALID_ARGUMENT,
    };
    let mut expected = match unsafe { read_digest32(expected_digest) } {
        Some(bytes) => bytes,
        None => {
            zero32(&mut mint_bytes);
            return VOK_ABI_INVALID_ARGUMENT;
        }
    };

    let loaded = match WamrLoadedDigest::from_authority_output(mint_bytes) {
        Ok(loaded) => loaded,
        Err(failure) => {
            zero32(&mut mint_bytes);
            zero32(&mut expected);
            return map_failure(&failure);
        }
    };

    let mut object = vec![0_u8; object_len];
    if object_len > 0 {
        // Safety: object_bytes is non-NULL and object_len is bounded.
        unsafe {
            ptr::copy_nonoverlapping(object_bytes, object.as_mut_ptr(), object_len);
        }
    }

    let result = handoff_admit_lease_receipt(object, loaded, &expected, receipt_digest);
    zero32(&mut mint_bytes);
    zero32(&mut expected);
    result
}

fn handoff_admit_lease_receipt(
    object: Vec<u8>,
    loaded: WamrLoadedDigest,
    expected: &[u8; 32],
    receipt_digest: *mut u8,
) -> i32 {
    let context = abi_context();
    let tag = match canonical_tag() {
        Ok(tag) => tag,
        Err(failure) => return map_failure(&failure),
    };
    let request = match MintRequest::new(tag, context.clone(), [Trit::Admit; 8], object)
        .with_wamr_loaded_digest(loaded)
    {
        Ok(request) => request,
        Err(failure) => return map_failure(&failure),
    };
    let ceiling = RETURN_U64_OBJECT_BYTES.max(1);
    let mut table = match AuthorityTable::new(1, ceiling, context.clone(), OsNonceSource) {
        Ok(table) => table,
        Err(failure) => return map_failure(&failure),
    };
    let admitted = match table.mint_admitted(request) {
        Ok(handle) => handle,
        Err(failure) => return map_failure(&failure),
    };
    let lease = match table.open_lease_for_artifact(admitted, &context, expected) {
        Ok(lease) => lease,
        Err(failure) => return map_failure(&failure),
    };
    match table.consume_lease_for_artifact(lease, &context, Trit::Admit, expected) {
        Ok(receipt) => {
            if receipt_digest.is_null() {
                return VOK_ABI_INVALID_ARGUMENT;
            }
            unsafe { write_digest32(receipt_digest, receipt.artifact_digest()) };
            VOK_ABI_OK
        }
        Err(failure) => map_failure(&failure),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn digest_d1() -> [u8; 32] {
        [0xA1; 32]
    }

    fn digest_d2() -> [u8; 32] {
        [0xB2; 32]
    }

    fn native_object() -> [u8; RETURN_U64_OBJECT_BYTES] {
        let mut out = [0_u8; RETURN_U64_OBJECT_BYTES];
        let rc = unsafe {
            vok_authority_encode_return_u64(7, out.as_mut_ptr(), out.len())
        };
        assert_eq!(rc, VOK_ABI_OK);
        out
    }

    #[test]
    fn from_authority_refuses_null_and_zero() {
        let mut out = [0_u8; 32];
        let rc = unsafe {
            vok_authority_wamr_loaded_digest_from_authority(ptr::null(), out.as_mut_ptr())
        };
        assert_eq!(rc, VOK_ABI_INVALID_ARGUMENT);

        let zero = [0_u8; 32];
        let rc = unsafe {
            vok_authority_wamr_loaded_digest_from_authority(zero.as_ptr(), out.as_mut_ptr())
        };
        assert_eq!(rc, VOK_ABI_ARTIFACT_DIGEST_MISSING);
        assert_eq!(out, [0_u8; 32]);
    }

    #[test]
    fn from_authority_copies_nonzero_digest() {
        let src = digest_d1();
        let mut out = [0_u8; 32];
        let rc = unsafe {
            vok_authority_wamr_loaded_digest_from_authority(src.as_ptr(), out.as_mut_ptr())
        };
        assert_eq!(rc, VOK_ABI_OK);
        assert_eq!(out, src);
    }

    #[test]
    fn handoff_match_mismatch_and_missing() {
        let object = native_object();
        let mint = digest_d1();
        let mut receipt = [0_u8; 32];

        let rc = unsafe {
            vok_authority_handoff_admit_lease_receipt(
                object.as_ptr(),
                object.len(),
                mint.as_ptr(),
                mint.as_ptr(),
                receipt.as_mut_ptr(),
            )
        };
        assert_eq!(rc, VOK_ABI_OK);
        assert_eq!(receipt, mint);

        let other = digest_d2();
        receipt.fill(0);
        let rc = unsafe {
            vok_authority_handoff_admit_lease_receipt(
                object.as_ptr(),
                object.len(),
                mint.as_ptr(),
                other.as_ptr(),
                receipt.as_mut_ptr(),
            )
        };
        assert_eq!(rc, VOK_ABI_ARTIFACT_MISMATCH);

        let zero = [0_u8; 32];
        let rc = unsafe {
            vok_authority_handoff_admit_lease_receipt(
                object.as_ptr(),
                object.len(),
                zero.as_ptr(),
                mint.as_ptr(),
                receipt.as_mut_ptr(),
            )
        };
        assert_eq!(rc, VOK_ABI_ARTIFACT_DIGEST_MISSING);
    }

    #[test]
    fn handoff_refuses_wasm_object_bytes() {
        let wasm_like = [0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00];
        let mint = digest_d1();
        let mut receipt = [0_u8; 32];
        let rc = unsafe {
            vok_authority_handoff_admit_lease_receipt(
                wasm_like.as_ptr(),
                wasm_like.len(),
                mint.as_ptr(),
                mint.as_ptr(),
                receipt.as_mut_ptr(),
            )
        };
        assert_eq!(rc, VOK_ABI_REFUSED);
    }
}

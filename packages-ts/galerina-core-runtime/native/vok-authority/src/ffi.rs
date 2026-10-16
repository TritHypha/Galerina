//! Production C ABI: opaque process-local WAMR→VOK handle.
//!
//! No public C function accepts or returns a raw 32-byte artifact digest.
//! `vok_authority_issue_sealed_handle` is a hidden symbol for WAMR-side
//! glue after a successful `load_for_authority`. It is not declared in
//! `vok_authority_handoff.h`.

use std::ptr;
use std::sync::Mutex;

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

const MAX_SEALED_HANDLES: usize = 64;

#[repr(C)]
#[derive(Clone, Copy)]
pub struct VokWamrLoadedHandle {
    slot: u32,
    reserved: u32,
    generation: u64,
    nonce: [u8; 16],
}

struct SealedEntry {
    digest: [u8; 32],
    generation: u64,
    nonce: [u8; 16],
    live: bool,
}

struct SealedTable {
    slots: Vec<SealedEntry>,
}

impl SealedTable {
    fn new() -> Self {
        let slots = (0..MAX_SEALED_HANDLES)
            .map(|_| SealedEntry {
                digest: [0; 32],
                generation: 0,
                nonce: [0; 16],
                live: false,
            })
            .collect();
        Self { slots }
    }
}

static SEALED: Mutex<SealedTable> = Mutex::new(SealedTable {
    slots: Vec::new(),
});

fn sealed_table() -> std::sync::MutexGuard<'static, SealedTable> {
    let mut table = SEALED.lock().unwrap_or_else(|poison| poison.into_inner());
    if table.slots.is_empty() {
        *table = SealedTable::new();
    }
    table
}

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

fn digest_is_zero(digest: &[u8; 32]) -> bool {
    digest.iter().all(|byte| *byte == 0)
}

fn handle_is_zero(handle: &VokWamrLoadedHandle) -> bool {
    handle.slot == 0
        && handle.reserved == 0
        && handle.generation == 0
        && handle.nonce.iter().all(|byte| *byte == 0)
}

fn zero_handle(handle: &mut VokWamrLoadedHandle) {
    handle.slot = 0;
    handle.reserved = 0;
    handle.generation = 0;
    handle.nonce.fill(0);
}

fn consume_slot(table: &mut SealedTable, slot: usize) {
    let entry = &mut table.slots[slot];
    entry.digest.fill(0);
    entry.nonce.fill(0);
    entry.live = false;
}

fn lookup_live<'a>(
    table: &'a SealedTable,
    handle: &VokWamrLoadedHandle,
) -> Result<&'a SealedEntry, i32> {
    if handle_is_zero(handle) {
        return Err(VOK_ABI_ARTIFACT_DIGEST_MISSING);
    }
    let slot = handle.slot as usize;
    if slot >= table.slots.len() {
        return Err(VOK_ABI_REFUSED);
    }
    let entry = &table.slots[slot];
    if !entry.live
        || entry.generation != handle.generation
        || entry.nonce != handle.nonce
    {
        return Err(VOK_ABI_REFUSED);
    }
    Ok(entry)
}

/// WAMR-side glue only. Not declared in the public handoff header.
#[no_mangle]
pub unsafe extern "C" fn vok_authority_issue_sealed_handle(
    digest: *const u8,
    out: *mut VokWamrLoadedHandle,
) -> i32 {
    if digest.is_null() || out.is_null() {
        return VOK_ABI_INVALID_ARGUMENT;
    }
    let mut bytes = [0_u8; 32];
    // Safety: glue passes 32 readable bytes from a VALID loaded snapshot.
    unsafe {
        ptr::copy_nonoverlapping(digest, bytes.as_mut_ptr(), 32);
    }
    if digest_is_zero(&bytes) {
        bytes.fill(0);
        return VOK_ABI_ARTIFACT_DIGEST_MISSING;
    }
    let nonce = match native::os_random_16() {
        Ok(nonce) if nonce != [0; 16] => nonce,
        _ => {
            bytes.fill(0);
            return VOK_ABI_REFUSED;
        }
    };
    let mut table = sealed_table();
    let Some(slot) = table.slots.iter().position(|entry| !entry.live) else {
        bytes.fill(0);
        return VOK_ABI_REFUSED;
    };
    let generation = table.slots[slot].generation.saturating_add(1).max(1);
    table.slots[slot] = SealedEntry {
        digest: bytes,
        generation,
        nonce,
        live: true,
    };
    unsafe {
        *out = VokWamrLoadedHandle {
            slot: slot as u32,
            reserved: 0,
            generation,
            nonce,
        };
    }
    bytes.fill(0);
    VOK_ABI_OK
}

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
    let encoded = native::encode_return_u64_object(value, target);
    unsafe {
        ptr::copy_nonoverlapping(encoded.as_ptr(), out, RETURN_U64_OBJECT_BYTES);
    }
    VOK_ABI_OK
}

#[no_mangle]
pub unsafe extern "C" fn vok_authority_drop_handle(
    handle: *mut VokWamrLoadedHandle,
) -> i32 {
    if handle.is_null() {
        return VOK_ABI_INVALID_ARGUMENT;
    }
    let snapshot = unsafe { *handle };
    if !handle_is_zero(&snapshot) {
        let mut table = sealed_table();
        if lookup_live(&table, &snapshot).is_ok() {
            consume_slot(&mut table, snapshot.slot as usize);
        }
    }
    unsafe {
        zero_handle(&mut *handle);
    }
    VOK_ABI_OK
}

#[no_mangle]
pub unsafe extern "C" fn vok_authority_handoff_admit_lease_receipt(
    object_bytes: *const u8,
    object_len: usize,
    mint_handle: *const VokWamrLoadedHandle,
    expected_handle: *const VokWamrLoadedHandle,
) -> i32 {
    if mint_handle.is_null() || expected_handle.is_null() {
        return VOK_ABI_INVALID_ARGUMENT;
    }
    if object_len > 0 && object_bytes.is_null() {
        return VOK_ABI_INVALID_ARGUMENT;
    }
    if object_len > MAX_OBJECT_BYTES_LIMIT {
        return VOK_ABI_REFUSED;
    }

    let mint = unsafe { *mint_handle };
    let expected = unsafe { *expected_handle };

    let (mint_digest, expected_digest) = {
        let mut table = sealed_table();
        let mint_entry = match lookup_live(&table, &mint) {
            Ok(entry) => entry,
            Err(code) => return code,
        };
        let mint_digest = mint_entry.digest;
        let expected_entry = match lookup_live(&table, &expected) {
            Ok(entry) => entry,
            Err(code) => return code,
        };
        let expected_digest = expected_entry.digest;
        let mint_slot = mint.slot as usize;
        let expected_slot = expected.slot as usize;
        consume_slot(&mut table, mint_slot);
        if expected_slot != mint_slot {
            consume_slot(&mut table, expected_slot);
        }
        (mint_digest, expected_digest)
    };

    if digest_is_zero(&mint_digest) {
        return VOK_ABI_ARTIFACT_DIGEST_MISSING;
    }
    if mint_digest != expected_digest {
        return VOK_ABI_ARTIFACT_MISMATCH;
    }

    let loaded = match WamrLoadedDigest::from_authority_output(mint_digest) {
        Ok(loaded) => loaded,
        Err(failure) => return map_failure(&failure),
    };

    let mut object = vec![0_u8; object_len];
    if object_len > 0 {
        unsafe {
            ptr::copy_nonoverlapping(object_bytes, object.as_mut_ptr(), object_len);
        }
    }
    handoff_admit_lease_receipt(object, loaded, mint_digest)
}

fn handoff_admit_lease_receipt(
    object: Vec<u8>,
    loaded: WamrLoadedDigest,
    digest: [u8; 32],
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
    let lease = match table.open_lease_for_artifact(admitted, &context, &digest) {
        Ok(lease) => lease,
        Err(failure) => return map_failure(&failure),
    };
    match table.consume_lease_for_artifact(lease, &context, Trit::Admit, &digest) {
        Ok(_) => VOK_ABI_OK,
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
        let rc = unsafe { vok_authority_encode_return_u64(7, out.as_mut_ptr(), out.len()) };
        assert_eq!(rc, VOK_ABI_OK);
        out
    }

    unsafe fn issue(digest: [u8; 32]) -> VokWamrLoadedHandle {
        let mut handle = VokWamrLoadedHandle {
            slot: 0,
            reserved: 0,
            generation: 0,
            nonce: [0; 16],
        };
        let rc = vok_authority_issue_sealed_handle(digest.as_ptr(), &mut handle);
        assert_eq!(rc, VOK_ABI_OK);
        handle
    }

    #[test]
    fn forged_and_zero_handles_refuse_without_wamr() {
        let object = native_object();
        let zero = VokWamrLoadedHandle {
            slot: 0,
            reserved: 0,
            generation: 0,
            nonce: [0; 16],
        };
        let rc = unsafe {
            vok_authority_handoff_admit_lease_receipt(
                object.as_ptr(),
                object.len(),
                &zero,
                &zero,
            )
        };
        assert_eq!(rc, VOK_ABI_ARTIFACT_DIGEST_MISSING);

        let forged = VokWamrLoadedHandle {
            slot: 0,
            reserved: 0,
            generation: 1,
            nonce: [0x11; 16],
        };
        let rc = unsafe {
            vok_authority_handoff_admit_lease_receipt(
                object.as_ptr(),
                object.len(),
                &forged,
                &forged,
            )
        };
        assert_eq!(rc, VOK_ABI_REFUSED);
    }

    #[test]
    fn sealed_handle_match_mismatch_and_drop() {
        let object = native_object();
        let mint = unsafe { issue(digest_d1()) };
        let rc = unsafe {
            vok_authority_handoff_admit_lease_receipt(
                object.as_ptr(),
                object.len(),
                &mint,
                &mint,
            )
        };
        assert_eq!(rc, VOK_ABI_OK);

        let mint = unsafe { issue(digest_d1()) };
        let other = unsafe { issue(digest_d2()) };
        let rc = unsafe {
            vok_authority_handoff_admit_lease_receipt(
                object.as_ptr(),
                object.len(),
                &mint,
                &other,
            )
        };
        assert_eq!(rc, VOK_ABI_ARTIFACT_MISMATCH);

        let mut live = unsafe { issue(digest_d1()) };
        let rc = unsafe { vok_authority_drop_handle(&mut live) };
        assert_eq!(rc, VOK_ABI_OK);
        let rc = unsafe {
            vok_authority_handoff_admit_lease_receipt(
                object.as_ptr(),
                object.len(),
                &live,
                &live,
            )
        };
        assert_eq!(rc, VOK_ABI_ARTIFACT_DIGEST_MISSING);
    }

    #[test]
    fn issue_refuses_zero_digest() {
        let zero = [0_u8; 32];
        let mut handle = VokWamrLoadedHandle {
            slot: 0,
            reserved: 0,
            generation: 0,
            nonce: [0; 16],
        };
        let rc = unsafe { vok_authority_issue_sealed_handle(zero.as_ptr(), &mut handle) };
        assert_eq!(rc, VOK_ABI_ARTIFACT_DIGEST_MISSING);
        assert!(handle_is_zero(&handle));
    }

    #[test]
    fn handoff_refuses_wasm_object_bytes() {
        let wasm_like = [0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00];
        let mint = unsafe { issue(digest_d1()) };
        let rc = unsafe {
            vok_authority_handoff_admit_lease_receipt(
                wasm_like.as_ptr(),
                wasm_like.len(),
                &mint,
                &mint,
            )
        };
        assert_eq!(rc, VOK_ABI_REFUSED);
    }
}

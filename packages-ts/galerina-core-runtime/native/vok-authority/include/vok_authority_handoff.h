#ifndef GALERINA_VOK_AUTHORITY_HANDOFF_H
#define GALERINA_VOK_AUTHORITY_HANDOFF_H

#include <stddef.h>
#include <stdint.h>

/*
 * Production C ABI for the WAMR -> VOK admit/lease/receipt handoff.
 *
 * Callers exchange a process-local opaque handle, never a raw 32-byte
 * artifact digest. The handle is mintable only from a successful same-process
 * wamr_secrets_gateway_load_for_authority (WAMR-side glue). It is consumed
 * on handoff or drop. Caller-chosen bytes cannot construct a live handle.
 */

enum {
    VOK_ABI_OK = 0,
    VOK_ABI_INVALID_ARGUMENT = 1,
    VOK_ABI_ARTIFACT_DIGEST_MISSING = 2,
    VOK_ABI_ARTIFACT_MISMATCH = 3,
    VOK_ABI_REFUSED = 4
};

typedef struct vok_wamr_loaded_handle {
    uint32_t slot;
    uint32_t reserved;
    uint64_t generation;
    uint8_t nonce[16];
} vok_wamr_loaded_handle_t;

int vok_authority_encode_return_u64(
    uint64_t value,
    uint8_t *out,
    size_t out_len);

int vok_authority_handoff_admit_lease_receipt(
    const uint8_t *object_bytes,
    size_t object_len,
    const vok_wamr_loaded_handle_t *mint_handle,
    const vok_wamr_loaded_handle_t *expected_handle);

int vok_authority_drop_handle(vok_wamr_loaded_handle_t *handle);

#endif

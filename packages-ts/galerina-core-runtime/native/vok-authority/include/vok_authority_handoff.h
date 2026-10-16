#ifndef GALERINA_VOK_AUTHORITY_HANDOFF_H
#define GALERINA_VOK_AUTHORITY_HANDOFF_H

#include <stddef.h>
#include <stdint.h>

/*
 * Production C ABI for the WAMR-load_for_authority → VOK admit/lease/receipt
 * handoff. vok_authority_wamr_loaded_digest_from_authority is the typed
 * wrapper: it refuses an all-zero digest and is the only C entry that turns
 * load_for_authority's 32-byte output into a VOK mint digest.
 *
 * The raw 32-byte C buffer is still forgeable without a shared-secret MAC.
 * HMAC binding is an owner decision; this header does not add a public
 * caller-asserted setter on admission.
 */

enum {
    VOK_ABI_OK = 0,
    VOK_ABI_INVALID_ARGUMENT = 1,
    VOK_ABI_ARTIFACT_DIGEST_MISSING = 2,
    VOK_ABI_ARTIFACT_MISMATCH = 3,
    VOK_ABI_REFUSED = 4
};

int vok_authority_wamr_loaded_digest_from_authority(
    const uint8_t digest[32],
    uint8_t out[32]);

int vok_authority_encode_return_u64(
    uint64_t value,
    uint8_t *out,
    size_t out_len);

int vok_authority_handoff_admit_lease_receipt(
    const uint8_t *object_bytes,
    size_t object_len,
    const uint8_t mint_digest[32],
    const uint8_t expected_digest[32],
    uint8_t receipt_digest[32]);

#endif

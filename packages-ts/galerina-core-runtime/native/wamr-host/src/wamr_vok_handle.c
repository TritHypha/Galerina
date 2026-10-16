#include "wamr_vok_handle.h"

#include <string.h>

int vok_authority_issue_sealed_handle(
    const uint8_t digest[32],
    vok_wamr_loaded_handle_t *out);

int wamr_secrets_gateway_issue_vok_handle(
    const wamr_secrets_gateway_loaded_t *loaded,
    vok_wamr_loaded_handle_t *out)
{
    static const uint8_t k_zero[32];

    if (loaded == NULL || out == NULL) {
        return VOK_ABI_INVALID_ARGUMENT;
    }
    if (memcmp(loaded->artifact_digest, k_zero, 32) == 0) {
        return VOK_ABI_ARTIFACT_DIGEST_MISSING;
    }
    return vok_authority_issue_sealed_handle(loaded->artifact_digest, out);
}

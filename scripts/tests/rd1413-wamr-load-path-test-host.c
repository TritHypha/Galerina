#include "wamr_secrets_gateway_host.c"

wamr_secrets_gateway_result_t rd1413_test_load_owned_snapshot(
    uint8_t *snapshot,
    uint32_t size,
    const uint8_t *expected_digest,
    wamr_secrets_gateway_loaded_t *out,
    char *diagnostic,
    size_t diagnostic_capacity)
{
    if (out != NULL) {
        clear_out_fields(out);
        out->owned_snapshot = snapshot;
    }
    return load_owned_snapshot(snapshot, size, expected_digest, out, diagnostic,
                               diagnostic_capacity);
}

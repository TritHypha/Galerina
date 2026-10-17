#ifndef RD1413_WAMR_LOAD_PATH_TEST_HOST_H
#define RD1413_WAMR_LOAD_PATH_TEST_HOST_H

#include "wamr_secrets_gateway_host.h"

/*
 * Probe-only wrapper around static load_owned_snapshot. Compiled into
 * the load-path probe via rd1413-wamr-load-path-test-host.c, which
 * includes the production translation unit. Production header/TU do
 * not declare this symbol.
 */
wamr_secrets_gateway_result_t rd1413_test_load_owned_snapshot(
    uint8_t *snapshot,
    uint32_t size,
    const uint8_t *expected_digest,
    wamr_secrets_gateway_loaded_t *out,
    char *diagnostic,
    size_t diagnostic_capacity);

#endif

#define _POSIX_C_SOURCE 200809L

#include <errno.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "wasm_export.h"
#include "wamr_secrets_gateway_host.h"
#include "wamr_sha256.h"
#include "wamr_vok_handle.h"
#include "vok_authority_handoff.h"

#define RD1413_PROBE_MAX_WASM_BYTES (1024u * 1024u)

static uint8_t *read_bytes(const char *path, uint32_t *size)
{
    FILE *file = fopen(path, "rb");
    long length;
    uint8_t *bytes;

    if (file == NULL || fseek(file, 0, SEEK_END) != 0 ||
        (length = ftell(file)) <= 0) {
        if (file != NULL) {
            fclose(file);
        }
        return NULL;
    }
    if ((unsigned long)length > RD1413_PROBE_MAX_WASM_BYTES) {
        fclose(file);
        errno = EFBIG;
        return NULL;
    }
    if (fseek(file, 0, SEEK_SET) != 0) {
        fclose(file);
        return NULL;
    }
    bytes = malloc((size_t)length);
    if (bytes == NULL) {
        fclose(file);
        return NULL;
    }
    if (fread(bytes, 1, (size_t)length, file) != (size_t)length) {
        free(bytes);
        fclose(file);
        return NULL;
    }
    fclose(file);
    *size = (uint32_t)length;
    return bytes;
}

static int handle_is_zero(const vok_wamr_loaded_handle_t *handle)
{
    static const uint8_t k_zero[16];

    return handle->slot == 0 && handle->reserved == 0 &&
           handle->generation == 0 &&
           memcmp(handle->nonce, k_zero, sizeof(k_zero)) == 0;
}

static int load_and_issue(uint8_t *wasm, uint32_t size,
                          wamr_secrets_gateway_loaded_t *loaded,
                          vok_wamr_loaded_handle_t *handle)
{
    uint8_t expected[32];
    char diagnostic[256];
    wamr_secrets_gateway_result_t load_rc;
    int rc;

    wamr_sha256(wasm, (size_t)size, expected);
    memset(loaded, 0, sizeof(*loaded));
    memset(handle, 0, sizeof(*handle));
    diagnostic[0] = '\0';
    load_rc = wamr_secrets_gateway_load_for_authority(
        wasm, size, expected, loaded, NULL, diagnostic, sizeof(diagnostic));
    if (load_rc != WAMR_SECRETS_GATEWAY_VALID) {
        fprintf(stderr, "load_for_authority failed: %s diag=%s\n",
                wamr_secrets_gateway_result_name(load_rc), diagnostic);
        return 0;
    }
    rc = wamr_secrets_gateway_issue_vok_handle(loaded, handle);
    if (rc != VOK_ABI_OK || handle_is_zero(handle)) {
        fprintf(stderr, "issue_vok_handle failed rc=%d\n", rc);
        return 0;
    }
    return 1;
}

int main(int argc, char **argv)
{
    uint32_t subset_size = 0;
    uint32_t full_size = 0;
    uint8_t *subset;
    uint8_t *full;
    uint8_t object[16];
    char diagnostic[256];
    wamr_secrets_gateway_loaded_t loaded;
    wamr_secrets_gateway_loaded_t other_loaded;
    vok_wamr_loaded_handle_t handle;
    vok_wamr_loaded_handle_t other;
    vok_wamr_loaded_handle_t missing;
    int rc;

    (void)diagnostic;
    if (argc != 3) {
        fprintf(stderr, "usage: wamr-vok-handoff-probe subset.wasm full.wasm\n");
        return 2;
    }
    if (!wasm_runtime_init()) {
        fprintf(stderr, "runtime initialization failed\n");
        return 2;
    }
    if (!wamr_secrets_gateway_register_natives()) {
        fprintf(stderr, "native registration failed\n");
        wasm_runtime_destroy();
        return 2;
    }

    subset = read_bytes(argv[1], &subset_size);
    full = read_bytes(argv[2], &full_size);
    if (subset == NULL || full == NULL) {
        fprintf(stderr, "could not read fixtures\n");
        free(subset);
        free(full);
        wasm_runtime_destroy();
        return 2;
    }

    rc = vok_authority_encode_return_u64(7, object, sizeof(object));
    if (rc != VOK_ABI_OK) {
        fprintf(stderr, "encode_return_u64 failed rc=%d\n", rc);
        free(subset);
        free(full);
        wasm_runtime_destroy();
        return 1;
    }

    if (!load_and_issue(subset, subset_size, &loaded, &handle)) {
        wamr_secrets_gateway_release(&loaded);
        free(subset);
        free(full);
        wasm_runtime_destroy();
        return 1;
    }
    rc = vok_authority_handoff_admit_lease_receipt(
        object, sizeof(object), &handle, &handle);
    wamr_secrets_gateway_release(&loaded);
    if (rc != VOK_ABI_OK) {
        fprintf(stderr, "match handoff failed rc=%d\n", rc);
        free(subset);
        free(full);
        wasm_runtime_destroy();
        return 1;
    }
    puts("PASS: WAMR load_for_authority opaque handle admits VOK native object");

    if (!load_and_issue(subset, subset_size, &loaded, &handle) ||
        !load_and_issue(full, full_size, &other_loaded, &other)) {
        wamr_secrets_gateway_release(&loaded);
        wamr_secrets_gateway_release(&other_loaded);
        free(subset);
        free(full);
        wasm_runtime_destroy();
        return 1;
    }
    rc = vok_authority_handoff_admit_lease_receipt(
        object, sizeof(object), &handle, &other);
    wamr_secrets_gateway_release(&loaded);
    wamr_secrets_gateway_release(&other_loaded);
    if (rc != VOK_ABI_ARTIFACT_MISMATCH) {
        fprintf(stderr, "mismatch handoff expected MISMATCH, got rc=%d\n", rc);
        free(subset);
        free(full);
        wasm_runtime_destroy();
        return 1;
    }
    puts("PASS: swapped opaque handles refuse VOK_ABI_ARTIFACT_MISMATCH");

    memset(&missing, 0, sizeof(missing));
    rc = vok_authority_handoff_admit_lease_receipt(
        object, sizeof(object), &missing, &missing);
    if (rc != VOK_ABI_ARTIFACT_DIGEST_MISSING) {
        fprintf(stderr, "missing handoff expected MISSING, got rc=%d\n", rc);
        free(subset);
        free(full);
        wasm_runtime_destroy();
        return 1;
    }
    puts("PASS: zeroed handle refuses VOK_ABI_ARTIFACT_DIGEST_MISSING");

    free(subset);
    free(full);
    wasm_runtime_destroy();
    puts("PASS: composed WAMR loader into VOK admit/lease/receipt via opaque handle");
    return 0;
}

#define _POSIX_C_SOURCE 200809L

#include <errno.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "wasm_export.h"
#include "wamr_secrets_gateway_host.h"
#include "wamr_sha256.h"
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

static int digest_zero(const uint8_t digest[32])
{
    static const uint8_t k_zero[32];
    return memcmp(digest, k_zero, 32) == 0;
}

int main(int argc, char **argv)
{
    uint32_t size = 0;
    uint8_t *wasm;
    uint8_t expected[32];
    uint8_t vok_digest[32];
    uint8_t typed[32];
    uint8_t object[16];
    uint8_t receipt[32];
    uint8_t mismatch[32];
    uint8_t missing[32];
    char diagnostic[256];
    wamr_secrets_gateway_loaded_t loaded;
    wamr_secrets_gateway_result_t load_rc;
    int rc;

    if (argc != 2) {
        fprintf(stderr, "usage: wamr-vok-handoff-probe subset.wasm\n");
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

    wasm = read_bytes(argv[1], &size);
    if (wasm == NULL) {
        fprintf(stderr, "could not read fixture\n");
        wasm_runtime_destroy();
        return 2;
    }

    wamr_sha256(wasm, (size_t)size, expected);
    memset(vok_digest, 0, sizeof(vok_digest));
    memset(&loaded, 0, sizeof(loaded));
    diagnostic[0] = '\0';
    load_rc = wamr_secrets_gateway_load_for_authority(
        wasm, size, expected, &loaded, vok_digest, diagnostic,
        sizeof(diagnostic));
    if (load_rc != WAMR_SECRETS_GATEWAY_VALID || digest_zero(vok_digest) ||
        memcmp(vok_digest, expected, 32) != 0) {
        fprintf(stderr, "load_for_authority failed: %s diag=%s\n",
                wamr_secrets_gateway_result_name(load_rc), diagnostic);
        wamr_secrets_gateway_release(&loaded);
        free(wasm);
        wasm_runtime_destroy();
        return 1;
    }

    memset(typed, 0, sizeof(typed));
    rc = vok_authority_wamr_loaded_digest_from_authority(vok_digest, typed);
    if (rc != VOK_ABI_OK || memcmp(typed, vok_digest, 32) != 0) {
        fprintf(stderr, "typed digest wrapper failed rc=%d\n", rc);
        wamr_secrets_gateway_release(&loaded);
        free(wasm);
        wasm_runtime_destroy();
        return 1;
    }

    rc = vok_authority_encode_return_u64(7, object, sizeof(object));
    if (rc != VOK_ABI_OK) {
        fprintf(stderr, "encode_return_u64 failed rc=%d\n", rc);
        wamr_secrets_gateway_release(&loaded);
        free(wasm);
        wasm_runtime_destroy();
        return 1;
    }

    memset(receipt, 0, sizeof(receipt));
    rc = vok_authority_handoff_admit_lease_receipt(
        object, sizeof(object), typed, typed, receipt);
    if (rc != VOK_ABI_OK || memcmp(receipt, typed, 32) != 0) {
        fprintf(stderr, "match handoff failed rc=%d\n", rc);
        wamr_secrets_gateway_release(&loaded);
        free(wasm);
        wasm_runtime_destroy();
        return 1;
    }
    puts("PASS: WAMR load_for_authority digest admits VOK native object");

    memcpy(mismatch, typed, 32);
    mismatch[0] ^= 1u;
    memset(receipt, 0, sizeof(receipt));
    rc = vok_authority_handoff_admit_lease_receipt(
        object, sizeof(object), typed, mismatch, receipt);
    if (rc != VOK_ABI_ARTIFACT_MISMATCH) {
        fprintf(stderr, "mismatch handoff expected MISMATCH, got rc=%d\n", rc);
        wamr_secrets_gateway_release(&loaded);
        free(wasm);
        wasm_runtime_destroy();
        return 1;
    }
    puts("PASS: swapped expected digest refuses VOK_ABI_ARTIFACT_MISMATCH");

    memset(missing, 0, sizeof(missing));
    rc = vok_authority_handoff_admit_lease_receipt(
        object, sizeof(object), missing, typed, receipt);
    if (rc != VOK_ABI_ARTIFACT_DIGEST_MISSING) {
        fprintf(stderr, "missing handoff expected MISSING, got rc=%d\n", rc);
        wamr_secrets_gateway_release(&loaded);
        free(wasm);
        wasm_runtime_destroy();
        return 1;
    }
    puts("PASS: all-zero mint digest refuses VOK_ABI_ARTIFACT_DIGEST_MISSING");

    wamr_secrets_gateway_release(&loaded);
    free(wasm);
    wasm_runtime_destroy();
    puts("PASS: composed WAMR loader into VOK admit/lease/receipt");
    return 0;
}

#define _POSIX_C_SOURCE 200809L

#include <errno.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "wasm_export.h"
#include "wamr_secrets_gateway_host.h"

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

static int load_with_verdict(uint8_t *wasm, uint32_t size,
                             const char *envelope, const char *seal,
                             wamr_secrets_gateway_result_t expected,
                             const char *label)
{
    char diagnostic[256];
    wamr_secrets_gateway_loaded_t loaded;
    wamr_secrets_gateway_result_t result;

    memset(&loaded, 0, sizeof(loaded));
    diagnostic[0] = '\0';
    result = wamr_secrets_gateway_load_for_authority(
        wasm, size, envelope, seal, &loaded, diagnostic, sizeof(diagnostic));
    if (result != expected) {
        fprintf(stderr, "%s: expected %s got %s diag=%s\n", label,
                wamr_secrets_gateway_result_name(expected),
                wamr_secrets_gateway_result_name(result), diagnostic);
        wamr_secrets_gateway_release(&loaded);
        return 0;
    }
    if (expected == WAMR_SECRETS_GATEWAY_VALID) {
        if (loaded.module == NULL || loaded.instance == NULL) {
            fprintf(stderr, "%s: VALID without instance\n", label);
            wamr_secrets_gateway_release(&loaded);
            return 0;
        }
    } else if (loaded.module != NULL || loaded.instance != NULL) {
        fprintf(stderr, "%s: refusal left a live module\n", label);
        wamr_secrets_gateway_release(&loaded);
        return 0;
    }
    wamr_secrets_gateway_release(&loaded);
    printf("PASS: %s -> %s\n", label,
           wamr_secrets_gateway_result_name(expected));
    return 1;
}

int main(int argc, char **argv)
{
    uint32_t subset_size = 0;
    uint32_t full_size = 0;
    uint32_t tamper_size = 0;
    uint8_t *subset;
    uint8_t *full;
    uint8_t *tamper;
    int ok;

    if (argc != 9) {
        fprintf(stderr,
                "usage: wamr-vok-handoff-probe subset.wasm full.wasm tamper.wasm "
                "env_sub seal_sub env_full seal_full missing_env\n");
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
    tamper = read_bytes(argv[3], &tamper_size);
    if (subset == NULL || full == NULL || tamper == NULL) {
        fprintf(stderr, "could not read fixtures\n");
        free(subset);
        free(full);
        free(tamper);
        wasm_runtime_destroy();
        return 2;
    }

    ok = load_with_verdict(subset, subset_size, argv[4], argv[5],
                           WAMR_SECRETS_GATEWAY_VALID,
                           "C WAMR load with out-of-process verifier envelope") &&
         load_with_verdict(full, full_size, argv[4], argv[5],
                           WAMR_SECRETS_GATEWAY_ARTIFACT_MISMATCH,
                           "full.wasm against subset envelope") &&
         load_with_verdict(subset, subset_size, argv[8], argv[8],
                           WAMR_SECRETS_GATEWAY_ARTIFACT_DIGEST_MISSING,
                           "missing verdict file") &&
         load_with_verdict(tamper, tamper_size, argv[4], argv[5],
                           WAMR_SECRETS_GATEWAY_ARTIFACT_MISMATCH,
                           "tampered subset against original envelope") &&
         load_with_verdict(full, full_size, argv[6], argv[7],
                           WAMR_SECRETS_GATEWAY_VALID,
                           "full.wasm with its own verifier envelope");

    free(subset);
    free(full);
    free(tamper);
    wasm_runtime_destroy();
    if (!ok) {
        return 1;
    }
    puts("PASS: composed C WAMR loader -> out-of-process Rust verifier -> VOK wax-seal");
    return 0;
}

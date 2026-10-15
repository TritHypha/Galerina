#define _POSIX_C_SOURCE 200809L

#include <errno.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "wasm_export.h"
#include "wamr_secrets_gateway_host.h"

#define RD1413_PROBE_MAX_WASM_BYTES (1024u * 1024u)

extern unsigned rd1413_load_path_instantiate_calls;
extern unsigned rd1413_load_path_unload_calls;
extern unsigned rd1413_load_path_deinstantiate_calls;
extern unsigned rd1413_load_path_import_count_calls;
extern unsigned rd1413_load_path_import_type_calls;
extern void rd1413_load_path_reset(void);

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
    bytes = (uint8_t *)malloc((size_t)length);
    if (bytes == NULL || fread(bytes, 1, (size_t)length, file) != (size_t)length) {
        free(bytes);
        fclose(file);
        return NULL;
    }
    fclose(file);
    *size = (uint32_t)length;
    return bytes;
}

static int expect_refusal(const char *path,
                          wamr_secrets_gateway_result_t expected,
                          unsigned expect_unload,
                          unsigned expect_import_type,
                          const char *label)
{
    uint32_t size = 0;
    uint8_t *bytes = read_bytes(path, &size);
    char diagnostic[256];
    wamr_secrets_gateway_loaded_t loaded;
    wamr_secrets_gateway_result_t result;

    if (bytes == NULL) {
        fprintf(stderr, "%s: could not read fixture\n", label);
        return 0;
    }
    rd1413_load_path_reset();
    diagnostic[0] = '\0';
    result = wamr_secrets_gateway_load(bytes, size, &loaded, diagnostic,
                                       sizeof(diagnostic));
    if (result != expected || loaded.module != NULL || loaded.instance != NULL) {
        fprintf(stderr,
                "%s: expected %s with empty loaded state, got %s module=%p instance=%p diag=%s\n",
                label, wamr_secrets_gateway_result_name(expected),
                wamr_secrets_gateway_result_name(result), (void *)loaded.module,
                (void *)loaded.instance, diagnostic);
        wamr_secrets_gateway_release(&loaded);
        free(bytes);
        return 0;
    }
    if (rd1413_load_path_instantiate_calls != 0) {
        fprintf(stderr, "%s: instantiate called on refusal (%u)\n", label,
                rd1413_load_path_instantiate_calls);
        free(bytes);
        return 0;
    }
    if (rd1413_load_path_unload_calls != expect_unload) {
        fprintf(stderr, "%s: unload count %u expected %u\n", label,
                rd1413_load_path_unload_calls, expect_unload);
        free(bytes);
        return 0;
    }
    if (rd1413_load_path_import_type_calls != expect_import_type) {
        fprintf(stderr, "%s: import-type count %u expected %u\n", label,
                rd1413_load_path_import_type_calls, expect_import_type);
        free(bytes);
        return 0;
    }
    printf("PASS: %s refuses %s, instantiate=0 unload=%u\n", label,
           wamr_secrets_gateway_result_name(expected), expect_unload);
    free(bytes);
    return 1;
}

static int expect_admitted(const char *path, const char *label)
{
    uint32_t size = 0;
    uint8_t *bytes = read_bytes(path, &size);
    char diagnostic[256];
    wamr_secrets_gateway_loaded_t loaded;
    wamr_secrets_gateway_result_t result;

    if (bytes == NULL) {
        fprintf(stderr, "%s: could not read fixture\n", label);
        return 0;
    }
    rd1413_load_path_reset();
    diagnostic[0] = '\0';
    result = wamr_secrets_gateway_load(bytes, size, &loaded, diagnostic,
                                       sizeof(diagnostic));
    if (result != WAMR_SECRETS_GATEWAY_VALID || loaded.module == NULL ||
        loaded.instance == NULL) {
        fprintf(stderr, "%s: expected VALID instance, got %s diag=%s\n", label,
                wamr_secrets_gateway_result_name(result), diagnostic);
        wamr_secrets_gateway_release(&loaded);
        free(bytes);
        return 0;
    }
    if (rd1413_load_path_instantiate_calls != 1 ||
        rd1413_load_path_unload_calls != 0) {
        fprintf(stderr, "%s: instantiate=%u unload=%u before release\n", label,
                rd1413_load_path_instantiate_calls,
                rd1413_load_path_unload_calls);
        wamr_secrets_gateway_release(&loaded);
        free(bytes);
        return 0;
    }
    wamr_secrets_gateway_release(&loaded);
    if (loaded.module != NULL || loaded.instance != NULL ||
        rd1413_load_path_deinstantiate_calls != 1 ||
        rd1413_load_path_unload_calls != 1) {
        fprintf(stderr, "%s: release did not deinstantiate+unload once\n", label);
        free(bytes);
        return 0;
    }
    printf("PASS: %s load VALID instantiate=1 then deinstantiate+unload once\n",
           label);
    free(bytes);
    return 1;
}

static int check_invalid_argument(void)
{
    char diagnostic[64];
    wamr_secrets_gateway_loaded_t loaded;
    uint8_t buf[1] = { 0 };
    wamr_secrets_gateway_result_t result;

    rd1413_load_path_reset();
    result = wamr_secrets_gateway_load(NULL, 1, &loaded, diagnostic,
                                       sizeof(diagnostic));
    if (result != WAMR_SECRETS_GATEWAY_INVALID_ARGUMENT ||
        rd1413_load_path_instantiate_calls != 0 ||
        rd1413_load_path_unload_calls != 0) {
        fprintf(stderr, "null buf must be INVALID_ARGUMENT without load\n");
        return 0;
    }
    result = wamr_secrets_gateway_load(buf, 1, NULL, diagnostic, sizeof(diagnostic));
    if (result != WAMR_SECRETS_GATEWAY_INVALID_ARGUMENT ||
        rd1413_load_path_instantiate_calls != 0) {
        fprintf(stderr, "null out must be INVALID_ARGUMENT without instantiate\n");
        return 0;
    }
    puts("PASS: load path refuses invalid arguments without instantiate or unload");
    return 1;
}

static int check_load_failed(void)
{
    uint8_t junk[8] = { 0, 1, 2, 3, 4, 5, 6, 7 };
    char diagnostic[256];
    wamr_secrets_gateway_loaded_t loaded;
    wamr_secrets_gateway_result_t result;

    rd1413_load_path_reset();
    result = wamr_secrets_gateway_load(junk, sizeof(junk), &loaded, diagnostic,
                                       sizeof(diagnostic));
    if (result != WAMR_SECRETS_GATEWAY_LOAD_FAILED || loaded.module != NULL ||
        loaded.instance != NULL || rd1413_load_path_instantiate_calls != 0 ||
        rd1413_load_path_unload_calls != 0) {
        fprintf(stderr, "garbage bytes must LOAD_FAILED without unload: %s\n",
                diagnostic);
        wamr_secrets_gateway_release(&loaded);
        return 0;
    }
    puts("PASS: load path refuses unparseable bytes, instantiate=0 unload=0");
    return 1;
}

static int check_negative_count(const char *path)
{
    uint32_t size = 0;
    uint8_t *bytes = read_bytes(path, &size);
    char diagnostic[256];
    wamr_secrets_gateway_loaded_t loaded;
    wamr_secrets_gateway_result_t result;

    if (bytes == NULL) {
        fprintf(stderr, "negative-count: could not read fixture\n");
        return 0;
    }
    rd1413_load_path_reset();
    if (setenv("RD1413_TEST_IMPORT_COUNT_UNAVAILABLE", "1", 1) != 0) {
        fprintf(stderr, "negative-count: could not set inject\n");
        free(bytes);
        return 0;
    }
    result = wamr_secrets_gateway_load(bytes, size, &loaded, diagnostic,
                                       sizeof(diagnostic));
    unsetenv("RD1413_TEST_IMPORT_COUNT_UNAVAILABLE");
    if (result != WAMR_SECRETS_GATEWAY_METADATA_UNAVAILABLE ||
        loaded.module != NULL || loaded.instance != NULL) {
        fprintf(stderr, "negative-count: expected METADATA_UNAVAILABLE: %s\n",
                diagnostic);
        wamr_secrets_gateway_release(&loaded);
        free(bytes);
        return 0;
    }
    if (rd1413_load_path_import_count_calls == 0 ||
        rd1413_load_path_import_type_calls != 0 ||
        rd1413_load_path_instantiate_calls != 0 ||
        rd1413_load_path_unload_calls != 1) {
        fprintf(stderr,
                "negative-count: count=%u type=%u instantiate=%u unload=%u\n",
                rd1413_load_path_import_count_calls,
                rd1413_load_path_import_type_calls,
                rd1413_load_path_instantiate_calls,
                rd1413_load_path_unload_calls);
        free(bytes);
        return 0;
    }
    puts("PASS: negative import count is METADATA_UNAVAILABLE with zero import-type accesses, instantiate=0 unload=1");
    free(bytes);
    return 1;
}

static int check_instantiate_fail(const char *path)
{
    uint32_t size = 0;
    uint8_t *bytes = read_bytes(path, &size);
    char diagnostic[256];
    wamr_secrets_gateway_loaded_t loaded;
    wamr_secrets_gateway_result_t result;

    if (bytes == NULL) {
        fprintf(stderr, "instantiate-fail: could not read fixture\n");
        return 0;
    }
    rd1413_load_path_reset();
    if (setenv("RD1413_TEST_FAIL_INSTANTIATE", "1", 1) != 0) {
        fprintf(stderr, "instantiate-fail: could not set inject\n");
        free(bytes);
        return 0;
    }
    result = wamr_secrets_gateway_load(bytes, size, &loaded, diagnostic,
                                       sizeof(diagnostic));
    unsetenv("RD1413_TEST_FAIL_INSTANTIATE");
    if (result != WAMR_SECRETS_GATEWAY_INSTANTIATE_FAILED ||
        loaded.module != NULL || loaded.instance != NULL ||
        rd1413_load_path_instantiate_calls != 1 ||
        rd1413_load_path_unload_calls != 1) {
        fprintf(stderr,
                "instantiate-fail: got %s instantiate=%u unload=%u diag=%s\n",
                wamr_secrets_gateway_result_name(result),
                rd1413_load_path_instantiate_calls,
                rd1413_load_path_unload_calls, diagnostic);
        wamr_secrets_gateway_release(&loaded);
        free(bytes);
        return 0;
    }
    puts("PASS: instantiate failure after VALID unloads once and leaves no instance");
    free(bytes);
    return 1;
}

int main(int argc, char **argv)
{
    int ok;

    if (argc != 7) {
        fprintf(stderr,
                "usage: load-path-probe subset full superset duplicate mismatch nonfunction\n");
        return 2;
    }
    if (!wasm_runtime_init()) {
        fprintf(stderr, "runtime initialization failed\n");
        return 2;
    }

    ok = check_invalid_argument() && check_load_failed();
    if (ok) {
        ok = expect_refusal(argv[1], WAMR_SECRETS_GATEWAY_UNLINKED_IMPORT, 1, 1,
                            "unlinked subset before native registration");
    }
    if (ok && !wamr_secrets_gateway_register_natives()) {
        fprintf(stderr, "native registration failed\n");
        wasm_runtime_destroy();
        return 2;
    }
    if (ok) {
        ok = check_negative_count(argv[1]) &&
             expect_refusal(argv[4], WAMR_SECRETS_GATEWAY_DUPLICATE_IMPORT, 1, 3,
                            "one-contract two-import") &&
             expect_refusal(argv[3], WAMR_SECRETS_GATEWAY_UNAPPROVED_IMPORT, 1, 3,
                            "superset") &&
             expect_refusal(argv[5], WAMR_SECRETS_GATEWAY_SIGNATURE_MISMATCH, 1, 1,
                            "signature mismatch") &&
             expect_refusal(argv[6], WAMR_SECRETS_GATEWAY_UNSUPPORTED_KIND, 1, 1,
                            "non-function import") &&
             expect_admitted(argv[1], "admitted subset") &&
             expect_admitted(argv[2], "admitted full allowlist") &&
             check_instantiate_fail(argv[1]);
    }

    wasm_runtime_destroy();
    return ok ? 0 : 1;
}

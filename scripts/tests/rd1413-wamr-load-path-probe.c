#define _POSIX_C_SOURCE 200809L

#include <errno.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

#include "wasm_export.h"
#include "wamr_secrets_gateway_host.h"
#include "wamr_sha256.h"

#define RD1413_PROBE_MAX_WASM_BYTES (1024u * 1024u)

static const char *g_verifier;

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

static int digest_field_zero(const wamr_secrets_gateway_loaded_t *loaded)
{
    uint8_t copy[32];
    return !wamr_secrets_gateway_copy_artifact_digest(loaded, copy);
}

static int hex_nibble(char ch)
{
    if (ch >= '0' && ch <= '9') {
        return ch - '0';
    }
    if (ch >= 'a' && ch <= 'f') {
        return ch - 'a' + 10;
    }
    if (ch >= 'A' && ch <= 'F') {
        return ch - 'A' + 10;
    }
    return -1;
}

static int parse_sha256_hex(const char *hex, uint8_t out[32])
{
    size_t i;
    if (hex == NULL || strlen(hex) != 64) {
        return 0;
    }
    for (i = 0; i < 32; i++) {
        int hi = hex_nibble(hex[i * 2u]);
        int lo = hex_nibble(hex[i * 2u + 1u]);
        if (hi < 0 || lo < 0) {
            return 0;
        }
        out[i] = (uint8_t)((hi << 4) | lo);
    }
    return 1;
}

static int expect_bytes(const uint8_t *got, const uint8_t *want, const char *label)
{
    if (memcmp(got, want, 32) != 0) {
        fprintf(stderr, "%s: digest mismatch\n", label);
        return 0;
    }
    return 1;
}

static wamr_secrets_gateway_result_t load_with_authority(
    uint8_t *bytes,
    uint32_t size,
    wamr_secrets_gateway_loaded_t *loaded,
    char *diagnostic,
    size_t diagnostic_capacity)
{
    return wamr_secrets_gateway_load_for_authority(
        bytes, size, g_verifier, loaded, diagnostic, diagnostic_capacity);
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
    result = load_with_authority(bytes, size, &loaded, diagnostic,
                                 sizeof(diagnostic));
    if (result != expected || loaded.module != NULL || loaded.instance != NULL ||
        !digest_field_zero(&loaded)) {
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

static int expect_admitted(const char *path, const char *label,
                           const char *sha256_env)
{
    uint32_t size = 0;
    uint8_t *bytes = read_bytes(path, &size);
    char diagnostic[256];
    wamr_secrets_gateway_loaded_t loaded;
    wamr_secrets_gateway_result_t result;
    uint8_t expected[32];
    uint8_t got[32];
    uint8_t from_env[32];
    const char *hex;

    if (bytes == NULL) {
        fprintf(stderr, "%s: could not read fixture\n", label);
        return 0;
    }
    rd1413_load_path_reset();
    diagnostic[0] = '\0';
    wamr_sha256(bytes, (size_t)size, expected);
    result = load_with_authority(bytes, size, &loaded, diagnostic,
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
    if (!wamr_secrets_gateway_copy_artifact_digest(&loaded, got) ||
        !expect_bytes(got, expected, label)) {
        fprintf(stderr, "%s: accessor digest mismatch vs pre-load hash\n", label);
        wamr_secrets_gateway_release(&loaded);
        free(bytes);
        return 0;
    }
    hex = getenv(sha256_env);
    if (hex == NULL || !parse_sha256_hex(hex, from_env) ||
        !expect_bytes(got, from_env, label)) {
        fprintf(stderr, "%s: sha256sum env %s mismatch\n", label, sha256_env);
        wamr_secrets_gateway_release(&loaded);
        free(bytes);
        return 0;
    }
    wamr_secrets_gateway_release(&loaded);
    if (loaded.module != NULL || loaded.instance != NULL ||
        !digest_field_zero(&loaded) ||
        rd1413_load_path_deinstantiate_calls != 1 ||
        rd1413_load_path_unload_calls != 1) {
        fprintf(stderr,
                "%s: release did not deinstantiate+unload once with zero digest\n",
                label);
        free(bytes);
        return 0;
    }
    printf("PASS: %s load VALID instantiate=1 digest matches sha256sum then deinstantiate+unload once\n",
           label);
    free(bytes);
    return 1;
}

static int check_sha256_kat(void)
{
    uint8_t out[32];
    uint8_t want[32];
    uint8_t *million;
    static const char k_empty[] =
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
    static const char k_abc[] =
        "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
    static const char k_two_block[] =
        "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1";
    static const char k_million_a[] =
        "cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0";
    static const uint8_t k_two_block_msg[] =
        "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq";

    if (!parse_sha256_hex(k_empty, want)) {
        fprintf(stderr, "kat: empty vector parse failed\n");
        return 0;
    }
    wamr_sha256((const uint8_t *)"", 0, out);
    if (!expect_bytes(out, want, "kat empty")) {
        return 0;
    }

    if (!parse_sha256_hex(k_abc, want)) {
        fprintf(stderr, "kat: abc vector parse failed\n");
        return 0;
    }
    wamr_sha256((const uint8_t *)"abc", 3, out);
    if (!expect_bytes(out, want, "kat abc")) {
        return 0;
    }

    if (!parse_sha256_hex(k_two_block, want)) {
        fprintf(stderr, "kat: 448-bit vector parse failed\n");
        return 0;
    }
    wamr_sha256(k_two_block_msg, sizeof(k_two_block_msg) - 1u, out);
    if (!expect_bytes(out, want, "kat 448-bit two-block")) {
        return 0;
    }

    million = (uint8_t *)malloc(1000000u);
    if (million == NULL) {
        fprintf(stderr, "kat: million-a alloc failed\n");
        return 0;
    }
    memset(million, 'a', 1000000u);
    if (!parse_sha256_hex(k_million_a, want)) {
        fprintf(stderr, "kat: million-a vector parse failed\n");
        free(million);
        return 0;
    }
    wamr_sha256(million, 1000000u, out);
    free(million);
    if (!expect_bytes(out, want, "kat million-a")) {
        return 0;
    }
    puts("PASS: SHA-256 KAT empty/abc/448-bit/million-a");
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
    if (result != WAMR_SECRETS_GATEWAY_ARTIFACT_DIGEST_MISSING ||
        rd1413_load_path_instantiate_calls != 0 ||
        rd1413_load_path_unload_calls != 0 || !digest_field_zero(&loaded)) {
        fprintf(stderr, "digestless load must be ARTIFACT_DIGEST_MISSING without load\n");
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

static void poison_loaded(wamr_secrets_gateway_loaded_t *loaded)
{
    memset(loaded, 0x5a, sizeof(*loaded));
    loaded->module = (wasm_module_t)(uintptr_t)0x1111u;
    loaded->instance = (wasm_module_inst_t)(uintptr_t)0x2222u;
    loaded->owned_snapshot = NULL;
}

static int check_invalid_diagnostic_zeros_out(void)
{
    wamr_secrets_gateway_loaded_t loaded;
    uint8_t buf[1] = { 0 };
    wamr_secrets_gateway_result_t result;
    char unused[1];

    poison_loaded(&loaded);
    rd1413_load_path_reset();
    result = wamr_secrets_gateway_load(buf, 1, &loaded, NULL, 64);
    if (result != WAMR_SECRETS_GATEWAY_INVALID_ARGUMENT ||
        loaded.module != NULL || loaded.instance != NULL ||
        !digest_field_zero(&loaded) ||
        rd1413_load_path_instantiate_calls != 0 ||
        rd1413_load_path_unload_calls != 0) {
        fprintf(stderr, "NULL diagnostic must INVALID_ARGUMENT and zero out\n");
        return 0;
    }

    poison_loaded(&loaded);
    unused[0] = 'x';
    result = wamr_secrets_gateway_load(buf, 1, &loaded, unused, 0);
    if (result != WAMR_SECRETS_GATEWAY_INVALID_ARGUMENT ||
        loaded.module != NULL || loaded.instance != NULL ||
        !digest_field_zero(&loaded) ||
        rd1413_load_path_instantiate_calls != 0 ||
        rd1413_load_path_unload_calls != 0) {
        fprintf(stderr, "zero-capacity diagnostic must INVALID_ARGUMENT and zero out\n");
        return 0;
    }
    puts("PASS: invalid diagnostic zeros out before INVALID_ARGUMENT");
    return 1;
}

static int check_digestless_public_load(uint8_t *bytes, uint32_t size)
{
    char diagnostic[256];
    wamr_secrets_gateway_loaded_t loaded;
    wamr_secrets_gateway_result_t result;

    poison_loaded(&loaded);
    rd1413_load_path_reset();
    diagnostic[0] = '\0';
    result = wamr_secrets_gateway_load(bytes, size, &loaded, diagnostic,
                                       sizeof(diagnostic));
    if (result != WAMR_SECRETS_GATEWAY_ARTIFACT_DIGEST_MISSING ||
        loaded.module != NULL || loaded.instance != NULL ||
        !digest_field_zero(&loaded) ||
        rd1413_load_path_instantiate_calls != 0 ||
        rd1413_load_path_unload_calls != 0) {
        fprintf(stderr,
                "digestless public load must ARTIFACT_DIGEST_MISSING without instantiate: %s\n",
                diagnostic);
        wamr_secrets_gateway_release(&loaded);
        return 0;
    }
    puts("PASS: public load hard-refuses without digest, instantiate=0");
    return 1;
}

static int join_path(char *out, size_t cap, const char *dir, const char *name)
{
    return snprintf(out, cap, "%s/%s", dir, name) < (int)cap;
}

static int check_load_for_authority(const char *path,
                                    const char *verdict_dir,
                                    const char *verifier,
                                    const char *evil_verifier)
{
    uint32_t size = 0;
    uint8_t *bytes = read_bytes(path, &size);
    uint8_t *original = NULL;
    char diagnostic[256];
    wamr_secrets_gateway_loaded_t loaded;
    wamr_secrets_gateway_result_t result;
    uint8_t digest[32];
    uint8_t got[32];
    char missing_path[512];
    char marker[512];
    char preload[512];
    const char *old_preload;

    if (bytes == NULL || verdict_dir == NULL || verifier == NULL ||
        evil_verifier == NULL) {
        fprintf(stderr, "load_for_authority: could not read fixtures\n");
        free(bytes);
        return 0;
    }
    if (!join_path(missing_path, sizeof(missing_path), verdict_dir,
                   "missing.txt") ||
        !join_path(marker, sizeof(marker), verdict_dir, "preload-fired") ||
        !join_path(preload, sizeof(preload), verdict_dir, "evil-preload.so")) {
        free(bytes);
        return 0;
    }
    original = (uint8_t *)malloc((size_t)size);
    if (original == NULL) {
        free(bytes);
        return 0;
    }
    memcpy(original, bytes, (size_t)size);
    wamr_sha256(original, (size_t)size, digest);

    poison_loaded(&loaded);
    rd1413_load_path_reset();
    diagnostic[0] = '\0';
    result = wamr_secrets_gateway_load_for_authority(
        bytes, size, NULL, &loaded, diagnostic, sizeof(diagnostic));
    if (result != WAMR_SECRETS_GATEWAY_INVALID_ARGUMENT ||
        loaded.module != NULL || loaded.instance != NULL ||
        !digest_field_zero(&loaded) ||
        rd1413_load_path_instantiate_calls != 0 ||
        rd1413_load_path_unload_calls != 0) {
        fprintf(stderr, "load_for_authority NULL verifier path must refuse\n");
        wamr_secrets_gateway_release(&loaded);
        free(bytes);
        free(original);
        return 0;
    }

    poison_loaded(&loaded);
    rd1413_load_path_reset();
    result = wamr_secrets_gateway_load_for_authority(
        bytes, size, missing_path, &loaded, diagnostic, sizeof(diagnostic));
    if (result != WAMR_SECRETS_GATEWAY_ARTIFACT_DIGEST_MISSING ||
        loaded.module != NULL || loaded.instance != NULL ||
        !digest_field_zero(&loaded) ||
        rd1413_load_path_instantiate_calls != 0) {
        fprintf(stderr, "load_for_authority missing verifier must MISSING\n");
        wamr_secrets_gateway_release(&loaded);
        free(bytes);
        free(original);
        return 0;
    }

    poison_loaded(&loaded);
    rd1413_load_path_reset();
    result = wamr_secrets_gateway_load_for_authority(
        bytes, size, evil_verifier, &loaded, diagnostic, sizeof(diagnostic));
    if (result != WAMR_SECRETS_GATEWAY_VERDICT_REFUSED ||
        loaded.module != NULL || loaded.instance != NULL ||
        rd1413_load_path_instantiate_calls != 0) {
        fprintf(stderr, "substituted verifier must VERDICT_REFUSED, got %s\n",
                wamr_secrets_gateway_result_name(result));
        wamr_secrets_gateway_release(&loaded);
        free(bytes);
        free(original);
        return 0;
    }

    (void)unlink(marker);
    old_preload = getenv("LD_PRELOAD");
    if (setenv("WAMR_VOK_PRELOAD_MARKER", marker, 1) != 0 ||
        setenv("LD_PRELOAD", preload, 1) != 0) {
        fprintf(stderr, "could not set LD_PRELOAD\n");
        free(bytes);
        free(original);
        return 0;
    }

    poison_loaded(&loaded);
    rd1413_load_path_reset();
    result = wamr_secrets_gateway_load_for_authority(
        bytes, size, verifier, &loaded, diagnostic, sizeof(diagnostic));
    if (old_preload == NULL) {
        unsetenv("LD_PRELOAD");
    } else {
        setenv("LD_PRELOAD", old_preload, 1);
    }
    unsetenv("WAMR_VOK_PRELOAD_MARKER");
    if (result != WAMR_SECRETS_GATEWAY_VALID || loaded.module == NULL ||
        loaded.instance == NULL ||
        rd1413_load_path_instantiate_calls != 1 ||
        rd1413_load_path_unload_calls != 0) {
        fprintf(stderr, "load_for_authority VALID pinned child failed: %s\n",
                diagnostic);
        wamr_secrets_gateway_release(&loaded);
        free(bytes);
        free(original);
        return 0;
    }
    if (access(marker, F_OK) == 0) {
        fprintf(stderr, "child inherited LD_PRELOAD (marker fired)\n");
        wamr_secrets_gateway_release(&loaded);
        free(bytes);
        free(original);
        return 0;
    }
    if (loaded.owned_snapshot == NULL || loaded.owned_snapshot == bytes) {
        fprintf(stderr, "owned snapshot is not a private copy of caller buf\n");
        wamr_secrets_gateway_release(&loaded);
        free(bytes);
        free(original);
        return 0;
    }
    memset(bytes, 0xaa, (size_t)size);
    if (!wamr_secrets_gateway_copy_artifact_digest(&loaded, got) ||
        memcmp(got, digest, 32) != 0) {
        fprintf(stderr, "artifact digest drifted after caller-buf mutation\n");
        wamr_secrets_gateway_release(&loaded);
        free(bytes);
        free(original);
        return 0;
    }
    wamr_secrets_gateway_release(&loaded);
    puts("PASS: load_for_authority spawns sealed-memfd child, empty envp, one snapshot");
    free(bytes);
    free(original);
    return 1;
}

static int check_load_failed(void)
{
    uint8_t junk[8] = { 0, 1, 2, 3, 4, 5, 6, 7 };
    char diagnostic[256];
    wamr_secrets_gateway_loaded_t loaded;
    wamr_secrets_gateway_result_t result;

    rd1413_load_path_reset();
    result = load_with_authority(junk, sizeof(junk), &loaded, diagnostic,
                                 sizeof(diagnostic));
    if (result != WAMR_SECRETS_GATEWAY_VERDICT_REFUSED || loaded.module != NULL ||
        loaded.instance != NULL || !digest_field_zero(&loaded) ||
        rd1413_load_path_instantiate_calls != 0 ||
        rd1413_load_path_unload_calls != 0) {
        fprintf(stderr, "garbage bytes must VERDICT_REFUSED before WAMR parse: %s\n",
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
    result = load_with_authority(bytes, size, &loaded, diagnostic,
                                 sizeof(diagnostic));
    unsetenv("RD1413_TEST_IMPORT_COUNT_UNAVAILABLE");
    if (result != WAMR_SECRETS_GATEWAY_METADATA_UNAVAILABLE ||
        loaded.module != NULL || loaded.instance != NULL ||
        !digest_field_zero(&loaded)) {
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
    result = load_with_authority(bytes, size, &loaded, diagnostic,
                                 sizeof(diagnostic));
    unsetenv("RD1413_TEST_FAIL_INSTANTIATE");
    if (result != WAMR_SECRETS_GATEWAY_INSTANTIATE_FAILED ||
        loaded.module != NULL || loaded.instance != NULL ||
        !digest_field_zero(&loaded) ||
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

    if (argc != 10) {
        fprintf(stderr,
                "usage: load-path-probe subset full superset duplicate mismatch nonfunction verdict_dir verifier evil_verifier\n");
        return 2;
    }
    g_verifier = argv[8];
    if (!wasm_runtime_init()) {
        fprintf(stderr, "runtime initialization failed\n");
        return 2;
    }

    ok = check_sha256_kat() && check_invalid_argument() &&
         check_invalid_diagnostic_zeros_out() && check_load_failed();
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
             expect_admitted(argv[1], "admitted subset",
                             "RD1413_SUBSET_SHA256") &&
             expect_admitted(argv[2], "admitted full allowlist",
                             "RD1413_FULL_SHA256") &&
             check_instantiate_fail(argv[1]) &&
             check_load_for_authority(argv[1], argv[7], argv[8], argv[9]);
        if (ok) {
            uint32_t subset_size = 0;
            uint8_t *subset = read_bytes(argv[1], &subset_size);
            if (subset == NULL) {
                fprintf(stderr, "digestless subset: could not read fixture\n");
                ok = 0;
            } else {
                ok = check_digestless_public_load(subset, subset_size);
                free(subset);
            }
        }
    }

    wasm_runtime_destroy();
    return ok ? 0 : 1;
}

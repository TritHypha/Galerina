#define _POSIX_C_SOURCE 200809L

#include <errno.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "wasm_export.h"
#include "wamr_secrets_gateway_host.h"
#include "wamr_sha256.h"

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

static wamr_secrets_gateway_result_t load_with_computed_digest(
    uint8_t *bytes,
    uint32_t size,
    wamr_secrets_gateway_loaded_t *loaded,
    char *diagnostic,
    size_t diagnostic_capacity)
{
    uint8_t expected[32];
    uint8_t vok_digest[32];

    wamr_sha256(bytes, (size_t)size, expected);
    memset(vok_digest, 0, sizeof(vok_digest));
    return wamr_secrets_gateway_load_for_authority(
        bytes, size, expected, loaded, vok_digest, diagnostic,
        diagnostic_capacity);
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
    result = load_with_computed_digest(bytes, size, &loaded, diagnostic,
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
    result = load_with_computed_digest(bytes, size, &loaded, diagnostic,
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

static int expect_admitted_expected(const char *path, const char *label)
{
    uint32_t size = 0;
    uint8_t *bytes = read_bytes(path, &size);
    char diagnostic[256];
    wamr_secrets_gateway_loaded_t loaded;
    wamr_secrets_gateway_result_t result;
    uint8_t expected[32];
    uint8_t got[32];

    if (bytes == NULL) {
        fprintf(stderr, "%s: could not read fixture\n", label);
        return 0;
    }
    rd1413_load_path_reset();
    diagnostic[0] = '\0';
    wamr_sha256(bytes, (size_t)size, expected);
    result = wamr_secrets_gateway_load_expected(bytes, size, expected, &loaded,
                                                diagnostic, sizeof(diagnostic));
    if (result != WAMR_SECRETS_GATEWAY_VALID || loaded.module == NULL ||
        loaded.instance == NULL) {
        fprintf(stderr, "%s: expected VALID, got %s diag=%s\n", label,
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
        fprintf(stderr, "%s: accessor mismatch on load_expected\n", label);
        wamr_secrets_gateway_release(&loaded);
        free(bytes);
        return 0;
    }
    wamr_secrets_gateway_release(&loaded);
    if (!digest_field_zero(&loaded)) {
        fprintf(stderr, "%s: release left digest live\n", label);
        free(bytes);
        return 0;
    }
    printf("PASS: %s load_expected VALID accessor matches pre-load hash\n",
           label);
    free(bytes);
    return 1;
}

static int expect_mismatch_swapped(const char *path_a, const char *path_b,
                                   const char *label)
{
    uint32_t size_a = 0;
    uint32_t size_b = 0;
    uint8_t *bytes_a = read_bytes(path_a, &size_a);
    uint8_t *bytes_b = read_bytes(path_b, &size_b);
    char diagnostic[256];
    wamr_secrets_gateway_loaded_t loaded;
    wamr_secrets_gateway_result_t result;
    uint8_t digest_a[32];

    if (bytes_a == NULL || bytes_b == NULL) {
        fprintf(stderr, "%s: could not read fixtures\n", label);
        free(bytes_a);
        free(bytes_b);
        return 0;
    }
    rd1413_load_path_reset();
    diagnostic[0] = '\0';
    wamr_sha256(bytes_a, (size_t)size_a, digest_a);
    result = wamr_secrets_gateway_load_expected(bytes_b, size_b, digest_a,
                                                &loaded, diagnostic,
                                                sizeof(diagnostic));
    if (result != WAMR_SECRETS_GATEWAY_ARTIFACT_MISMATCH ||
        loaded.module != NULL || loaded.instance != NULL ||
        !digest_field_zero(&loaded)) {
        fprintf(stderr, "%s: expected ARTIFACT_MISMATCH empty loaded, got %s diag=%s\n",
                label, wamr_secrets_gateway_result_name(result), diagnostic);
        wamr_secrets_gateway_release(&loaded);
        free(bytes_a);
        free(bytes_b);
        return 0;
    }
    if (rd1413_load_path_instantiate_calls != 0 ||
        rd1413_load_path_unload_calls != 1) {
        fprintf(stderr, "%s: instantiate=%u unload=%u expected 0/1\n", label,
                rd1413_load_path_instantiate_calls,
                rd1413_load_path_unload_calls);
        free(bytes_a);
        free(bytes_b);
        return 0;
    }
    printf("PASS: %s ARTIFACT_MISMATCH instantiate=0 unload=1\n", label);
    free(bytes_a);
    free(bytes_b);
    return 1;
}

static int expect_missing_digest(const char *path, const char *label)
{
    uint32_t size = 0;
    uint8_t *bytes = read_bytes(path, &size);
    char diagnostic[256];
    wamr_secrets_gateway_loaded_t loaded;
    wamr_secrets_gateway_result_t result;
    uint8_t zero[32];

    if (bytes == NULL) {
        fprintf(stderr, "%s: could not read fixture\n", label);
        return 0;
    }
    memset(zero, 0, sizeof(zero));
    rd1413_load_path_reset();
    diagnostic[0] = '\0';
    result = wamr_secrets_gateway_load_expected(bytes, size, zero, &loaded,
                                                diagnostic, sizeof(diagnostic));
    if (result != WAMR_SECRETS_GATEWAY_ARTIFACT_DIGEST_MISSING ||
        loaded.module != NULL || loaded.instance != NULL ||
        !digest_field_zero(&loaded)) {
        fprintf(stderr, "%s: expected ARTIFACT_DIGEST_MISSING, got %s diag=%s\n",
                label, wamr_secrets_gateway_result_name(result), diagnostic);
        wamr_secrets_gateway_release(&loaded);
        free(bytes);
        return 0;
    }
    if (rd1413_load_path_instantiate_calls != 0 ||
        rd1413_load_path_unload_calls != 0) {
        fprintf(stderr, "%s: instantiate=%u unload=%u expected 0/0\n", label,
                rd1413_load_path_instantiate_calls,
                rd1413_load_path_unload_calls);
        free(bytes);
        return 0;
    }
    printf("PASS: %s ARTIFACT_DIGEST_MISSING instantiate=0 unload=0\n", label);
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
    result = wamr_secrets_gateway_load_expected(buf, 1, NULL, &loaded, diagnostic,
                                                sizeof(diagnostic));
    if (result != WAMR_SECRETS_GATEWAY_INVALID_ARGUMENT ||
        rd1413_load_path_instantiate_calls != 0 ||
        rd1413_load_path_unload_calls != 0 || !digest_field_zero(&loaded)) {
        fprintf(stderr, "null expected digest must be INVALID_ARGUMENT without load\n");
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

static int vok_digest_is_zero(const uint8_t digest[32])
{
    uint8_t acc = 0;
    size_t i;
    for (i = 0; i < 32; i++) {
        acc |= digest[i];
    }
    return acc == 0;
}

static int check_load_for_authority(const char *path, const char *other_path)
{
    uint32_t size = 0;
    uint32_t other_size = 0;
    uint8_t *bytes = read_bytes(path, &size);
    uint8_t *other = read_bytes(other_path, &other_size);
    char diagnostic[256];
    wamr_secrets_gateway_loaded_t loaded;
    wamr_secrets_gateway_result_t result;
    uint8_t expected[32];
    uint8_t other_digest[32];
    uint8_t vok_digest[32];
    uint8_t junk[8] = { 0, 1, 2, 3, 4, 5, 6, 7 };

    if (bytes == NULL || other == NULL) {
        fprintf(stderr, "load_for_authority: could not read fixtures\n");
        free(bytes);
        free(other);
        return 0;
    }

    wamr_sha256(bytes, (size_t)size, expected);
    wamr_sha256(other, (size_t)other_size, other_digest);

    poison_loaded(&loaded);
    memset(vok_digest, 0x5a, sizeof(vok_digest));
    rd1413_load_path_reset();
    diagnostic[0] = '\0';
    result = wamr_secrets_gateway_load_for_authority(
        bytes, size, NULL, &loaded, vok_digest, diagnostic, sizeof(diagnostic));
    if (result != WAMR_SECRETS_GATEWAY_INVALID_ARGUMENT ||
        loaded.module != NULL || loaded.instance != NULL ||
        !digest_field_zero(&loaded) || !vok_digest_is_zero(vok_digest) ||
        rd1413_load_path_instantiate_calls != 0 ||
        rd1413_load_path_unload_calls != 0) {
        fprintf(stderr, "load_for_authority NULL expected must refuse with zero vok_digest\n");
        wamr_secrets_gateway_release(&loaded);
        free(bytes);
        free(other);
        return 0;
    }

    poison_loaded(&loaded);
    memset(vok_digest, 0x5a, sizeof(vok_digest));
    result = wamr_secrets_gateway_load_for_authority(
        bytes, size, expected, &loaded, NULL, diagnostic, sizeof(diagnostic));
    if (result != WAMR_SECRETS_GATEWAY_INVALID_ARGUMENT ||
        loaded.module != NULL || loaded.instance != NULL ||
        !digest_field_zero(&loaded) ||
        rd1413_load_path_instantiate_calls != 0) {
        fprintf(stderr, "load_for_authority NULL vok_digest must refuse and zero out\n");
        wamr_secrets_gateway_release(&loaded);
        free(bytes);
        free(other);
        return 0;
    }

    memset(expected, 0, sizeof(expected));
    memset(vok_digest, 0x5a, sizeof(vok_digest));
    poison_loaded(&loaded);
    rd1413_load_path_reset();
    result = wamr_secrets_gateway_load_for_authority(
        bytes, size, expected, &loaded, vok_digest, diagnostic,
        sizeof(diagnostic));
    if (result != WAMR_SECRETS_GATEWAY_ARTIFACT_DIGEST_MISSING ||
        loaded.module != NULL || loaded.instance != NULL ||
        !digest_field_zero(&loaded) || !vok_digest_is_zero(vok_digest) ||
        rd1413_load_path_instantiate_calls != 0 ||
        rd1413_load_path_unload_calls != 0) {
        fprintf(stderr, "load_for_authority all-zero expected must MISSING with zero vok_digest\n");
        wamr_secrets_gateway_release(&loaded);
        free(bytes);
        free(other);
        return 0;
    }

    wamr_sha256(bytes, (size_t)size, expected);
    memset(vok_digest, 0x5a, sizeof(vok_digest));
    poison_loaded(&loaded);
    rd1413_load_path_reset();
    result = wamr_secrets_gateway_load_for_authority(
        bytes, size, other_digest, &loaded, vok_digest, diagnostic,
        sizeof(diagnostic));
    if (result != WAMR_SECRETS_GATEWAY_ARTIFACT_MISMATCH ||
        loaded.module != NULL || loaded.instance != NULL ||
        !digest_field_zero(&loaded) || !vok_digest_is_zero(vok_digest) ||
        rd1413_load_path_instantiate_calls != 0 ||
        rd1413_load_path_unload_calls != 1) {
        fprintf(stderr,
                "load_for_authority mismatch must refuse with zero vok_digest: %s instantiate=%u unload=%u\n",
                wamr_secrets_gateway_result_name(result),
                rd1413_load_path_instantiate_calls,
                rd1413_load_path_unload_calls);
        wamr_secrets_gateway_release(&loaded);
        free(bytes);
        free(other);
        return 0;
    }

    memset(vok_digest, 0x5a, sizeof(vok_digest));
    poison_loaded(&loaded);
    rd1413_load_path_reset();
    result = wamr_secrets_gateway_load_for_authority(
        junk, sizeof(junk), expected, &loaded, vok_digest, diagnostic,
        sizeof(diagnostic));
    if (result != WAMR_SECRETS_GATEWAY_LOAD_FAILED ||
        loaded.module != NULL || loaded.instance != NULL ||
        !digest_field_zero(&loaded) || !vok_digest_is_zero(vok_digest) ||
        rd1413_load_path_instantiate_calls != 0) {
        fprintf(stderr, "load_for_authority LOAD_FAILED must leave vok_digest zero\n");
        wamr_secrets_gateway_release(&loaded);
        free(bytes);
        free(other);
        return 0;
    }

    memset(vok_digest, 0x5a, sizeof(vok_digest));
    rd1413_load_path_reset();
    diagnostic[0] = '\0';
    free(bytes);
    bytes = read_bytes(path, &size);
    if (bytes == NULL) {
        fprintf(stderr, "load_for_authority: could not re-read fixture\n");
        free(other);
        return 0;
    }
    wamr_sha256(bytes, (size_t)size, expected);
    result = wamr_secrets_gateway_load_for_authority(
        bytes, size, expected, &loaded, vok_digest, diagnostic,
        sizeof(diagnostic));
    if (result != WAMR_SECRETS_GATEWAY_VALID || loaded.module == NULL ||
        loaded.instance == NULL ||
        !expect_bytes(vok_digest, expected, "load_for_authority vok_digest") ||
        rd1413_load_path_instantiate_calls != 1 ||
        rd1413_load_path_unload_calls != 0) {
        fprintf(stderr, "load_for_authority VALID expected matching vok_digest: %s\n",
                diagnostic);
        wamr_secrets_gateway_release(&loaded);
        free(bytes);
        free(other);
        return 0;
    }
    wamr_secrets_gateway_release(&loaded);
    puts("PASS: load_for_authority requires digest, copies digest-only, zeros vok_digest on refuse");
    free(bytes);
    free(other);
    return 1;
}

static int check_load_failed(void)
{
    uint8_t junk[8] = { 0, 1, 2, 3, 4, 5, 6, 7 };
    char diagnostic[256];
    wamr_secrets_gateway_loaded_t loaded;
    wamr_secrets_gateway_result_t result;

    rd1413_load_path_reset();
    result = load_with_computed_digest(junk, sizeof(junk), &loaded, diagnostic,
                                       sizeof(diagnostic));
    if (result != WAMR_SECRETS_GATEWAY_LOAD_FAILED || loaded.module != NULL ||
        loaded.instance != NULL || !digest_field_zero(&loaded) ||
        rd1413_load_path_instantiate_calls != 0 ||
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
    result = load_with_computed_digest(bytes, size, &loaded, diagnostic,
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
    result = load_with_computed_digest(bytes, size, &loaded, diagnostic,
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

    if (argc != 7) {
        fprintf(stderr,
                "usage: load-path-probe subset full superset duplicate mismatch nonfunction\n");
        return 2;
    }
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
             expect_admitted_expected(argv[1], "load_expected subset") &&
             expect_admitted_expected(argv[2], "load_expected full") &&
             expect_mismatch_swapped(argv[1], argv[2],
                                     "swapped subset digest vs full bytes") &&
             expect_mismatch_swapped(argv[2], argv[1],
                                     "swapped full digest vs subset bytes") &&
             expect_missing_digest(argv[1], "all-zero expected subset") &&
             check_load_for_authority(argv[1], argv[2]);
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

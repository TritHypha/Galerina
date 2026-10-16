#define _POSIX_C_SOURCE 200809L

#include <errno.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "wasm_export.h"
#include "wamr_secrets_gateway_host.h"
#include "wamr_sha256.h"
#include "wamr_vok_verdict.h"

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

    wamr_sha256(bytes, (size_t)size, expected);
    return wamr_secrets_gateway_load_expected(
        bytes, size, expected, loaded, diagnostic, diagnostic_capacity);
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

static void hex32(const uint8_t digest[32], char out[65])
{
    static const char k_hex[] = "0123456789abcdef";
    size_t i;
    for (i = 0; i < 32; i++) {
        out[i * 2u] = k_hex[digest[i] >> 4];
        out[i * 2u + 1u] = k_hex[digest[i] & 0x0fu];
    }
    out[64] = '\0';
}

static int write_text_file(const char *path, const char *text)
{
    FILE *file = fopen(path, "wb");
    size_t n;
    if (file == NULL) {
        return 0;
    }
    n = strlen(text);
    if (fwrite(text, 1, n, file) != n) {
        fclose(file);
        return 0;
    }
    fclose(file);
    return 1;
}

static void fill_closed_envelope(wamr_vok_envelope_t *envelope,
                                 const uint8_t component[32])
{
    static const char k_build[] =
        "git:ad0ed3acc298f4ffe76d01f7c7286b2ea5c964f9";
    memset(envelope, 0, sizeof(*envelope));
    memcpy(envelope->abi, WAMR_VOK_ABI, sizeof(WAMR_VOK_ABI));
    memcpy(envelope->target, WAMR_VOK_TARGET, sizeof(WAMR_VOK_TARGET));
    memcpy(envelope->schema_version, WAMR_VOK_SCHEMA_VERSION,
           sizeof(WAMR_VOK_SCHEMA_VERSION));
    memcpy(envelope->build_point, k_build, sizeof(k_build));
    envelope->epoch = WAMR_VOK_EPOCH;
    memcpy(envelope->component_digest, component, 32);
    wamr_vok_framed_digest(WAMR_VOK_POLICY_DOMAIN,
                           (const uint8_t *)WAMR_VOK_POLICY_ID,
                           strlen(WAMR_VOK_POLICY_ID),
                           envelope->policy_digest);
    wamr_vok_framed_digest("galerina.assurance.capability.v1",
                           (const uint8_t *)"none", 4,
                           envelope->capability_digest);
    wamr_vok_framed_digest("galerina.assurance.deps.v1",
                           (const uint8_t *)"closed", 6,
                           envelope->dependency_digest);
    wamr_vok_framed_digest("galerina.assurance.evidence.v1",
                           (const uint8_t *)"synthetic", 9,
                           envelope->evidence_digest);
}

static int write_envelope_file(const char *path, wamr_vok_envelope_t *envelope)
{
    char payload[2048];
    char body[2300];
    char hex[65];
    uint8_t digest[32];
    int n;

    n = wamr_vok_envelope_canonical(envelope, payload, sizeof(payload));
    if (n < 0) {
        return 0;
    }
    wamr_vok_framed_digest(WAMR_VOK_ENVELOPE_DOMAIN, (const uint8_t *)payload,
                           (size_t)n, digest);
    memcpy(envelope->envelope_digest, digest, 32);
    hex32(digest, hex);
    if ((size_t)snprintf(body, sizeof(body), "%senvelopeDigest=sha256:%s\n",
                         payload, hex) >= sizeof(body)) {
        return 0;
    }
    return write_text_file(path, body);
}

static int write_seal_file(const char *path, wamr_vok_wax_seal_t *seal)
{
    char payload[2048];
    char body[2300];
    char hex[65];
    uint8_t digest[32];
    int n;

    n = wamr_vok_seal_canonical(seal, payload, sizeof(payload));
    if (n < 0) {
        return 0;
    }
    wamr_vok_framed_digest(WAMR_VOK_SEAL_DOMAIN, (const uint8_t *)payload,
                           (size_t)n, digest);
    memcpy(seal->seal_digest, digest, 32);
    hex32(digest, hex);
    if ((size_t)snprintf(body, sizeof(body), "%ssealDigest=sha256:%s\n", payload,
                         hex) >= sizeof(body)) {
        return 0;
    }
    return write_text_file(path, body);
}

static void fill_closed_seal(wamr_vok_wax_seal_t *seal,
                             const uint8_t envelope_digest[32], int authorizing)
{
    memset(seal, 0, sizeof(*seal));
    memcpy(seal->envelope_digest, envelope_digest, 32);
    memcpy(seal->kind, "WAX_SEAL", 9);
    memcpy(seal->terminal_outcome, "CONSUMED", 9);
    memcpy(seal->authentication, WAMR_VOK_AUTHENTICATION,
           sizeof(WAMR_VOK_AUTHENTICATION));
    memcpy(seal->schema_version, WAMR_VOK_SCHEMA_VERSION,
           sizeof(WAMR_VOK_SCHEMA_VERSION));
    seal->authorizing = authorizing;
    seal->replayable = 0;
    wamr_vok_framed_digest("galerina.assurance.profile.v1",
                           (const uint8_t *)WAMR_VOK_POLICY_ID,
                           strlen(WAMR_VOK_POLICY_ID), seal->profile_digest);
}

static int join_path(char *out, size_t cap, const char *dir, const char *name)
{
    return snprintf(out, cap, "%s/%s", dir, name) < (int)cap;
}

static int check_load_for_authority(const char *path, const char *other_path,
                                    const char *verdict_dir,
                                    const char *verifier,
                                    const char *evil_verifier)
{
    uint32_t size = 0;
    uint32_t other_size = 0;
    uint8_t *bytes = read_bytes(path, &size);
    uint8_t *other = read_bytes(other_path, &other_size);
    char diagnostic[256];
    wamr_secrets_gateway_loaded_t loaded;
    wamr_secrets_gateway_result_t result;
    wamr_vok_envelope_t envelope;
    wamr_vok_wax_seal_t seal;
    uint8_t component[32];
    uint8_t other_digest[32];
    char env_ok[512];
    char seal_ok[512];
    char env_other[512];
    char seal_other[512];
    char missing_path[512];
    int bind;

    if (bytes == NULL || other == NULL || verdict_dir == NULL ||
        verifier == NULL || evil_verifier == NULL) {
        fprintf(stderr, "load_for_authority: could not read fixtures\n");
        free(bytes);
        free(other);
        return 0;
    }
    if (!join_path(env_ok, sizeof(env_ok), verdict_dir, "env_ok.txt") ||
        !join_path(seal_ok, sizeof(seal_ok), verdict_dir, "seal_ok.txt") ||
        !join_path(env_other, sizeof(env_other), verdict_dir, "env_other.txt") ||
        !join_path(seal_other, sizeof(seal_other), verdict_dir,
                   "seal_other.txt") ||
        !join_path(missing_path, sizeof(missing_path), verdict_dir,
                   "missing.txt")) {
        free(bytes);
        free(other);
        return 0;
    }

    wamr_sha256(bytes, (size_t)size, component);
    wamr_sha256(other, (size_t)other_size, other_digest);
    fill_closed_envelope(&envelope, component);
    if (!write_envelope_file(env_ok, &envelope)) {
        fprintf(stderr, "load_for_authority: could not write env_ok\n");
        free(bytes);
        free(other);
        return 0;
    }
    fill_closed_seal(&seal, envelope.envelope_digest, 0);
    if (!write_seal_file(seal_ok, &seal)) {
        fprintf(stderr, "load_for_authority: could not write seal_ok\n");
        free(bytes);
        free(other);
        return 0;
    }
    fill_closed_envelope(&envelope, other_digest);
    if (!write_envelope_file(env_other, &envelope)) {
        free(bytes);
        free(other);
        return 0;
    }
    fill_closed_seal(&seal, envelope.envelope_digest, 0);
    if (!write_seal_file(seal_other, &seal)) {
        free(bytes);
        free(other);
        return 0;
    }

    bind = wamr_vok_parse_envelope_file(env_ok, &envelope);
    if (bind != WAMR_VOK_BIND_OK) {
        fprintf(stderr, "parse env_ok failed %d\n", bind);
        free(bytes);
        free(other);
        return 0;
    }
    bind = wamr_vok_parse_seal_file(seal_ok, &seal);
    if (bind != WAMR_VOK_BIND_OK) {
        fprintf(stderr, "parse seal_ok failed %d\n", bind);
        free(bytes);
        free(other);
        return 0;
    }
    bind = wamr_vok_bind_bytes(bytes, (size_t)size, &envelope, &seal);
    if (bind != WAMR_VOK_BIND_REFUSED || envelope.pipe_origin != 0 ||
        seal.pipe_origin != 0) {
        fprintf(stderr, "file-origin genuine verdict must REFUSE bind, got %d\n",
                bind);
        free(bytes);
        free(other);
        return 0;
    }
    bind = wamr_vok_parse_envelope_file(env_other, &envelope);
    if (bind != WAMR_VOK_BIND_OK) {
        fprintf(stderr, "parse env_other failed %d\n", bind);
        free(bytes);
        free(other);
        return 0;
    }
    bind = wamr_vok_parse_seal_file(seal_other, &seal);
    if (bind != WAMR_VOK_BIND_OK) {
        fprintf(stderr, "parse seal_other failed %d\n", bind);
        free(bytes);
        free(other);
        return 0;
    }
    bind = wamr_vok_bind_bytes(bytes, (size_t)size, &envelope, &seal);
    if (bind != WAMR_VOK_BIND_REFUSED) {
        fprintf(stderr, "forged swapped-digest file verdict must REFUSE bind, got %d\n",
                bind);
        free(bytes);
        free(other);
        return 0;
    }

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
        free(other);
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
        free(other);
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
        free(other);
        return 0;
    }

    poison_loaded(&loaded);
    rd1413_load_path_reset();
    result = wamr_secrets_gateway_load_for_authority(
        bytes, size, verifier, &loaded, diagnostic, sizeof(diagnostic));
    if (result != WAMR_SECRETS_GATEWAY_VALID || loaded.module == NULL ||
        loaded.instance == NULL ||
        rd1413_load_path_instantiate_calls != 1 ||
        rd1413_load_path_unload_calls != 0) {
        fprintf(stderr, "load_for_authority VALID pinned child failed: %s\n",
                diagnostic);
        wamr_secrets_gateway_release(&loaded);
        free(bytes);
        free(other);
        return 0;
    }
    wamr_secrets_gateway_release(&loaded);
    puts("PASS: load_for_authority spawns hash-pinned verifier, refuses file-origin/forged/substituted");
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

    if (argc != 10) {
        fprintf(stderr,
                "usage: load-path-probe subset full superset duplicate mismatch nonfunction verdict_dir verifier evil_verifier\n");
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
             check_load_for_authority(argv[1], argv[2], argv[7], argv[8],
                                      argv[9]);
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

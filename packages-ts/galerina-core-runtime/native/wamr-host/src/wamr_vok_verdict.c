#define _GNU_SOURCE

#include "wamr_vok_verdict.h"
#include "wamr_sha256.h"

#include <errno.h>
#include <fcntl.h>
#include <poll.h>
#include <pthread.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <sys/wait.h>
#include <time.h>
#include <unistd.h>
#ifdef __linux__
#include <linux/close_range.h>
#endif

#define WAMR_VOK_MAX_FILE 4096
#define WAMR_VOK_MAX_LINE 256
#define WAMR_VOK_MAX_PAYLOAD 2048
#define WAMR_VOK_MAX_STDOUT 8192
#define WAMR_VOK_MAX_STDERR 4096
#define WAMR_VOK_MAX_VERIFIER_BYTES (32u * 1024u * 1024u)
#define WAMR_VOK_SPAWN_TIMEOUT_MS 5000
#define WAMR_VOK_FRAMED_MAGIC "GALERINA_VOK_VERDICT_V1\n"

static int digest_is_zero(const uint8_t digest[32])
{
    uint8_t acc = 0;
    size_t i;
    for (i = 0; i < 32; i++) {
        acc |= digest[i];
    }
    return acc == 0;
}

static int digest_eq_ct(const uint8_t left[32], const uint8_t right[32])
{
    uint8_t acc = 0;
    size_t i;
    for (i = 0; i < 32; i++) {
        acc |= (uint8_t)(left[i] ^ right[i]);
    }
    return acc == 0;
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

static int hex_nibble(char ch)
{
    if (ch >= '0' && ch <= '9') {
        return ch - '0';
    }
    if (ch >= 'a' && ch <= 'f') {
        return ch - 'a' + 10;
    }
    return -1;
}

static int parse_sha256_prefaced(const char *value, uint8_t out[32])
{
    size_t i;
    if (value == NULL || strncmp(value, "sha256:", 7) != 0 ||
        strlen(value) != 71) {
        return 0;
    }
    for (i = 0; i < 32; i++) {
        int hi = hex_nibble(value[7 + i * 2u]);
        int lo = hex_nibble(value[8 + i * 2u]);
        if (hi < 0 || lo < 0) {
            return 0;
        }
        out[i] = (uint8_t)((hi << 4) | lo);
    }
    return 1;
}

static int parse_hex32(const char *hex, uint8_t out[32])
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

static int valid_build_point(const char *value)
{
    size_t i;
    if (value == NULL || strncmp(value, "git:", 4) != 0 || strlen(value) != 44) {
        return 0;
    }
    for (i = 4; i < 44; i++) {
        char ch = value[i];
        int hex = (ch >= '0' && ch <= '9') || (ch >= 'a' && ch <= 'f');
        if (!hex) {
            return 0;
        }
    }
    return 1;
}

static int parse_canonical_ull(const char *value, unsigned long long *out)
{
    const char *p;
    char *term = NULL;
    unsigned long long acc;
    char canonical[32];
    int n;
    int saved;

    if (value == NULL || value[0] == '\0' || out == NULL) {
        return 0;
    }
    if (value[0] == '+' || value[0] == '-' || value[0] == ' ' ||
        value[0] == '\t') {
        return 0;
    }
    if (value[0] == '0' && value[1] != '\0') {
        return 0;
    }
    for (p = value; *p != '\0'; p++) {
        if (*p < '0' || *p > '9') {
            return 0;
        }
    }
    saved = errno;
    errno = 0;
    acc = strtoull(value, &term, 10);
    if (errno == ERANGE || term == value || term == NULL || *term != '\0') {
        errno = saved;
        return 0;
    }
    errno = saved;
    n = snprintf(canonical, sizeof(canonical), "%llu", acc);
    if (n <= 0 || (size_t)n >= sizeof(canonical) ||
        strcmp(canonical, value) != 0) {
        return 0;
    }
    *out = acc;
    return 1;
}

static void format_sha256_prefaced(const uint8_t digest[32], char out[72])
{
    memcpy(out, "sha256:", 7);
    hex32(digest, out + 7);
}

static int canonical_line_ok(const char *original, const char *key,
                             const char *canonical_value)
{
    char rebuilt[WAMR_VOK_MAX_LINE];
    int n;

    if (original == NULL || key == NULL || canonical_value == NULL) {
        return 0;
    }
    n = snprintf(rebuilt, sizeof(rebuilt), "%s=%s", key, canonical_value);
    if (n <= 0 || (size_t)n >= sizeof(rebuilt)) {
        return 0;
    }
    return strcmp(original, rebuilt) == 0;
}

void wamr_vok_framed_digest(const char *domain, const uint8_t *payload,
                            size_t payload_len, uint8_t out[32])
{
    char prefix[160];
    uint8_t frame[WAMR_VOK_MAX_PAYLOAD + 160];
    size_t domain_len;
    int prefix_len;

    memset(out, 0, 32);
    if (domain == NULL || (payload == NULL && payload_len != 0) ||
        payload_len > WAMR_VOK_MAX_PAYLOAD) {
        return;
    }
    domain_len = strlen(domain);
    prefix_len = snprintf(prefix, sizeof(prefix), "%zu:%s%zu:", domain_len,
                          domain, payload_len);
    if (prefix_len <= 0 || (size_t)prefix_len >= sizeof(prefix) ||
        (size_t)prefix_len + payload_len > sizeof(frame)) {
        return;
    }
    memcpy(frame, prefix, (size_t)prefix_len);
    if (payload_len > 0) {
        memcpy(frame + prefix_len, payload, payload_len);
    }
    wamr_sha256(frame, (size_t)prefix_len + payload_len, out);
}

int wamr_vok_envelope_canonical(const wamr_vok_envelope_t *envelope, char *out,
                                size_t capacity)
{
    char component[72];
    char capability[72];
    char dependency[72];
    char evidence[72];
    char policy[72];
    char env_hex[65];
    int n;

    if (envelope == NULL || out == NULL || capacity == 0) {
        return -1;
    }
    hex32(envelope->component_digest, env_hex);
    memcpy(component, "sha256:", 7);
    memcpy(component + 7, env_hex, 65);
    hex32(envelope->capability_digest, env_hex);
    memcpy(capability, "sha256:", 7);
    memcpy(capability + 7, env_hex, 65);
    hex32(envelope->dependency_digest, env_hex);
    memcpy(dependency, "sha256:", 7);
    memcpy(dependency + 7, env_hex, 65);
    hex32(envelope->evidence_digest, env_hex);
    memcpy(evidence, "sha256:", 7);
    memcpy(evidence + 7, env_hex, 65);
    hex32(envelope->policy_digest, env_hex);
    memcpy(policy, "sha256:", 7);
    memcpy(policy + 7, env_hex, 65);
    n = snprintf(
        out, capacity,
        "abi=%s\nbuildPoint=%s\ncapabilityDigest=%s\ncomponentDigest=%s\n"
        "dependencyClosureDigest=%s\nepoch=%llu\nevidenceSetDigest=%s\n"
        "policyDigest=%s\nschemaVersion=%s\ntarget=%s\n",
        envelope->abi, envelope->build_point, capability, component,
        dependency, (unsigned long long)envelope->epoch, evidence, policy,
        envelope->schema_version, envelope->target);
    if (n <= 0 || (size_t)n >= capacity) {
        return -1;
    }
    return n;
}

int wamr_vok_seal_canonical(const wamr_vok_wax_seal_t *seal, char *out,
                            size_t capacity)
{
    char envelope[72];
    char profile[72];
    char hex[65];
    int n;

    if (seal == NULL || out == NULL || capacity == 0) {
        return -1;
    }
    hex32(seal->envelope_digest, hex);
    memcpy(envelope, "sha256:", 7);
    memcpy(envelope + 7, hex, 65);
    hex32(seal->profile_digest, hex);
    memcpy(profile, "sha256:", 7);
    memcpy(profile + 7, hex, 65);
    n = snprintf(out, capacity,
                 "authentication=%s\nauthorizing=%s\nenvelopeDigest=%s\n"
                 "kind=%s\nprofileDigest=%s\nreplayable=%s\nschemaVersion=%s\n"
                 "terminalOutcome=%s\n",
                 seal->authentication, seal->authorizing ? "true" : "false",
                 envelope, seal->kind, profile,
                 seal->replayable ? "true" : "false", seal->schema_version,
                 seal->terminal_outcome);
    if (n <= 0 || (size_t)n >= capacity) {
        return -1;
    }
    return n;
}

static int read_file(const char *path, char *out, size_t capacity, size_t *len)
{
    FILE *file;
    long length;

    if (path == NULL || out == NULL || capacity == 0 || len == NULL) {
        return 0;
    }
    file = fopen(path, "rb");
    if (file == NULL) {
        return 0;
    }
    if (fseek(file, 0, SEEK_END) != 0 || (length = ftell(file)) <= 0 ||
        (unsigned long)length >= capacity || fseek(file, 0, SEEK_SET) != 0) {
        fclose(file);
        return 0;
    }
    if (fread(out, 1, (size_t)length, file) != (size_t)length) {
        fclose(file);
        return 0;
    }
    fclose(file);
    out[length] = '\0';
    *len = (size_t)length;
    return 1;
}

static int take_line(const char **cursor, const char *end, char *line,
                     size_t line_cap)
{
    const char *start = *cursor;
    const char *nl;
    size_t n;

    if (start >= end) {
        return 0;
    }
    nl = memchr(start, '\n', (size_t)(end - start));
    if (nl == NULL) {
        return 0;
    }
    n = (size_t)(nl - start);
    if (n == 0 || n >= line_cap || memchr(start, '\r', n) != NULL) {
        return 0;
    }
    memcpy(line, start, n);
    line[n] = '\0';
    *cursor = nl + 1;
    return 1;
}

static int split_kv(char *line, const char **key, const char **value)
{
    char *eq = strchr(line, '=');
    if (eq == NULL || eq == line || eq[1] == '\0') {
        return 0;
    }
    *eq = '\0';
    *key = line;
    *value = eq + 1;
    return 1;
}

static int parse_envelope_text(const char *body, size_t len,
                               wamr_vok_envelope_t *out)
{
    char line[WAMR_VOK_MAX_LINE];
    const char *cursor;
    const char *end;
    unsigned seen = 0;

    if (out == NULL) {
        return WAMR_VOK_BIND_INVALID;
    }
    memset(out, 0, sizeof(*out));
    if (body == NULL || len == 0) {
        return WAMR_VOK_BIND_MISSING;
    }
    cursor = body;
    end = body + len;
    while (cursor < end) {
        const char *key;
        const char *value;
        char original[WAMR_VOK_MAX_LINE];
        char digest_text[72];
        char epoch_text[32];
        unsigned long long epoch;
        int epoch_n;
        if (!take_line(&cursor, end, line, sizeof(line))) {
            return WAMR_VOK_BIND_REFUSED;
        }
        memcpy(original, line, strlen(line) + 1);
        if (!split_kv(line, &key, &value)) {
            return WAMR_VOK_BIND_REFUSED;
        }
        if (strcmp(key, "abi") == 0) {
            if ((seen & 1u) != 0 || strlen(value) >= sizeof(out->abi)) {
                return WAMR_VOK_BIND_REFUSED;
            }
            memcpy(out->abi, value, strlen(value) + 1);
            if (!canonical_line_ok(original, "abi", out->abi)) {
                return WAMR_VOK_BIND_REFUSED;
            }
            seen |= 1u;
        } else if (strcmp(key, "buildPoint") == 0) {
            if ((seen & 2u) != 0 || strlen(value) >= sizeof(out->build_point) ||
                !valid_build_point(value)) {
                return WAMR_VOK_BIND_REFUSED;
            }
            memcpy(out->build_point, value, strlen(value) + 1);
            if (!canonical_line_ok(original, "buildPoint", out->build_point)) {
                return WAMR_VOK_BIND_REFUSED;
            }
            seen |= 2u;
        } else if (strcmp(key, "capabilityDigest") == 0) {
            if ((seen & 4u) != 0 ||
                !parse_sha256_prefaced(value, out->capability_digest)) {
                return WAMR_VOK_BIND_REFUSED;
            }
            format_sha256_prefaced(out->capability_digest, digest_text);
            if (!canonical_line_ok(original, "capabilityDigest", digest_text)) {
                return WAMR_VOK_BIND_REFUSED;
            }
            seen |= 4u;
        } else if (strcmp(key, "componentDigest") == 0) {
            if ((seen & 8u) != 0 ||
                !parse_sha256_prefaced(value, out->component_digest)) {
                return WAMR_VOK_BIND_REFUSED;
            }
            format_sha256_prefaced(out->component_digest, digest_text);
            if (!canonical_line_ok(original, "componentDigest", digest_text)) {
                return WAMR_VOK_BIND_REFUSED;
            }
            seen |= 8u;
        } else if (strcmp(key, "dependencyClosureDigest") == 0) {
            if ((seen & 16u) != 0 ||
                !parse_sha256_prefaced(value, out->dependency_digest)) {
                return WAMR_VOK_BIND_REFUSED;
            }
            format_sha256_prefaced(out->dependency_digest, digest_text);
            if (!canonical_line_ok(original, "dependencyClosureDigest",
                                   digest_text)) {
                return WAMR_VOK_BIND_REFUSED;
            }
            seen |= 16u;
        } else if (strcmp(key, "epoch") == 0) {
            if ((seen & 32u) != 0 || !parse_canonical_ull(value, &epoch)) {
                return WAMR_VOK_BIND_REFUSED;
            }
            epoch_n = snprintf(epoch_text, sizeof(epoch_text), "%llu", epoch);
            if (epoch_n <= 0 || (size_t)epoch_n >= sizeof(epoch_text) ||
                !canonical_line_ok(original, "epoch", epoch_text)) {
                return WAMR_VOK_BIND_REFUSED;
            }
            out->epoch = epoch;
            seen |= 32u;
        } else if (strcmp(key, "evidenceSetDigest") == 0) {
            if ((seen & 64u) != 0 ||
                !parse_sha256_prefaced(value, out->evidence_digest)) {
                return WAMR_VOK_BIND_REFUSED;
            }
            format_sha256_prefaced(out->evidence_digest, digest_text);
            if (!canonical_line_ok(original, "evidenceSetDigest", digest_text)) {
                return WAMR_VOK_BIND_REFUSED;
            }
            seen |= 64u;
        } else if (strcmp(key, "policyDigest") == 0) {
            if ((seen & 128u) != 0 ||
                !parse_sha256_prefaced(value, out->policy_digest)) {
                return WAMR_VOK_BIND_REFUSED;
            }
            format_sha256_prefaced(out->policy_digest, digest_text);
            if (!canonical_line_ok(original, "policyDigest", digest_text)) {
                return WAMR_VOK_BIND_REFUSED;
            }
            seen |= 128u;
        } else if (strcmp(key, "schemaVersion") == 0) {
            if ((seen & 256u) != 0 ||
                strlen(value) >= sizeof(out->schema_version)) {
                return WAMR_VOK_BIND_REFUSED;
            }
            memcpy(out->schema_version, value, strlen(value) + 1);
            if (!canonical_line_ok(original, "schemaVersion",
                                   out->schema_version)) {
                return WAMR_VOK_BIND_REFUSED;
            }
            seen |= 256u;
        } else if (strcmp(key, "target") == 0) {
            if ((seen & 512u) != 0 || strlen(value) >= sizeof(out->target)) {
                return WAMR_VOK_BIND_REFUSED;
            }
            memcpy(out->target, value, strlen(value) + 1);
            if (!canonical_line_ok(original, "target", out->target)) {
                return WAMR_VOK_BIND_REFUSED;
            }
            seen |= 512u;
        } else if (strcmp(key, "envelopeDigest") == 0) {
            if ((seen & 1024u) != 0 ||
                !parse_sha256_prefaced(value, out->envelope_digest)) {
                return WAMR_VOK_BIND_REFUSED;
            }
            format_sha256_prefaced(out->envelope_digest, digest_text);
            if (!canonical_line_ok(original, "envelopeDigest", digest_text)) {
                return WAMR_VOK_BIND_REFUSED;
            }
            seen |= 1024u;
        } else {
            return WAMR_VOK_BIND_REFUSED;
        }
    }
    if (seen != 2047u) {
        return WAMR_VOK_BIND_REFUSED;
    }
    return WAMR_VOK_BIND_OK;
}

static int parse_seal_text(const char *body, size_t len,
                           wamr_vok_wax_seal_t *out)
{
    char line[WAMR_VOK_MAX_LINE];
    const char *cursor;
    const char *end;
    unsigned seen = 0;

    if (out == NULL) {
        return WAMR_VOK_BIND_INVALID;
    }
    memset(out, 0, sizeof(*out));
    if (body == NULL || len == 0) {
        return WAMR_VOK_BIND_MISSING;
    }
    cursor = body;
    end = body + len;
    while (cursor < end) {
        const char *key;
        const char *value;
        char original[WAMR_VOK_MAX_LINE];
        char digest_text[72];
        if (!take_line(&cursor, end, line, sizeof(line))) {
            return WAMR_VOK_BIND_REFUSED;
        }
        memcpy(original, line, strlen(line) + 1);
        if (!split_kv(line, &key, &value)) {
            return WAMR_VOK_BIND_REFUSED;
        }
        if (strcmp(key, "authentication") == 0) {
            if ((seen & 1u) != 0 ||
                strlen(value) >= sizeof(out->authentication)) {
                return WAMR_VOK_BIND_REFUSED;
            }
            memcpy(out->authentication, value, strlen(value) + 1);
            if (!canonical_line_ok(original, "authentication",
                                   out->authentication)) {
                return WAMR_VOK_BIND_REFUSED;
            }
            seen |= 1u;
        } else if (strcmp(key, "authorizing") == 0) {
            if ((seen & 2u) != 0) {
                return WAMR_VOK_BIND_REFUSED;
            }
            if (strcmp(value, "false") == 0) {
                out->authorizing = 0;
            } else if (strcmp(value, "true") == 0) {
                out->authorizing = 1;
            } else {
                return WAMR_VOK_BIND_REFUSED;
            }
            if (!canonical_line_ok(original, "authorizing",
                                   out->authorizing ? "true" : "false")) {
                return WAMR_VOK_BIND_REFUSED;
            }
            seen |= 2u;
        } else if (strcmp(key, "envelopeDigest") == 0) {
            if ((seen & 4u) != 0 ||
                !parse_sha256_prefaced(value, out->envelope_digest)) {
                return WAMR_VOK_BIND_REFUSED;
            }
            format_sha256_prefaced(out->envelope_digest, digest_text);
            if (!canonical_line_ok(original, "envelopeDigest", digest_text)) {
                return WAMR_VOK_BIND_REFUSED;
            }
            seen |= 4u;
        } else if (strcmp(key, "kind") == 0) {
            if ((seen & 8u) != 0 || strlen(value) >= sizeof(out->kind)) {
                return WAMR_VOK_BIND_REFUSED;
            }
            memcpy(out->kind, value, strlen(value) + 1);
            if (!canonical_line_ok(original, "kind", out->kind)) {
                return WAMR_VOK_BIND_REFUSED;
            }
            seen |= 8u;
        } else if (strcmp(key, "profileDigest") == 0) {
            if ((seen & 16u) != 0 ||
                !parse_sha256_prefaced(value, out->profile_digest)) {
                return WAMR_VOK_BIND_REFUSED;
            }
            format_sha256_prefaced(out->profile_digest, digest_text);
            if (!canonical_line_ok(original, "profileDigest", digest_text)) {
                return WAMR_VOK_BIND_REFUSED;
            }
            seen |= 16u;
        } else if (strcmp(key, "replayable") == 0) {
            if ((seen & 32u) != 0) {
                return WAMR_VOK_BIND_REFUSED;
            }
            if (strcmp(value, "false") == 0) {
                out->replayable = 0;
            } else if (strcmp(value, "true") == 0) {
                out->replayable = 1;
            } else {
                return WAMR_VOK_BIND_REFUSED;
            }
            if (!canonical_line_ok(original, "replayable",
                                   out->replayable ? "true" : "false")) {
                return WAMR_VOK_BIND_REFUSED;
            }
            seen |= 32u;
        } else if (strcmp(key, "schemaVersion") == 0) {
            if ((seen & 64u) != 0 ||
                strlen(value) >= sizeof(out->schema_version)) {
                return WAMR_VOK_BIND_REFUSED;
            }
            memcpy(out->schema_version, value, strlen(value) + 1);
            if (!canonical_line_ok(original, "schemaVersion",
                                   out->schema_version)) {
                return WAMR_VOK_BIND_REFUSED;
            }
            seen |= 64u;
        } else if (strcmp(key, "terminalOutcome") == 0) {
            if ((seen & 128u) != 0 ||
                strlen(value) >= sizeof(out->terminal_outcome)) {
                return WAMR_VOK_BIND_REFUSED;
            }
            memcpy(out->terminal_outcome, value, strlen(value) + 1);
            if (!canonical_line_ok(original, "terminalOutcome",
                                   out->terminal_outcome)) {
                return WAMR_VOK_BIND_REFUSED;
            }
            seen |= 128u;
        } else if (strcmp(key, "sealDigest") == 0) {
            if ((seen & 256u) != 0 ||
                !parse_sha256_prefaced(value, out->seal_digest)) {
                return WAMR_VOK_BIND_REFUSED;
            }
            format_sha256_prefaced(out->seal_digest, digest_text);
            if (!canonical_line_ok(original, "sealDigest", digest_text)) {
                return WAMR_VOK_BIND_REFUSED;
            }
            seen |= 256u;
        } else {
            return WAMR_VOK_BIND_REFUSED;
        }
    }
    if (seen != 511u) {
        return WAMR_VOK_BIND_REFUSED;
    }
    return WAMR_VOK_BIND_OK;
}

int wamr_vok_parse_envelope_file(const char *path, wamr_vok_envelope_t *out)
{
    char body[WAMR_VOK_MAX_FILE];
    size_t len = 0;

    if (out == NULL) {
        return WAMR_VOK_BIND_INVALID;
    }
    memset(out, 0, sizeof(*out));
    if (!read_file(path, body, sizeof(body), &len)) {
        return WAMR_VOK_BIND_MISSING;
    }
    return parse_envelope_text(body, len, out);
}

int wamr_vok_parse_seal_file(const char *path, wamr_vok_wax_seal_t *out)
{
    char body[WAMR_VOK_MAX_FILE];
    size_t len = 0;

    if (out == NULL) {
        return WAMR_VOK_BIND_INVALID;
    }
    memset(out, 0, sizeof(*out));
    if (!read_file(path, body, sizeof(body), &len)) {
        return WAMR_VOK_BIND_MISSING;
    }
    return parse_seal_text(body, len, out);
}

static int expected_closed_digest(const char *domain, const char *payload,
                                  const uint8_t got[32])
{
    uint8_t want[32];
    wamr_vok_framed_digest(domain, (const uint8_t *)payload, strlen(payload),
                           want);
    return digest_eq_ct(want, got);
}

static int wamr_vok_bind_bytes(const uint8_t *bytes, size_t size,
                               const wamr_vok_envelope_t *envelope,
                               const wamr_vok_wax_seal_t *seal)
{
    uint8_t computed[32];
    uint8_t recomputed[32];
    char payload[WAMR_VOK_MAX_PAYLOAD];
    int n;

    if (bytes == NULL || size == 0 || envelope == NULL || seal == NULL) {
        return WAMR_VOK_BIND_INVALID;
    }
    if (digest_is_zero(envelope->component_digest) ||
        digest_is_zero(envelope->envelope_digest) ||
        digest_is_zero(seal->envelope_digest) ||
        digest_is_zero(seal->seal_digest)) {
        return WAMR_VOK_BIND_MISSING;
    }
    if (strcmp(envelope->abi, WAMR_VOK_ABI) != 0 ||
        strcmp(envelope->target, WAMR_VOK_TARGET) != 0 ||
        envelope->epoch != WAMR_VOK_EPOCH ||
        strcmp(envelope->schema_version, WAMR_VOK_SCHEMA_VERSION) != 0 ||
        !valid_build_point(envelope->build_point)) {
        return WAMR_VOK_BIND_REFUSED;
    }
    if (seal->authorizing || seal->replayable ||
        strcmp(seal->kind, "WAX_SEAL") != 0 ||
        strcmp(seal->authentication, WAMR_VOK_AUTHENTICATION) != 0 ||
        strcmp(seal->schema_version, WAMR_VOK_SCHEMA_VERSION) != 0) {
        return WAMR_VOK_BIND_REFUSED;
    }
    if (!expected_closed_digest(WAMR_VOK_POLICY_DOMAIN, WAMR_VOK_POLICY_ID,
                                envelope->policy_digest) ||
        !expected_closed_digest(WAMR_VOK_CAPABILITY_DOMAIN,
                                WAMR_VOK_CAPABILITY_PAYLOAD,
                                envelope->capability_digest) ||
        !expected_closed_digest(WAMR_VOK_DEPS_DOMAIN, WAMR_VOK_DEPS_PAYLOAD,
                                envelope->dependency_digest) ||
        !expected_closed_digest(WAMR_VOK_EVIDENCE_DOMAIN,
                                WAMR_VOK_EVIDENCE_PAYLOAD,
                                envelope->evidence_digest) ||
        !expected_closed_digest(WAMR_VOK_PROFILE_DOMAIN, WAMR_VOK_POLICY_ID,
                                seal->profile_digest)) {
        return WAMR_VOK_BIND_REFUSED;
    }
    wamr_sha256(bytes, size, computed);
    if (digest_is_zero(computed)) {
        return WAMR_VOK_BIND_MISSING;
    }
    if (!digest_eq_ct(computed, envelope->component_digest)) {
        return WAMR_VOK_BIND_MISMATCH;
    }
    n = wamr_vok_envelope_canonical(envelope, payload, sizeof(payload));
    if (n < 0) {
        return WAMR_VOK_BIND_REFUSED;
    }
    wamr_vok_framed_digest(WAMR_VOK_ENVELOPE_DOMAIN, (const uint8_t *)payload,
                           (size_t)n, recomputed);
    if (!digest_eq_ct(recomputed, envelope->envelope_digest) ||
        !digest_eq_ct(seal->envelope_digest, envelope->envelope_digest)) {
        return WAMR_VOK_BIND_REFUSED;
    }
    n = wamr_vok_seal_canonical(seal, payload, sizeof(payload));
    if (n < 0) {
        return WAMR_VOK_BIND_REFUSED;
    }
    wamr_vok_framed_digest(WAMR_VOK_SEAL_DOMAIN, (const uint8_t *)payload,
                           (size_t)n, recomputed);
    if (!digest_eq_ct(recomputed, seal->seal_digest)) {
        return WAMR_VOK_BIND_REFUSED;
    }
    return WAMR_VOK_BIND_OK;
}

static int starts_with(const char *data, size_t len, const char *prefix)
{
    size_t n = strlen(prefix);
    return len >= n && memcmp(data, prefix, n) == 0;
}

static int parse_len_line(const char **cursor, const char *end,
                          const char *label, size_t *out_len)
{
    const char *line_end;
    size_t label_len = strlen(label);
    unsigned long long value = 0;
    size_t n;

    if ((size_t)(end - *cursor) < label_len ||
        memcmp(*cursor, label, label_len) != 0) {
        return 0;
    }
    *cursor += label_len;
    line_end = memchr(*cursor, '\n', (size_t)(end - *cursor));
    if (line_end == NULL || line_end == *cursor) {
        return 0;
    }
    n = (size_t)(line_end - *cursor);
    if (n >= 16) {
        return 0;
    }
    {
        char tmp[16];
        memcpy(tmp, *cursor, n);
        tmp[n] = '\0';
        if (!parse_canonical_ull(tmp, &value) || value == 0 ||
            value > WAMR_VOK_MAX_FILE) {
            return 0;
        }
    }
    *out_len = (size_t)value;
    *cursor = line_end + 1;
    return 1;
}

static int parse_framed_verdict(const char *data, size_t len,
                                wamr_vok_envelope_t *envelope,
                                wamr_vok_wax_seal_t *seal)
{
    const char *cursor;
    const char *end;
    size_t env_len = 0;
    size_t seal_len = 0;
    int rc;

    if (!starts_with(data, len, WAMR_VOK_FRAMED_MAGIC)) {
        return WAMR_VOK_BIND_REFUSED;
    }
    cursor = data + strlen(WAMR_VOK_FRAMED_MAGIC);
    end = data + len;
    if (!parse_len_line(&cursor, end, "ENVELOPE ", &env_len) ||
        (size_t)(end - cursor) < env_len) {
        return WAMR_VOK_BIND_REFUSED;
    }
    rc = parse_envelope_text(cursor, env_len, envelope);
    if (rc != WAMR_VOK_BIND_OK) {
        return rc;
    }
    cursor += env_len;
    if (!parse_len_line(&cursor, end, "SEAL ", &seal_len) ||
        (size_t)(end - cursor) < seal_len) {
        return WAMR_VOK_BIND_REFUSED;
    }
    rc = parse_seal_text(cursor, seal_len, seal);
    if (rc != WAMR_VOK_BIND_OK) {
        return rc;
    }
    cursor += seal_len;
    if (cursor != end) {
        return WAMR_VOK_BIND_REFUSED;
    }
    return WAMR_VOK_BIND_OK;
}

static int pinned_verifier_digest(uint8_t out[32])
{
#ifdef WAMR_VOK_VERIFIER_SHA256_HEX
    return parse_hex32(WAMR_VOK_VERIFIER_SHA256_HEX, out);
#else
    (void)out;
    return 0;
#endif
}

static void close_fd(int *fd)
{
    if (fd != NULL && *fd >= 0) {
        (void)close(*fd);
        *fd = -1;
    }
}

static uint8_t *read_whole_fd(int fd, size_t *out_size)
{
    struct stat st;
    uint8_t *buf;
    size_t size;
    ssize_t got;
    size_t off = 0;

    if (fstat(fd, &st) != 0 || !S_ISREG(st.st_mode) || st.st_size <= 0 ||
        (unsigned long long)st.st_size > WAMR_VOK_MAX_VERIFIER_BYTES) {
        return NULL;
    }
    size = (size_t)st.st_size;
    if (lseek(fd, 0, SEEK_SET) < 0) {
        return NULL;
    }
    buf = (uint8_t *)malloc(size);
    if (buf == NULL) {
        return NULL;
    }
    while (off < size) {
        got = read(fd, buf + off, size - off);
        if (got <= 0) {
            free(buf);
            return NULL;
        }
        off += (size_t)got;
    }
    *out_size = size;
    return buf;
}

static int sealed_memfd_from_bytes(const uint8_t *buf, size_t size)
{
    int mfd;
    size_t off = 0;

    mfd = memfd_create("vok-verifier", MFD_CLOEXEC | MFD_ALLOW_SEALING);
    if (mfd < 0) {
        return -1;
    }
    while (off < size) {
        ssize_t n = write(mfd, buf + off, size - off);
        if (n <= 0) {
            close(mfd);
            return -1;
        }
        off += (size_t)n;
    }
    if (lseek(mfd, 0, SEEK_SET) < 0) {
        close(mfd);
        return -1;
    }
    if (fcntl(mfd, F_ADD_SEALS,
              F_SEAL_WRITE | F_SEAL_GROW | F_SEAL_SHRINK | F_SEAL_SEAL) != 0) {
        close(mfd);
        return -1;
    }
    {
        int seals = fcntl(mfd, F_GET_SEALS);
        unsigned want = (unsigned)(F_SEAL_WRITE | F_SEAL_GROW | F_SEAL_SHRINK |
                                   F_SEAL_SEAL);
        if (seals < 0 || ((unsigned)seals & want) != want) {
            close(mfd);
            return -1;
        }
    }
    return mfd;
}

static int remaining_ms(struct timespec start)
{
    struct timespec now;
    long elapsed;
    if (clock_gettime(CLOCK_MONOTONIC, &now) != 0) {
        return 0;
    }
    elapsed = (now.tv_sec - start.tv_sec) * 1000L +
              (now.tv_nsec - start.tv_nsec) / 1000000L;
    if (elapsed >= WAMR_VOK_SPAWN_TIMEOUT_MS) {
        return 0;
    }
    return (int)(WAMR_VOK_SPAWN_TIMEOUT_MS - elapsed);
}

static int set_nonblock(int fd)
{
    int flags = fcntl(fd, F_GETFL);
    if (flags < 0) {
        return 0;
    }
    return fcntl(fd, F_SETFL, flags | O_NONBLOCK) == 0;
}

static int block_sigpipe(sigset_t *old_mask, int *preserve_pending)
{
    sigset_t block;
    sigset_t pending_before;

    if (old_mask == NULL || preserve_pending == NULL) {
        return 0;
    }
    *preserve_pending = 0;
    if (sigemptyset(&block) != 0 || sigaddset(&block, SIGPIPE) != 0) {
        return 0;
    }
    if (sigpending(&pending_before) != 0) {
        return 0;
    }
    if (pthread_sigmask(SIG_BLOCK, &block, old_mask) != 0) {
        return 0;
    }
    if (sigismember(&pending_before, SIGPIPE) == 1 &&
        sigismember(old_mask, SIGPIPE) == 1) {
        *preserve_pending = 1;
    }
    return 1;
}

static void drain_and_restore_sigpipe(const sigset_t *old_mask,
                                      int preserve_pending)
{
    sigset_t pipe_only;
    sigset_t pending;
    struct timespec zero;

    zero.tv_sec = 0;
    zero.tv_nsec = 0;
    if (!preserve_pending && sigemptyset(&pipe_only) == 0 &&
        sigaddset(&pipe_only, SIGPIPE) == 0 && sigpending(&pending) == 0 &&
        sigismember(&pending, SIGPIPE) == 1) {
        (void)sigtimedwait(&pipe_only, NULL, &zero);
    }
    if (old_mask != NULL) {
        (void)pthread_sigmask(SIG_SETMASK, old_mask, NULL);
    }
}

/* WNOHANG reap against remaining_ms(start). On expiry SIGKILL, then a
 * 1 s WNOHANG cap. Returns 1 only if the child exited before the spawn
 * deadline without being killed. */
static int reap_child_deadline(pid_t child, int *status, struct timespec start)
{
    struct timespec kill_start;
    int killed = 0;

    if (child <= 0 || status == NULL) {
        return 0;
    }
    memset(&kill_start, 0, sizeof(kill_start));
    for (;;) {
        pid_t r = waitpid(child, status, WNOHANG);
        if (r == child) {
            if (killed || remaining_ms(start) <= 0) {
                return 0;
            }
            return 1;
        }
        if (r < 0) {
            if (errno == EINTR) {
                continue;
            }
            return 0;
        }
        if (r != 0) {
            return 0;
        }
        if (!killed) {
            if (remaining_ms(start) <= 0) {
                (void)kill(child, SIGKILL);
                killed = 1;
                if (clock_gettime(CLOCK_MONOTONIC, &kill_start) != 0) {
                    (void)waitpid(child, status, WNOHANG);
                    return 0;
                }
            }
        } else {
            struct timespec now;
            long elapsed;
            if (clock_gettime(CLOCK_MONOTONIC, &now) != 0) {
                return 0;
            }
            elapsed = (now.tv_sec - kill_start.tv_sec) * 1000L +
                      (now.tv_nsec - kill_start.tv_nsec) / 1000000L;
            if (elapsed >= 1000L) {
                return 0;
            }
        }
        {
            int slice;
            if (killed) {
                slice = 20;
            } else {
                slice = remaining_ms(start);
                if (slice > 50) {
                    slice = 50;
                }
                if (slice < 1) {
                    slice = 1;
                }
            }
            if (poll(NULL, 0, slice) < 0 && errno != EINTR) {
                (void)kill(child, SIGKILL);
                (void)waitpid(child, status, WNOHANG);
                return 0;
            }
        }
    }
}

static void close_extra_child_fds(int keep_fd)
{
    int fd;
    long open_max;

    if (keep_fd < 3) {
        _exit(127);
    }
    if (keep_fd > 3) {
        (void)close_range(3u, (unsigned int)keep_fd - 1u, 0u);
    }
    (void)close_range((unsigned int)keep_fd + 1u, ~0U, 0u);

    open_max = sysconf(_SC_OPEN_MAX);
    if (open_max <= 3 || open_max > 1048576L) {
        open_max = 1024L;
    }
    for (fd = 3; fd < (int)open_max; fd++) {
        if (fd != keep_fd) {
            (void)close(fd);
        }
    }
}

int wamr_vok_spawn_and_bind(const char *verifier_path, const uint8_t *bytes,
                            size_t size, wamr_vok_envelope_t *envelope,
                            wamr_vok_wax_seal_t *seal)
{
    uint8_t pin[32];
    uint8_t hashed[32];
    uint8_t *verifier_bytes = NULL;
    size_t verifier_size = 0;
    int bin_fd = -1;
    int mem_fd = -1;
    int in_pipe[2] = { -1, -1 };
    int out_pipe[2] = { -1, -1 };
    int err_pipe[2] = { -1, -1 };
    pid_t child = -1;
    size_t written = 0;
    size_t out_len = 0;
    size_t err_len = 0;
    char stdout_buf[WAMR_VOK_MAX_STDOUT];
    char stderr_buf[WAMR_VOK_MAX_STDERR];
    int stdin_open = 1;
    int stdout_open = 1;
    int stderr_open = 1;
    int status = 0;
    int rc = WAMR_VOK_BIND_REFUSED;
    int sigpipe_blocked = 0;
    int preserve_pending = 0;
    struct timespec start;
    sigset_t old_mask;
    char *argv_child[3];

    if (envelope != NULL) {
        memset(envelope, 0, sizeof(*envelope));
    }
    if (seal != NULL) {
        memset(seal, 0, sizeof(*seal));
    }
    if (verifier_path == NULL || bytes == NULL || size == 0 ||
        envelope == NULL || seal == NULL) {
        return WAMR_VOK_BIND_INVALID;
    }
    if (!pinned_verifier_digest(pin) || digest_is_zero(pin)) {
        return WAMR_VOK_BIND_REFUSED;
    }
    bin_fd = open(verifier_path, O_RDONLY | O_CLOEXEC);
    if (bin_fd < 0) {
        return WAMR_VOK_BIND_MISSING;
    }
    verifier_bytes = read_whole_fd(bin_fd, &verifier_size);
    close_fd(&bin_fd);
    if (verifier_bytes == NULL) {
        return WAMR_VOK_BIND_REFUSED;
    }
    wamr_sha256(verifier_bytes, verifier_size, hashed);
    if (!digest_eq_ct(hashed, pin)) {
        memset(verifier_bytes, 0, verifier_size);
        free(verifier_bytes);
        return WAMR_VOK_BIND_REFUSED;
    }
    mem_fd = sealed_memfd_from_bytes(verifier_bytes, verifier_size);
    memset(verifier_bytes, 0, verifier_size);
    free(verifier_bytes);
    verifier_bytes = NULL;
    if (mem_fd < 0) {
        return WAMR_VOK_BIND_REFUSED;
    }
    if (pipe2(in_pipe, O_CLOEXEC) != 0 || pipe2(out_pipe, O_CLOEXEC) != 0 ||
        pipe2(err_pipe, O_CLOEXEC) != 0) {
        close_fd(&mem_fd);
        close_fd(&in_pipe[0]);
        close_fd(&in_pipe[1]);
        close_fd(&out_pipe[0]);
        close_fd(&out_pipe[1]);
        close_fd(&err_pipe[0]);
        close_fd(&err_pipe[1]);
        return WAMR_VOK_BIND_REFUSED;
    }
    child = fork();
    if (child < 0) {
        close_fd(&mem_fd);
        close_fd(&in_pipe[0]);
        close_fd(&in_pipe[1]);
        close_fd(&out_pipe[0]);
        close_fd(&out_pipe[1]);
        close_fd(&err_pipe[0]);
        close_fd(&err_pipe[1]);
        return WAMR_VOK_BIND_REFUSED;
    }
    if (child == 0) {
        char *empty_envp[1];
        if (mem_fd < 3) {
            _exit(127);
        }
        if (dup2(in_pipe[0], STDIN_FILENO) < 0 ||
            dup2(out_pipe[1], STDOUT_FILENO) < 0 ||
            dup2(err_pipe[1], STDERR_FILENO) < 0) {
            _exit(127);
        }
        close_fd(&in_pipe[0]);
        close_fd(&in_pipe[1]);
        close_fd(&out_pipe[0]);
        close_fd(&out_pipe[1]);
        close_fd(&err_pipe[0]);
        close_fd(&err_pipe[1]);
        /* Keep CLOEXEC on mem_fd; fexecve of an ELF uses the fd then
         * the flag drops it from the new image. close_range extra fds. */
        close_extra_child_fds(mem_fd);
        argv_child[0] = (char *)verifier_path;
        argv_child[1] = "--stdin";
        argv_child[2] = NULL;
        empty_envp[0] = NULL;
        fexecve(mem_fd, argv_child, empty_envp);
        _exit(127);
    }
    close_fd(&in_pipe[0]);
    close_fd(&out_pipe[1]);
    close_fd(&err_pipe[1]);
    close_fd(&mem_fd);
    if (!set_nonblock(in_pipe[1]) || !set_nonblock(out_pipe[0]) ||
        !set_nonblock(err_pipe[0])) {
        (void)kill(child, SIGKILL);
        (void)waitpid(child, &status, 0);
        close_fd(&in_pipe[1]);
        close_fd(&out_pipe[0]);
        close_fd(&err_pipe[0]);
        return WAMR_VOK_BIND_REFUSED;
    }
    if (!block_sigpipe(&old_mask, &preserve_pending)) {
        (void)kill(child, SIGKILL);
        (void)waitpid(child, &status, 0);
        close_fd(&in_pipe[1]);
        close_fd(&out_pipe[0]);
        close_fd(&err_pipe[0]);
        return WAMR_VOK_BIND_REFUSED;
    }
    sigpipe_blocked = 1;
    if (clock_gettime(CLOCK_MONOTONIC, &start) != 0) {
        if (sigpipe_blocked) {
            drain_and_restore_sigpipe(&old_mask, preserve_pending);
        }
        (void)kill(child, SIGKILL);
        (void)waitpid(child, &status, 0);
        close_fd(&in_pipe[1]);
        close_fd(&out_pipe[0]);
        close_fd(&err_pipe[0]);
        return WAMR_VOK_BIND_REFUSED;
    }
    while (stdin_open || stdout_open || stderr_open) {
        struct pollfd fds[3];
        int nfds = 0;
        int timeout = remaining_ms(start);
        int stdin_ix = -1;
        int stdout_ix = -1;
        int stderr_ix = -1;
        int pr;
        if (timeout <= 0) {
            (void)kill(child, SIGKILL);
            break;
        }
        if (stdin_open) {
            stdin_ix = nfds;
            fds[nfds].fd = in_pipe[1];
            fds[nfds].events = POLLOUT;
            fds[nfds].revents = 0;
            nfds++;
        }
        if (stdout_open) {
            stdout_ix = nfds;
            fds[nfds].fd = out_pipe[0];
            fds[nfds].events = POLLIN;
            fds[nfds].revents = 0;
            nfds++;
        }
        if (stderr_open) {
            stderr_ix = nfds;
            fds[nfds].fd = err_pipe[0];
            fds[nfds].events = POLLIN;
            fds[nfds].revents = 0;
            nfds++;
        }
        pr = poll(fds, (nfds_t)nfds, timeout);
        if (pr < 0) {
            if (errno == EINTR) {
                continue;
            }
            (void)kill(child, SIGKILL);
            break;
        }
        if (pr == 0) {
            (void)kill(child, SIGKILL);
            break;
        }
        if (stdin_ix >= 0 &&
            (fds[stdin_ix].revents &
             (POLLOUT | POLLERR | POLLHUP | POLLNVAL))) {
            if (fds[stdin_ix].revents & (POLLERR | POLLHUP | POLLNVAL)) {
                close_fd(&in_pipe[1]);
                stdin_open = 0;
            } else {
                ssize_t n = write(in_pipe[1], bytes + written, size - written);
                if (n > 0) {
                    written += (size_t)n;
                    if (written == size) {
                        close_fd(&in_pipe[1]);
                        stdin_open = 0;
                    }
                } else if (n < 0 && (errno == EINTR || errno == EAGAIN ||
                                     errno == EWOULDBLOCK)) {
                    /* retry after poll; deadline is checked every iteration */
                } else {
                    close_fd(&in_pipe[1]);
                    stdin_open = 0;
                }
            }
        }
        if (stdout_ix >= 0 && (fds[stdout_ix].revents & (POLLIN | POLLHUP | POLLERR))) {
            if (fds[stdout_ix].revents & POLLIN) {
                ssize_t n;
                if (out_len >= sizeof(stdout_buf)) {
                    (void)kill(child, SIGKILL);
                    close_fd(&out_pipe[0]);
                    stdout_open = 0;
                } else {
                    n = read(out_pipe[0], stdout_buf + out_len,
                             sizeof(stdout_buf) - out_len);
                    if (n > 0) {
                        out_len += (size_t)n;
                    } else if (n == 0) {
                        close_fd(&out_pipe[0]);
                        stdout_open = 0;
                    } else if (errno != EINTR && errno != EAGAIN) {
                        close_fd(&out_pipe[0]);
                        stdout_open = 0;
                    }
                }
            } else {
                close_fd(&out_pipe[0]);
                stdout_open = 0;
            }
        }
        if (stderr_ix >= 0 && (fds[stderr_ix].revents & (POLLIN | POLLHUP | POLLERR))) {
            if (fds[stderr_ix].revents & POLLIN) {
                ssize_t n;
                size_t room = (err_len < sizeof(stderr_buf))
                                  ? (sizeof(stderr_buf) - err_len)
                                  : 0;
                if (room == 0) {
                    char dump[256];
                    n = read(err_pipe[0], dump, sizeof(dump));
                    if (n <= 0) {
                        close_fd(&err_pipe[0]);
                        stderr_open = 0;
                    }
                } else {
                    n = read(err_pipe[0], stderr_buf + err_len, room);
                    if (n > 0) {
                        err_len += (size_t)n;
                    } else if (n == 0) {
                        close_fd(&err_pipe[0]);
                        stderr_open = 0;
                    } else if (errno != EINTR && errno != EAGAIN) {
                        close_fd(&err_pipe[0]);
                        stderr_open = 0;
                    }
                }
            } else {
                close_fd(&err_pipe[0]);
                stderr_open = 0;
            }
        }
    }
    close_fd(&in_pipe[1]);
    close_fd(&out_pipe[0]);
    close_fd(&err_pipe[0]);
    if (sigpipe_blocked) {
        drain_and_restore_sigpipe(&old_mask, preserve_pending);
        sigpipe_blocked = 0;
    }
    if (!reap_child_deadline(child, &status, start)) {
        return WAMR_VOK_BIND_REFUSED;
    }
    if (remaining_ms(start) <= 0) {
        return WAMR_VOK_BIND_REFUSED;
    }
    if (!WIFEXITED(status) || WEXITSTATUS(status) != 0) {
        return WAMR_VOK_BIND_REFUSED;
    }
    if (written != size || out_len == 0 || out_len >= sizeof(stdout_buf)) {
        return WAMR_VOK_BIND_REFUSED;
    }
    rc = parse_framed_verdict(stdout_buf, out_len, envelope, seal);
    if (rc != WAMR_VOK_BIND_OK) {
        return rc;
    }
    return wamr_vok_bind_bytes(bytes, size, envelope, seal);
}

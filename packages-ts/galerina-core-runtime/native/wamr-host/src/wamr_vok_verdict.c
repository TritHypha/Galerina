#include "wamr_vok_verdict.h"
#include "wamr_sha256.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define WAMR_VOK_MAX_FILE 4096
#define WAMR_VOK_MAX_LINE 256
#define WAMR_VOK_MAX_PAYLOAD 2048

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

static int valid_build_point(const char *value)
{
    size_t i;
    if (value == NULL || strncmp(value, "git:", 4) != 0 || strlen(value) != 44) {
        return 0;
    }
    for (i = 4; i < 44; i++) {
        char ch = value[i];
        int hex = (ch >= '0' && ch <= '9') || (ch >= 'a' && ch <= 'f') ||
                  (ch >= 'A' && ch <= 'F');
        if (!hex) {
            return 0;
        }
    }
    return 1;
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

int wamr_vok_parse_envelope_file(const char *path, wamr_vok_envelope_t *out)
{
    char body[WAMR_VOK_MAX_FILE];
    char line[WAMR_VOK_MAX_LINE];
    const char *cursor;
    const char *end;
    size_t len = 0;
    unsigned seen = 0;

    if (out == NULL) {
        return WAMR_VOK_BIND_INVALID;
    }
    memset(out, 0, sizeof(*out));
    if (!read_file(path, body, sizeof(body), &len)) {
        return WAMR_VOK_BIND_MISSING;
    }
    cursor = body;
    end = body + len;
    while (cursor < end) {
        const char *key;
        const char *value;
        if (!take_line(&cursor, end, line, sizeof(line)) ||
            !split_kv(line, &key, &value)) {
            return WAMR_VOK_BIND_REFUSED;
        }
        if (strcmp(key, "abi") == 0) {
            if ((seen & 1u) != 0 || strlen(value) >= sizeof(out->abi)) {
                return WAMR_VOK_BIND_REFUSED;
            }
            memcpy(out->abi, value, strlen(value) + 1);
            seen |= 1u;
        } else if (strcmp(key, "buildPoint") == 0) {
            if ((seen & 2u) != 0 || strlen(value) >= sizeof(out->build_point) ||
                !valid_build_point(value)) {
                return WAMR_VOK_BIND_REFUSED;
            }
            memcpy(out->build_point, value, strlen(value) + 1);
            seen |= 2u;
        } else if (strcmp(key, "capabilityDigest") == 0) {
            if ((seen & 4u) != 0 ||
                !parse_sha256_prefaced(value, out->capability_digest)) {
                return WAMR_VOK_BIND_REFUSED;
            }
            seen |= 4u;
        } else if (strcmp(key, "componentDigest") == 0) {
            if ((seen & 8u) != 0 ||
                !parse_sha256_prefaced(value, out->component_digest)) {
                return WAMR_VOK_BIND_REFUSED;
            }
            seen |= 8u;
        } else if (strcmp(key, "dependencyClosureDigest") == 0) {
            if ((seen & 16u) != 0 ||
                !parse_sha256_prefaced(value, out->dependency_digest)) {
                return WAMR_VOK_BIND_REFUSED;
            }
            seen |= 16u;
        } else if (strcmp(key, "epoch") == 0) {
            char *term = NULL;
            unsigned long long epoch;
            if ((seen & 32u) != 0) {
                return WAMR_VOK_BIND_REFUSED;
            }
            epoch = strtoull(value, &term, 10);
            if (term == value || *term != '\0') {
                return WAMR_VOK_BIND_REFUSED;
            }
            out->epoch = epoch;
            seen |= 32u;
        } else if (strcmp(key, "evidenceSetDigest") == 0) {
            if ((seen & 64u) != 0 ||
                !parse_sha256_prefaced(value, out->evidence_digest)) {
                return WAMR_VOK_BIND_REFUSED;
            }
            seen |= 64u;
        } else if (strcmp(key, "policyDigest") == 0) {
            if ((seen & 128u) != 0 ||
                !parse_sha256_prefaced(value, out->policy_digest)) {
                return WAMR_VOK_BIND_REFUSED;
            }
            seen |= 128u;
        } else if (strcmp(key, "schemaVersion") == 0) {
            if ((seen & 256u) != 0 ||
                strlen(value) >= sizeof(out->schema_version)) {
                return WAMR_VOK_BIND_REFUSED;
            }
            memcpy(out->schema_version, value, strlen(value) + 1);
            seen |= 256u;
        } else if (strcmp(key, "target") == 0) {
            if ((seen & 512u) != 0 || strlen(value) >= sizeof(out->target)) {
                return WAMR_VOK_BIND_REFUSED;
            }
            memcpy(out->target, value, strlen(value) + 1);
            seen |= 512u;
        } else if (strcmp(key, "envelopeDigest") == 0) {
            if ((seen & 1024u) != 0 ||
                !parse_sha256_prefaced(value, out->envelope_digest)) {
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

int wamr_vok_parse_seal_file(const char *path, wamr_vok_wax_seal_t *out)
{
    char body[WAMR_VOK_MAX_FILE];
    char line[WAMR_VOK_MAX_LINE];
    const char *cursor;
    const char *end;
    size_t len = 0;
    unsigned seen = 0;

    if (out == NULL) {
        return WAMR_VOK_BIND_INVALID;
    }
    memset(out, 0, sizeof(*out));
    if (!read_file(path, body, sizeof(body), &len)) {
        return WAMR_VOK_BIND_MISSING;
    }
    cursor = body;
    end = body + len;
    while (cursor < end) {
        const char *key;
        const char *value;
        if (!take_line(&cursor, end, line, sizeof(line)) ||
            !split_kv(line, &key, &value)) {
            return WAMR_VOK_BIND_REFUSED;
        }
        if (strcmp(key, "authentication") == 0) {
            if ((seen & 1u) != 0 ||
                strlen(value) >= sizeof(out->authentication)) {
                return WAMR_VOK_BIND_REFUSED;
            }
            memcpy(out->authentication, value, strlen(value) + 1);
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
            seen |= 2u;
        } else if (strcmp(key, "envelopeDigest") == 0) {
            if ((seen & 4u) != 0 ||
                !parse_sha256_prefaced(value, out->envelope_digest)) {
                return WAMR_VOK_BIND_REFUSED;
            }
            seen |= 4u;
        } else if (strcmp(key, "kind") == 0) {
            if ((seen & 8u) != 0 || strlen(value) >= sizeof(out->kind)) {
                return WAMR_VOK_BIND_REFUSED;
            }
            memcpy(out->kind, value, strlen(value) + 1);
            seen |= 8u;
        } else if (strcmp(key, "profileDigest") == 0) {
            if ((seen & 16u) != 0 ||
                !parse_sha256_prefaced(value, out->profile_digest)) {
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
            seen |= 32u;
        } else if (strcmp(key, "schemaVersion") == 0) {
            if ((seen & 64u) != 0 ||
                strlen(value) >= sizeof(out->schema_version)) {
                return WAMR_VOK_BIND_REFUSED;
            }
            memcpy(out->schema_version, value, strlen(value) + 1);
            seen |= 64u;
        } else if (strcmp(key, "terminalOutcome") == 0) {
            if ((seen & 128u) != 0 ||
                strlen(value) >= sizeof(out->terminal_outcome)) {
                return WAMR_VOK_BIND_REFUSED;
            }
            memcpy(out->terminal_outcome, value, strlen(value) + 1);
            seen |= 128u;
        } else if (strcmp(key, "sealDigest") == 0) {
            if ((seen & 256u) != 0 ||
                !parse_sha256_prefaced(value, out->seal_digest)) {
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

int wamr_vok_bind_bytes(const uint8_t *bytes, size_t size,
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
        strcmp(seal->authentication, "UNAUTHENTICATED_REFERENCE") != 0 ||
        strcmp(seal->schema_version, WAMR_VOK_SCHEMA_VERSION) != 0) {
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

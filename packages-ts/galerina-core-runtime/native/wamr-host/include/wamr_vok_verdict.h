#ifndef GALERINA_WAMR_VOK_VERDICT_H
#define GALERINA_WAMR_VOK_VERDICT_H

#include <stddef.h>
#include <stdint.h>

/*
 * Line-canonical Envelope / Wax Seal files produced by the out-of-process
 * Rust verifier. This C module only parses and binds; it does not mint a
 * Signet and it does not link Rust.
 */

#define WAMR_VOK_ENVELOPE_DOMAIN "galerina.assurance.envelope.v1"
#define WAMR_VOK_SEAL_DOMAIN "galerina.assurance.wax-seal.v1"
#define WAMR_VOK_ABI "wamr-core-wasm@2.4.5"
#define WAMR_VOK_TARGET "linux-x86_64"
#define WAMR_VOK_SCHEMA_VERSION "1"
#define WAMR_VOK_EPOCH 1ull
#define WAMR_VOK_POLICY_DOMAIN "galerina.assurance.policy.v1"
#define WAMR_VOK_POLICY_ID "galerina.wamr-vok.artifact.v1"

enum {
    WAMR_VOK_BIND_OK = 0,
    WAMR_VOK_BIND_INVALID = 1,
    WAMR_VOK_BIND_MISSING = 2,
    WAMR_VOK_BIND_MISMATCH = 3,
    WAMR_VOK_BIND_REFUSED = 4
};

typedef struct {
    uint8_t component_digest[32];
    uint8_t envelope_digest[32];
    uint8_t capability_digest[32];
    uint8_t dependency_digest[32];
    uint8_t evidence_digest[32];
    uint8_t policy_digest[32];
    char abi[80];
    char target[80];
    char build_point[48];
    char schema_version[8];
    uint64_t epoch;
} wamr_vok_envelope_t;

typedef struct {
    uint8_t envelope_digest[32];
    uint8_t profile_digest[32];
    uint8_t seal_digest[32];
    char kind[16];
    char terminal_outcome[16];
    char authentication[40];
    char schema_version[8];
    int authorizing;
    int replayable;
} wamr_vok_wax_seal_t;

void wamr_vok_framed_digest(const char *domain, const uint8_t *payload,
                            size_t payload_len, uint8_t out[32]);

int wamr_vok_envelope_canonical(const wamr_vok_envelope_t *envelope, char *out,
                                size_t capacity);

int wamr_vok_seal_canonical(const wamr_vok_wax_seal_t *seal, char *out,
                            size_t capacity);

int wamr_vok_parse_envelope_file(const char *path, wamr_vok_envelope_t *out);

int wamr_vok_parse_seal_file(const char *path, wamr_vok_wax_seal_t *out);

/*
 * Independently hashes bytes[0..size) and binds them to envelope + seal.
 * Returns WAMR_VOK_BIND_*.
 */
int wamr_vok_bind_bytes(const uint8_t *bytes, size_t size,
                        const wamr_vok_envelope_t *envelope,
                        const wamr_vok_wax_seal_t *seal);

#endif

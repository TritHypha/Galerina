#ifndef GALERINA_WAMR_VOK_VERDICT_H
#define GALERINA_WAMR_VOK_VERDICT_H

#include <stddef.h>
#include <stdint.h>

/*
 * Envelope / Wax Seal produced by a hash-pinned out-of-process Rust
 * verifier child. This C module parses, binds, and spawns; it does not
 * mint a Signet and it does not link Rust. File-parsed verdicts are
 * never load authority. BIND_OK is reachable only from
 * wamr_vok_spawn_and_bind after a framed pipe parse of a sealed-memfd
 * child with empty envp.
 */

#define WAMR_VOK_ENVELOPE_DOMAIN "galerina.assurance.envelope.v1"
#define WAMR_VOK_SEAL_DOMAIN "galerina.assurance.wax-seal.v1"
#define WAMR_VOK_ABI "wamr-core-wasm@2.4.5"
#define WAMR_VOK_TARGET "linux-x86_64"
#define WAMR_VOK_SCHEMA_VERSION "1"
#define WAMR_VOK_EPOCH 1ull
#define WAMR_VOK_POLICY_DOMAIN "galerina.assurance.policy.v1"
#define WAMR_VOK_POLICY_ID "galerina.wamr-vok.artifact.v1"
#define WAMR_VOK_CAPABILITY_DOMAIN "galerina.assurance.capability.v1"
#define WAMR_VOK_DEPS_DOMAIN "galerina.assurance.deps.v1"
#define WAMR_VOK_EVIDENCE_DOMAIN "galerina.assurance.evidence.v1"
#define WAMR_VOK_PROFILE_DOMAIN "galerina.assurance.profile.v1"
#define WAMR_VOK_CAPABILITY_PAYLOAD "none"
#define WAMR_VOK_DEPS_PAYLOAD "closed"
#define WAMR_VOK_EVIDENCE_PAYLOAD "synthetic"
#define WAMR_VOK_AUTHENTICATION "PINNED_CHILD_PIPE"

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
 * Hash-pin verifier_path, copy the pinned bytes into a sealed memfd,
 * fexecve that memfd with an empty envp, write bytes to the child's
 * stdin, read Envelope+Wax Seal only from the child's stdout pipe, then
 * bind internally. BIND_OK cannot be obtained from file-parsed structs.
 * Compile with -DWAMR_VOK_VERIFIER_SHA256_HEX=<64 lowercase hex>.
 */
int wamr_vok_spawn_and_bind(const char *verifier_path, const uint8_t *bytes,
                            size_t size, wamr_vok_envelope_t *envelope,
                            wamr_vok_wax_seal_t *seal);

#endif

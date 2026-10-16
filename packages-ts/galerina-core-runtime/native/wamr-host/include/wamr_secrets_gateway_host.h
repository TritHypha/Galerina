#ifndef GALERINA_WAMR_SECRETS_GATEWAY_HOST_H
#define GALERINA_WAMR_SECRETS_GATEWAY_HOST_H

#include <stddef.h>
#include <stdint.h>

#include "wamr_import_admission.h"

/*
 * Linux-only native WAMR host load path for secrets-gateway core-wasm
 * imports. Requires the hash-pinned WAMR 2.4.5 product-mini Linux Release
 * SDK documented by scripts/tests/run-rd1413-wamr-context-probe.sh
 * ($HOME/.local/opt/wamr-2.4.5-sdk; wasm_export.h
 * 779ee0870da26f129afe26f58881d286e0bef1537d995acf9cdd27c8a50c3ee0,
 * lib_export.h 19c182c07246c971eee6c54ddf5bd552fcb5fee91be6970681815c0d19ea1264,
 * libiwasm.a f21702522f6ce032193ac0529a95f841be044730a0b1c237f17ebb0d61f0104d).
 * There is no Windows or other-OS fallback in this file.
 *
 * This path does not run the Component Model. It admits already-lowered
 * core-wasm function imports whose names and signatures are derived from
 * SECRETS_GATEWAY_WIT by the Canonical ABI flatten_functype(context='lower')
 * rules (MAX_FLAT_PARAMS=16, MAX_FLAT_RESULTS=1). It does not authorize a
 * caller, grant an effect, or handle secret bytes.
 *
 * WAMR 2.4.5 product-mini has no pre-instantiation admission hook. The only
 * reachable order is: register natives (process-global; required so load can
 * set import.linked), wasm_runtime_load, wamr_validate_module_import_abi,
 * wasm_runtime_instantiate only when admission returned VALID. This function
 * does not register natives. Call wamr_secrets_gateway_register_natives after
 * wasm_runtime_init and before load, or admission returns UNLINKED_IMPORT.
 *
 * wasm_runtime_load may modify buf in place and requires buf to remain
 * referenceable until wasm_runtime_unload. The caller owns buf. This path
 * never copies, reads, or logs guest linear memory.
 */

typedef enum {
    WAMR_SECRETS_GATEWAY_VALID = 0,
    WAMR_SECRETS_GATEWAY_INVALID_ARGUMENT = 1,
    WAMR_SECRETS_GATEWAY_UNAPPROVED_IMPORT = 2,
    WAMR_SECRETS_GATEWAY_UNSUPPORTED_KIND = 3,
    WAMR_SECRETS_GATEWAY_SIGNATURE_MISMATCH = 4,
    WAMR_SECRETS_GATEWAY_DUPLICATE_IMPORT = 5,
    WAMR_SECRETS_GATEWAY_UNLINKED_IMPORT = 6,
    WAMR_SECRETS_GATEWAY_METADATA_UNAVAILABLE = 7,
    WAMR_SECRETS_GATEWAY_LOAD_FAILED = 8,
    WAMR_SECRETS_GATEWAY_INSTANTIATE_FAILED = 9,
    WAMR_SECRETS_GATEWAY_ARTIFACT_MISMATCH = 10,
    WAMR_SECRETS_GATEWAY_ARTIFACT_DIGEST_MISSING = 11,
    WAMR_SECRETS_GATEWAY_VERDICT_REFUSED = 12
} wamr_secrets_gateway_result_t;

typedef struct {
    wasm_module_t module;
    wasm_module_inst_t instance;
    uint8_t artifact_digest[32];
    uint8_t *owned_snapshot;
} wamr_secrets_gateway_loaded_t;

#define WAMR_SECRETS_GATEWAY_STACK_SIZE 16384u
#define WAMR_SECRETS_GATEWAY_HEAP_SIZE 0u

const char *wamr_secrets_gateway_import_module(void);
size_t wamr_secrets_gateway_contract_count(void);
const wamr_function_import_contract_t *wamr_secrets_gateway_contracts(void);
const char *wamr_secrets_gateway_result_name(wamr_secrets_gateway_result_t result);

/*
 * Register stub natives for every secrets-gateway allowlist entry. Stubs do
 * not read guest linear memory. Process-global; not unregistered. Must run
 * after wasm_runtime_init and before load so WAMR can set import.linked.
 */
bool wamr_secrets_gateway_register_natives(void);

/*
 * Digestless public loader. Hard-refuses with ARTIFACT_DIGEST_MISSING on
 * every path: clears out, never hashes, never calls wasm_runtime_load or
 * wasm_runtime_instantiate. Secret/artifact load uses
 * wamr_secrets_gateway_load_for_authority.
 *
 * NULL out or a missing/zero-capacity diagnostic is still INVALID_ARGUMENT
 * (out is cleared when non-NULL).
 */
wamr_secrets_gateway_result_t wamr_secrets_gateway_load(
    uint8_t *buf,
    uint32_t size,
    wamr_secrets_gateway_loaded_t *out,
    char *diagnostic,
    size_t diagnostic_capacity);

/*
 * Production secret/artifact load. This is the only public entry that
 * can return VALID / a non-NULL instance. verifier_path is the
 * out-of-process Rust verifier binary. NULL is INVALID_ARGUMENT. The
 * host copies buf[0..size) once into a private snapshot, hash-pins the
 * verifier, copies those bytes into a sealed memfd
 * (F_SEAL_WRITE|GROW|SHRINK|SEAL), fexecves that memfd with an empty
 * envp, writes the snapshot to the child's stdin, and reads Envelope +
 * Wax Seal only from the child's stdout pipe. Caller verdict file paths
 * are not accepted. A missing binary is ARTIFACT_DIGEST_MISSING. A pin
 * mismatch, spawn failure, forged or file-origin verdict, or
 * authorizing=true is VERDICT_REFUSED. The host independently SHA-256s
 * the snapshot and binds componentDigest before wasm_runtime_load of
 * that same snapshot. This translation unit does not link or call Rust.
 * There is no public self-hash loader.
 */
wamr_secrets_gateway_result_t wamr_secrets_gateway_load_for_authority(
    uint8_t *buf,
    uint32_t size,
    const char *verifier_path,
    wamr_secrets_gateway_loaded_t *out,
    char *diagnostic,
    size_t diagnostic_capacity);

/*
 * Copy the 32-byte artifact digest from a VALID loaded module. Returns false
 * when loaded is NULL or the digest is missing (all-zero).
 */
bool wamr_secrets_gateway_copy_artifact_digest(
    const wamr_secrets_gateway_loaded_t *loaded,
    uint8_t out[32]);

void wamr_secrets_gateway_release(wamr_secrets_gateway_loaded_t *loaded);

#endif

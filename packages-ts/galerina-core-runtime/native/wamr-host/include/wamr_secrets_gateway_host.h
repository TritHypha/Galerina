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
    WAMR_SECRETS_GATEWAY_INSTANTIATE_FAILED = 9
} wamr_secrets_gateway_result_t;

typedef struct {
    wasm_module_t module;
    wasm_module_inst_t instance;
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
 * Load buf, admit against the secrets-gateway allowlist, instantiate only on
 * VALID. Any other outcome unloads exactly once (if a module was loaded) and
 * leaves instance NULL. diagnostic carries the result code name and, when
 * known, the import identity; never secret bytes.
 *
 * Subset of the allowlist is admitted. Superset is refused as
 * UNAPPROVED_IMPORT. Two imports matching one allowlist name are
 * DUPLICATE_IMPORT. Negative wasm_runtime_get_import_count is
 * METADATA_UNAVAILABLE with no further metadata access.
 */
wamr_secrets_gateway_result_t wamr_secrets_gateway_load(
    uint8_t *buf,
    uint32_t size,
    wamr_secrets_gateway_loaded_t *out,
    char *diagnostic,
    size_t diagnostic_capacity);

void wamr_secrets_gateway_release(wamr_secrets_gateway_loaded_t *loaded);

#endif

#ifndef GALERINA_WAMR_IMPORT_ADMISSION_H
#define GALERINA_WAMR_IMPORT_ADMISSION_H

#include <stddef.h>
#include <stdint.h>

#include "wasm_export.h"

typedef enum {
    WAMR_IMPORT_ABI_VALID = 0,
    WAMR_IMPORT_ABI_INVALID_ARGUMENT = 1,
    WAMR_IMPORT_ABI_UNAPPROVED_IMPORT = 2,
    WAMR_IMPORT_ABI_UNSUPPORTED_KIND = 3,
    WAMR_IMPORT_ABI_SIGNATURE_MISMATCH = 4,
    WAMR_IMPORT_ABI_DUPLICATE_IMPORT = 5,
    WAMR_IMPORT_ABI_UNLINKED_IMPORT = 6,
    WAMR_IMPORT_ABI_METADATA_UNAVAILABLE = 7
} wamr_import_abi_result_t;

typedef struct {
    const char *module_name;
    const char *name;
    const uint8_t *parameter_kinds;
    size_t parameter_count;
    const uint8_t *result_kinds;
    size_t result_count;
} wamr_function_import_contract_t;

/*
 * Check every import in an already-loaded WAMR module against a closed exact
 * function-import allowlist. This validates ABI shape only: it does not
 * authorize a caller, grant an effect, validate a Signet, or establish secret
 * custody. Unknown imports and non-function imports fail closed.
 *
 * Supported contract kinds are I32/I64/F32/F64/V128/EXTERNREF/FUNCREF for
 * parameters and I32/I64/F32/F64/FUNCREF for results. This helper is currently
 * experimental and supports only the hash-pinned WAMR product-mini Linux
 * Release artifact and feature profile documented by
 * scripts/tests/run-rd1413-wamr-context-probe.sh. In that WAMR revision, the
 * public result-kind accessor asserts for an actual EXTERNREF result when
 * assertions are enabled; the pinned Release build disables assertions and
 * returns its unsupported-kind sentinel, which this helper rejects as a
 * signature mismatch. Do not use a different or assertion-enabled WAMR build
 * with this helper until it has a safe result-type inspection path.
 *
 * diagnostic must be a non-null, non-empty caller-owned buffer. The function
 * performs no allocation and does not instantiate the module.
 */
wamr_import_abi_result_t wamr_validate_module_import_abi(
    wasm_module_t module,
    const wamr_function_import_contract_t *contracts,
    size_t contract_count,
    char *diagnostic,
    size_t diagnostic_capacity);

#endif

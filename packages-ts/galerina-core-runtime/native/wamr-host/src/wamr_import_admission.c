#include "wamr_import_admission.h"

#include <stdio.h>
#include <string.h>

static void set_diagnostic(char *diagnostic, size_t capacity, const char *message)
{
    if (diagnostic == NULL || capacity == 0) return;
    (void)snprintf(diagnostic, capacity, "%s", message);
}

static const wamr_function_import_contract_t *find_contract(
    const wamr_function_import_contract_t *contracts,
    size_t contract_count,
    const char *module_name,
    const char *name)
{
    size_t i;

    for (i = 0; i < contract_count; ++i) {
        if (strcmp(contracts[i].module_name, module_name) == 0 &&
            strcmp(contracts[i].name, name) == 0) {
            return &contracts[i];
        }
    }
    return NULL;
}

static wamr_import_abi_result_t validate_contracts(
    const wamr_function_import_contract_t *contracts,
    size_t contract_count)
{
    size_t i;
    size_t j;

    if (contract_count > 0 && contracts == NULL) {
        return WAMR_IMPORT_ABI_INVALID_ARGUMENT;
    }
    for (i = 0; i < contract_count; ++i) {
        const wamr_function_import_contract_t *contract = &contracts[i];
        if (contract->module_name == NULL || contract->module_name[0] == '\0' ||
            contract->name == NULL || contract->name[0] == '\0' ||
            (contract->parameter_count > 0 && contract->parameter_kinds == NULL) ||
            (contract->result_count > 0 && contract->result_kinds == NULL) ||
            contract->parameter_count > UINT32_MAX ||
            contract->result_count > UINT32_MAX) {
            return WAMR_IMPORT_ABI_INVALID_ARGUMENT;
        }
        for (j = 0; j < contract->parameter_count; ++j) {
            switch (contract->parameter_kinds[j]) {
                case WASM_I32: case WASM_I64: case WASM_F32: case WASM_F64:
                case WASM_V128: case WASM_EXTERNREF: case WASM_FUNCREF:
                    break;
                default:
                    return WAMR_IMPORT_ABI_UNSUPPORTED_KIND;
            }
        }
        for (j = 0; j < contract->result_count; ++j) {
            switch (contract->result_kinds[j]) {
                case WASM_I32: case WASM_I64: case WASM_F32: case WASM_F64:
                case WASM_FUNCREF:
                    break;
                default:
                    return WAMR_IMPORT_ABI_UNSUPPORTED_KIND;
            }
        }
        for (j = 0; j < i; ++j) {
            if (strcmp(contracts[j].module_name, contract->module_name) == 0 &&
                strcmp(contracts[j].name, contract->name) == 0) {
                return WAMR_IMPORT_ABI_INVALID_ARGUMENT;
            }
        }
    }
    return WAMR_IMPORT_ABI_VALID;
}

static int signature_matches(wasm_func_type_t type,
                             const wamr_function_import_contract_t *contract)
{
    uint32_t i;

    if (type == NULL ||
        wasm_func_type_get_param_count(type) != contract->parameter_count ||
        wasm_func_type_get_result_count(type) != contract->result_count) {
        return 0;
    }
    for (i = 0; i < (uint32_t)contract->parameter_count; ++i) {
        if (wasm_func_type_get_param_valkind(type, i) != contract->parameter_kinds[i]) {
            return 0;
        }
    }
    for (i = 0; i < (uint32_t)contract->result_count; ++i) {
        if (wasm_func_type_get_result_valkind(type, i) != contract->result_kinds[i]) {
            return 0;
        }
    }
    return 1;
}

wamr_import_abi_result_t wamr_validate_module_import_abi(
    wasm_module_t module,
    const wamr_function_import_contract_t *contracts,
    size_t contract_count,
    char *diagnostic,
    size_t diagnostic_capacity)
{
    int32_t import_count;
    int32_t i;
    wamr_import_abi_result_t contract_result;

    if (diagnostic == NULL || diagnostic_capacity == 0) {
        return WAMR_IMPORT_ABI_INVALID_ARGUMENT;
    }
    diagnostic[0] = '\0';
    if (module == NULL) {
        set_diagnostic(diagnostic, diagnostic_capacity,
                       "invalid module or function-import contract table");
        return WAMR_IMPORT_ABI_INVALID_ARGUMENT;
    }
    contract_result = validate_contracts(contracts, contract_count);
    if (contract_result != WAMR_IMPORT_ABI_VALID) {
        set_diagnostic(diagnostic, diagnostic_capacity,
                       contract_result == WAMR_IMPORT_ABI_UNSUPPORTED_KIND
                           ? "function-import contract contains an unsupported value kind"
                           : "invalid function-import contract table");
        return contract_result;
    }

    import_count = wasm_runtime_get_import_count(module);
    if (import_count < 0) {
        set_diagnostic(diagnostic, diagnostic_capacity,
                       "WAMR could not provide the module import count");
        return WAMR_IMPORT_ABI_METADATA_UNAVAILABLE;
    }
    if ((size_t)import_count > contract_count) {
        set_diagnostic(diagnostic, diagnostic_capacity,
                       "module import count exceeds the closed contract table");
        return WAMR_IMPORT_ABI_UNAPPROVED_IMPORT;
    }
    for (i = 0; i < import_count; ++i) {
        wasm_import_t imported = { 0 };
        const wamr_function_import_contract_t *contract;
        int32_t prior_index;

        wasm_runtime_get_import_type(module, i, &imported);
        if (imported.module_name == NULL || imported.name == NULL) {
            set_diagnostic(diagnostic, diagnostic_capacity,
                           "module import is missing its module or name");
            return WAMR_IMPORT_ABI_INVALID_ARGUMENT;
        }
        for (prior_index = 0; prior_index < i; ++prior_index) {
            wasm_import_t prior = { 0 };
            wasm_runtime_get_import_type(module, prior_index, &prior);
            if (prior.module_name == NULL || prior.name == NULL) {
                set_diagnostic(diagnostic, diagnostic_capacity,
                               "module import metadata is incomplete");
                return WAMR_IMPORT_ABI_METADATA_UNAVAILABLE;
            }
            if (strcmp(prior.module_name, imported.module_name) == 0 &&
                strcmp(prior.name, imported.name) == 0) {
                (void)snprintf(diagnostic, diagnostic_capacity,
                               "DUPLICATE_IMPORT import=%s.%s",
                               imported.module_name, imported.name);
                return WAMR_IMPORT_ABI_DUPLICATE_IMPORT;
            }
        }
        contract = find_contract(contracts, contract_count,
                                 imported.module_name, imported.name);
        if (contract == NULL) {
            (void)snprintf(diagnostic, diagnostic_capacity,
                           "UNAPPROVED_IMPORT import=%s.%s",
                           imported.module_name, imported.name);
            return WAMR_IMPORT_ABI_UNAPPROVED_IMPORT;
        }
        if (imported.kind != WASM_IMPORT_EXPORT_KIND_FUNC) {
            (void)snprintf(diagnostic, diagnostic_capacity,
                           "UNSUPPORTED_KIND import=%s.%s",
                           imported.module_name, imported.name);
            return WAMR_IMPORT_ABI_UNSUPPORTED_KIND;
        }
        if (!signature_matches(imported.u.func_type, contract)) {
            (void)snprintf(diagnostic, diagnostic_capacity,
                           "SIGNATURE_MISMATCH import=%s.%s",
                           imported.module_name, imported.name);
            return WAMR_IMPORT_ABI_SIGNATURE_MISMATCH;
        }
        if (!imported.linked) {
            (void)snprintf(diagnostic, diagnostic_capacity,
                           "UNLINKED_IMPORT import=%s.%s",
                           imported.module_name, imported.name);
            return WAMR_IMPORT_ABI_UNLINKED_IMPORT;
        }
    }

    set_diagnostic(diagnostic, diagnostic_capacity, "exact import ABI accepted");
    return WAMR_IMPORT_ABI_VALID;
}

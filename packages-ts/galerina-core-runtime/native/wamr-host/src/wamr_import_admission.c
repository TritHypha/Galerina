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

static int valid_contracts(const wamr_function_import_contract_t *contracts,
                           size_t contract_count)
{
    size_t i;
    size_t j;

    if (contract_count > 0 && contracts == NULL) return 0;
    for (i = 0; i < contract_count; ++i) {
        const wamr_function_import_contract_t *contract = &contracts[i];
        if (contract->module_name == NULL || contract->module_name[0] == '\0' ||
            contract->name == NULL || contract->name[0] == '\0' ||
            (contract->parameter_count > 0 && contract->parameter_kinds == NULL) ||
            (contract->result_count > 0 && contract->result_kinds == NULL) ||
            contract->parameter_count > UINT32_MAX ||
            contract->result_count > UINT32_MAX) {
            return 0;
        }
        for (j = 0; j < i; ++j) {
            if (strcmp(contracts[j].module_name, contract->module_name) == 0 &&
                strcmp(contracts[j].name, contract->name) == 0) {
                return 0;
            }
        }
    }
    return 1;
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
    uint32_t import_count;
    uint32_t i;

    if (diagnostic == NULL || diagnostic_capacity == 0) {
        return WAMR_IMPORT_ABI_INVALID_ARGUMENT;
    }
    diagnostic[0] = '\0';
    if (module == NULL || !valid_contracts(contracts, contract_count)) {
        set_diagnostic(diagnostic, diagnostic_capacity,
                       "invalid module or function-import contract table");
        return WAMR_IMPORT_ABI_INVALID_ARGUMENT;
    }

    import_count = wasm_runtime_get_import_count(module);
    for (i = 0; i < import_count; ++i) {
        wasm_import_t imported = { 0 };
        const wamr_function_import_contract_t *contract;

        wasm_runtime_get_import_type(module, i, &imported);
        if (imported.module_name == NULL || imported.name == NULL) {
            set_diagnostic(diagnostic, diagnostic_capacity,
                           "module import is missing its module or name");
            return WAMR_IMPORT_ABI_INVALID_ARGUMENT;
        }
        contract = find_contract(contracts, contract_count,
                                 imported.module_name, imported.name);
        if (contract == NULL) {
            set_diagnostic(diagnostic, diagnostic_capacity,
                           "module contains an import outside the closed allowlist");
            return WAMR_IMPORT_ABI_UNAPPROVED_IMPORT;
        }
        if (imported.kind != WASM_IMPORT_EXPORT_KIND_FUNC) {
            set_diagnostic(diagnostic, diagnostic_capacity,
                           "allowlisted import is not a function");
            return WAMR_IMPORT_ABI_UNSUPPORTED_KIND;
        }
        if (!signature_matches(imported.u.func_type, contract)) {
            set_diagnostic(diagnostic, diagnostic_capacity,
                           "allowlisted function import has a signature mismatch");
            return WAMR_IMPORT_ABI_SIGNATURE_MISMATCH;
        }
    }

    set_diagnostic(diagnostic, diagnostic_capacity, "exact import ABI accepted");
    return WAMR_IMPORT_ABI_VALID;
}

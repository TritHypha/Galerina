#include "wamr_secrets_gateway_host.h"

#include <stdio.h>
#include <string.h>

/*
 * CONTRACT_TABLE_BEGIN
 * kind|resource|wit|core|params|results
 * ROW|iface||issue-password-verification-grant|issue-password-verification-grant|i32,i32|
 * ROW|iface||acquire-password-lease|acquire-password-lease|i32,i32,i32|
 * ROW|iface||close-secret-lease|close-secret-lease|i32,i32|
 * ROW|iface||release-verification-result|release-verification-result|i32,i32,i32,i32,i32|
 * ROW|method|release-receipt|state|[method]release-receipt.state|i32|i32
 * ROW|method|secret-lease|state|[method]secret-lease.state|i32|i32
 * ROW|method|secret-lease|accounting|[method]secret-lease.accounting|i32,i32|
 * ROW|method|secret-lease|verify-password|[method]secret-lease.verify-password|i32,i32,i32,i32|
 * ROW|drop|authenticated-request||[resource-drop]authenticated-request|i32|
 * ROW|drop|signet-grant||[resource-drop]signet-grant|i32|
 * ROW|drop|secret-lease||[resource-drop]secret-lease|i32|
 * ROW|drop|cleanup-receipt||[resource-drop]cleanup-receipt|i32|
 * ROW|drop|verification-result||[resource-drop]verification-result|i32|
 * ROW|drop|release-receipt||[resource-drop]release-receipt|i32|
 * CONTRACT_TABLE_END
 *
 * Import module (wit-bindgen name_world_key / component-model package
 * interface encoding): galerina:secrets-vault/secrets-gateway@0.1.0
 * Core names: interface funcs keep the WIT name; resource methods use
 * [method]resource.method; owned resources imply [resource-drop]resource
 * (Canonical ABI canon_resource_drop; wit-bindgen C import_name).
 * Lowering: flatten_functype(..., context='lower'), MAX_FLAT_RESULTS=1.
 */

static const char k_import_module[] =
    "galerina:secrets-vault/secrets-gateway@0.1.0";

static const uint8_t k_i32[] = { WASM_I32 };
static const uint8_t k_i32x2[] = { WASM_I32, WASM_I32 };
static const uint8_t k_i32x3[] = { WASM_I32, WASM_I32, WASM_I32 };
static const uint8_t k_i32x4[] = { WASM_I32, WASM_I32, WASM_I32, WASM_I32 };
static const uint8_t k_i32x5[] = { WASM_I32, WASM_I32, WASM_I32, WASM_I32, WASM_I32 };

static const wamr_function_import_contract_t k_contracts[] = {
    { k_import_module, "issue-password-verification-grant", k_i32x2, 2, NULL, 0 },
    { k_import_module, "acquire-password-lease", k_i32x3, 3, NULL, 0 },
    { k_import_module, "close-secret-lease", k_i32x2, 2, NULL, 0 },
    { k_import_module, "release-verification-result", k_i32x5, 5, NULL, 0 },
    { k_import_module, "[method]release-receipt.state", k_i32, 1, k_i32, 1 },
    { k_import_module, "[method]secret-lease.state", k_i32, 1, k_i32, 1 },
    { k_import_module, "[method]secret-lease.accounting", k_i32x2, 2, NULL, 0 },
    { k_import_module, "[method]secret-lease.verify-password", k_i32x4, 4, NULL, 0 },
    { k_import_module, "[resource-drop]authenticated-request", k_i32, 1, NULL, 0 },
    { k_import_module, "[resource-drop]signet-grant", k_i32, 1, NULL, 0 },
    { k_import_module, "[resource-drop]secret-lease", k_i32, 1, NULL, 0 },
    { k_import_module, "[resource-drop]cleanup-receipt", k_i32, 1, NULL, 0 },
    { k_import_module, "[resource-drop]verification-result", k_i32, 1, NULL, 0 },
    { k_import_module, "[resource-drop]release-receipt", k_i32, 1, NULL, 0 },
};

static int natives_registered;

static int32_t sg_stub_i_i(wasm_exec_env_t exec_env, int32_t a)
{
    (void)exec_env;
    (void)a;
    return 0;
}

static void sg_stub_i(wasm_exec_env_t exec_env, int32_t a)
{
    (void)exec_env;
    (void)a;
}

static void sg_stub_ii(wasm_exec_env_t exec_env, int32_t a, int32_t b)
{
    (void)exec_env;
    (void)a;
    (void)b;
}

static void sg_stub_iii(wasm_exec_env_t exec_env, int32_t a, int32_t b, int32_t c)
{
    (void)exec_env;
    (void)a;
    (void)b;
    (void)c;
}

static void sg_stub_iiii(wasm_exec_env_t exec_env, int32_t a, int32_t b, int32_t c,
                         int32_t d)
{
    (void)exec_env;
    (void)a;
    (void)b;
    (void)c;
    (void)d;
}

static void sg_stub_iiiii(wasm_exec_env_t exec_env, int32_t a, int32_t b, int32_t c,
                          int32_t d, int32_t e)
{
    (void)exec_env;
    (void)a;
    (void)b;
    (void)c;
    (void)d;
    (void)e;
}

static NativeSymbol sg_natives[] = {
    { "issue-password-verification-grant", (void *)sg_stub_ii, "(ii)", NULL },
    { "acquire-password-lease", (void *)sg_stub_iii, "(iii)", NULL },
    { "close-secret-lease", (void *)sg_stub_ii, "(ii)", NULL },
    { "release-verification-result", (void *)sg_stub_iiiii, "(iiiii)", NULL },
    { "[method]release-receipt.state", (void *)sg_stub_i_i, "(i)i", NULL },
    { "[method]secret-lease.state", (void *)sg_stub_i_i, "(i)i", NULL },
    { "[method]secret-lease.accounting", (void *)sg_stub_ii, "(ii)", NULL },
    { "[method]secret-lease.verify-password", (void *)sg_stub_iiii, "(iiii)", NULL },
    { "[resource-drop]authenticated-request", (void *)sg_stub_i, "(i)", NULL },
    { "[resource-drop]signet-grant", (void *)sg_stub_i, "(i)", NULL },
    { "[resource-drop]secret-lease", (void *)sg_stub_i, "(i)", NULL },
    { "[resource-drop]cleanup-receipt", (void *)sg_stub_i, "(i)", NULL },
    { "[resource-drop]verification-result", (void *)sg_stub_i, "(i)", NULL },
    { "[resource-drop]release-receipt", (void *)sg_stub_i, "(i)", NULL },
};

const char *wamr_secrets_gateway_import_module(void)
{
    return k_import_module;
}

size_t wamr_secrets_gateway_contract_count(void)
{
    return sizeof(k_contracts) / sizeof(k_contracts[0]);
}

const wamr_function_import_contract_t *wamr_secrets_gateway_contracts(void)
{
    return k_contracts;
}

const char *wamr_secrets_gateway_result_name(wamr_secrets_gateway_result_t result)
{
    switch (result) {
        case WAMR_SECRETS_GATEWAY_VALID:
            return "VALID";
        case WAMR_SECRETS_GATEWAY_INVALID_ARGUMENT:
            return "INVALID_ARGUMENT";
        case WAMR_SECRETS_GATEWAY_UNAPPROVED_IMPORT:
            return "UNAPPROVED_IMPORT";
        case WAMR_SECRETS_GATEWAY_UNSUPPORTED_KIND:
            return "UNSUPPORTED_KIND";
        case WAMR_SECRETS_GATEWAY_SIGNATURE_MISMATCH:
            return "SIGNATURE_MISMATCH";
        case WAMR_SECRETS_GATEWAY_DUPLICATE_IMPORT:
            return "DUPLICATE_IMPORT";
        case WAMR_SECRETS_GATEWAY_UNLINKED_IMPORT:
            return "UNLINKED_IMPORT";
        case WAMR_SECRETS_GATEWAY_METADATA_UNAVAILABLE:
            return "METADATA_UNAVAILABLE";
        case WAMR_SECRETS_GATEWAY_LOAD_FAILED:
            return "LOAD_FAILED";
        case WAMR_SECRETS_GATEWAY_INSTANTIATE_FAILED:
            return "INSTANTIATE_FAILED";
        default:
            return "UNKNOWN";
    }
}

bool wamr_secrets_gateway_register_natives(void)
{
    if (natives_registered) {
        return true;
    }
    if (!wasm_runtime_register_natives(
            k_import_module, sg_natives,
            (uint32_t)(sizeof(sg_natives) / sizeof(sg_natives[0])))) {
        return false;
    }
    natives_registered = 1;
    return true;
}

static void set_code_diagnostic(char *diagnostic, size_t capacity,
                                wamr_secrets_gateway_result_t result,
                                const char *detail)
{
    if (diagnostic == NULL || capacity == 0) {
        return;
    }
    if (detail != NULL && detail[0] != '\0') {
        (void)snprintf(diagnostic, capacity, "code=%s %s",
                       wamr_secrets_gateway_result_name(result), detail);
    } else {
        (void)snprintf(diagnostic, capacity, "code=%s",
                       wamr_secrets_gateway_result_name(result));
    }
}

static void release_loaded(wamr_secrets_gateway_loaded_t *loaded)
{
    if (loaded == NULL) {
        return;
    }
    if (loaded->instance != NULL) {
        wasm_runtime_deinstantiate(loaded->instance);
        loaded->instance = NULL;
    }
    if (loaded->module != NULL) {
        wasm_runtime_unload(loaded->module);
        loaded->module = NULL;
    }
}

static wamr_secrets_gateway_result_t map_admission(wamr_import_abi_result_t admission)
{
    switch (admission) {
        case WAMR_IMPORT_ABI_VALID:
            return WAMR_SECRETS_GATEWAY_VALID;
        case WAMR_IMPORT_ABI_INVALID_ARGUMENT:
            return WAMR_SECRETS_GATEWAY_INVALID_ARGUMENT;
        case WAMR_IMPORT_ABI_UNAPPROVED_IMPORT:
            return WAMR_SECRETS_GATEWAY_UNAPPROVED_IMPORT;
        case WAMR_IMPORT_ABI_UNSUPPORTED_KIND:
            return WAMR_SECRETS_GATEWAY_UNSUPPORTED_KIND;
        case WAMR_IMPORT_ABI_SIGNATURE_MISMATCH:
            return WAMR_SECRETS_GATEWAY_SIGNATURE_MISMATCH;
        case WAMR_IMPORT_ABI_DUPLICATE_IMPORT:
            return WAMR_SECRETS_GATEWAY_DUPLICATE_IMPORT;
        case WAMR_IMPORT_ABI_UNLINKED_IMPORT:
            return WAMR_SECRETS_GATEWAY_UNLINKED_IMPORT;
        case WAMR_IMPORT_ABI_METADATA_UNAVAILABLE:
            return WAMR_SECRETS_GATEWAY_METADATA_UNAVAILABLE;
        default:
            return WAMR_SECRETS_GATEWAY_INVALID_ARGUMENT;
    }
}

wamr_secrets_gateway_result_t wamr_secrets_gateway_load(
    uint8_t *buf,
    uint32_t size,
    wamr_secrets_gateway_loaded_t *out,
    char *diagnostic,
    size_t diagnostic_capacity)
{
    char error[256];
    char admission_diag[256];
    wasm_module_t module;
    wasm_module_inst_t instance;
    wamr_import_abi_result_t admission;
    wamr_secrets_gateway_result_t result;

    if (diagnostic == NULL || diagnostic_capacity == 0 || out == NULL) {
        if (diagnostic != NULL && diagnostic_capacity > 0) {
            diagnostic[0] = '\0';
            set_code_diagnostic(diagnostic, diagnostic_capacity,
                                WAMR_SECRETS_GATEWAY_INVALID_ARGUMENT, NULL);
        }
        return WAMR_SECRETS_GATEWAY_INVALID_ARGUMENT;
    }
    diagnostic[0] = '\0';
    out->module = NULL;
    out->instance = NULL;
    if (buf == NULL || size == 0) {
        set_code_diagnostic(diagnostic, diagnostic_capacity,
                            WAMR_SECRETS_GATEWAY_INVALID_ARGUMENT, NULL);
        return WAMR_SECRETS_GATEWAY_INVALID_ARGUMENT;
    }

    error[0] = '\0';
    module = wasm_runtime_load(buf, size, error, sizeof(error));
    if (module == NULL) {
        set_code_diagnostic(diagnostic, diagnostic_capacity,
                            WAMR_SECRETS_GATEWAY_LOAD_FAILED, error);
        return WAMR_SECRETS_GATEWAY_LOAD_FAILED;
    }
    out->module = module;

    admission_diag[0] = '\0';
    admission = wamr_validate_module_import_abi(
        module, k_contracts, sizeof(k_contracts) / sizeof(k_contracts[0]),
        admission_diag, sizeof(admission_diag));
    if (admission != WAMR_IMPORT_ABI_VALID) {
        result = map_admission(admission);
        set_code_diagnostic(diagnostic, diagnostic_capacity, result,
                            admission_diag);
        release_loaded(out);
        return result;
    }

    error[0] = '\0';
    instance = wasm_runtime_instantiate(module, WAMR_SECRETS_GATEWAY_STACK_SIZE,
                                        WAMR_SECRETS_GATEWAY_HEAP_SIZE, error,
                                        sizeof(error));
    if (instance == NULL) {
        set_code_diagnostic(diagnostic, diagnostic_capacity,
                            WAMR_SECRETS_GATEWAY_INSTANTIATE_FAILED, error);
        release_loaded(out);
        return WAMR_SECRETS_GATEWAY_INSTANTIATE_FAILED;
    }
    out->instance = instance;
    set_code_diagnostic(diagnostic, diagnostic_capacity, WAMR_SECRETS_GATEWAY_VALID,
                        admission_diag);
    return WAMR_SECRETS_GATEWAY_VALID;
}

void wamr_secrets_gateway_release(wamr_secrets_gateway_loaded_t *loaded)
{
    release_loaded(loaded);
}

#define _POSIX_C_SOURCE 200809L

#include <errno.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/* Bound this test probe's fixture loader; this is not a runtime policy limit. */
#define RD1413_PROBE_MAX_WASM_BYTES (1024u * 1024u)

#include "wasm_export.h"
#include "wamr_import_admission.h"

struct operation_context {
    uint32_t host_only_marker;
    int valid;
    uint32_t calls;
};

static uint32_t callback_entries;

static int32_t host_operation_context(wasm_exec_env_t exec_env)
{
    callback_entries += 1;
    wasm_module_inst_t module = wasm_runtime_get_module_inst(exec_env);
    struct operation_context *context =
        (struct operation_context *)wasm_runtime_get_custom_data(module);

    if (context == NULL || !context->valid || context->host_only_marker == 0) {
        wasm_runtime_set_exception(module, "missing or invalid host operation context");
        return 0;
    }
    context->calls += 1;
    return 0;
}

static NativeSymbol native_symbols[] = {
    { "operation_context", (void *)host_operation_context, "()i", NULL },
};

static const uint8_t operation_context_result_kinds[] = { WASM_I32 };
static const wamr_function_import_contract_t operation_context_contract = {
    "host", "operation_context", NULL, 0,
    operation_context_result_kinds, 1,
};

static uint8_t *read_bytes(const char *path, uint32_t *size)
{
    FILE *file = fopen(path, "rb");
    long length;
    uint8_t *bytes;

    if (file == NULL || fseek(file, 0, SEEK_END) != 0 ||
        (length = ftell(file)) <= 0) {
        if (file != NULL) fclose(file);
        return NULL;
    }
    if ((unsigned long)length > RD1413_PROBE_MAX_WASM_BYTES) {
        fclose(file);
        errno = EFBIG;
        return NULL;
    }
    if (fseek(file, 0, SEEK_SET) != 0) {
        fclose(file);
        return NULL;
    }
    bytes = (uint8_t *)malloc((size_t)length);
    if (bytes == NULL || fread(bytes, 1, (size_t)length, file) != (size_t)length) {
        free(bytes);
        fclose(file);
        return NULL;
    }
    fclose(file);
    *size = (uint32_t)length;
    return bytes;
}

static wasm_module_inst_t instantiate(wasm_module_t module, const char *label)
{
    char error[256] = { 0 };
    wasm_module_inst_t instance = wasm_runtime_instantiate(module, 16384, 0,
                                                           error, sizeof(error));
    if (instance == NULL)
        fprintf(stderr, "%s instantiate failed: %s\n", label, error);
    return instance;
}

static int get_operation_context_import(wasm_module_t module,
                                       wasm_import_t *import_type)
{
    if (module == NULL || import_type == NULL ||
        wasm_runtime_get_import_count(module) != 1) {
        return 0;
    }
    wasm_runtime_get_import_type(module, 0, import_type);
    if (import_type->module_name == NULL || import_type->name == NULL ||
        strcmp(import_type->module_name, "host") != 0 ||
        strcmp(import_type->name, "operation_context") != 0) {
        return 0;
    }
    return 1;
}

static int has_expected_operation_context_signature(wasm_module_t module)
{
    wasm_import_t import_type = { 0 };

    if (!get_operation_context_import(module, &import_type) ||
        import_type.kind != WASM_IMPORT_EXPORT_KIND_FUNC ||
        import_type.u.func_type == NULL) {
        return 0;
    }

    return wasm_func_type_get_param_count(import_type.u.func_type) == 0 &&
           wasm_func_type_get_result_count(import_type.u.func_type) == 1 &&
           wasm_func_type_get_result_valkind(import_type.u.func_type, 0) == WASM_I32;
}

static int invoke(wasm_module_inst_t instance, const char *label,
                  int should_succeed)
{
    wasm_exec_env_t env = wasm_runtime_create_exec_env(instance, 16384);
    wasm_function_inst_t function =
        wasm_runtime_lookup_function(instance, "read_operation_context");
    uint32_t result[1] = { 0 };
    int ok;

    if (env == NULL || function == NULL) {
        fprintf(stderr, "%s setup failed\n", label);
        if (env != NULL) wasm_runtime_destroy_exec_env(env);
        return 0;
    }
    ok = wasm_runtime_call_wasm(env, function, 0, result);
    if (should_succeed) {
        if (!ok || result[0] != 0) {
            fprintf(stderr, "%s expected generic success; ok=%d result=%u exception=%s\n",
                    label, ok, result[0], wasm_runtime_get_exception(instance));
            wasm_runtime_destroy_exec_env(env);
            return 0;
        }
    } else if (ok || wasm_runtime_get_exception(instance) == NULL ||
               wasm_runtime_get_exception(instance)[0] == '\0') {
        fprintf(stderr, "%s expected a fail-closed trap; ok=%d result=%u\n",
                label, ok, result[0]);
        wasm_runtime_destroy_exec_env(env);
        return 0;
    }
    wasm_runtime_destroy_exec_env(env);
    return 1;
}

static int check_mismatched_signature(const char *path)
{
    uint32_t wasm_size = 0;
    uint8_t *wasm_bytes = read_bytes(path, &wasm_size);
    char error[256] = { 0 };
    wasm_module_t module;
    uint32_t callback_entries_before = callback_entries;

    if (wasm_bytes == NULL) {
        fprintf(stderr, "could not read mismatched-signature Wasm fixture\n");
        return 0;
    }
    module = wasm_runtime_load(wasm_bytes, wasm_size, error, sizeof(error));
    if (module == NULL) {
        fprintf(stderr, "mismatched-signature module failed to load before its import metadata could be checked: %s\n",
                error);
        free(wasm_bytes);
        return 0;
    }

    if (has_expected_operation_context_signature(module)) {
        fprintf(stderr, "mismatched-signature fixture unexpectedly matches the host ABI\n");
        wasm_runtime_unload(module);
        free(wasm_bytes);
        return 0;
    }
    {
        wasm_import_t import_type = { 0 };
        if (!get_operation_context_import(module, &import_type) ||
            import_type.kind != WASM_IMPORT_EXPORT_KIND_FUNC ||
            import_type.u.func_type == NULL) {
            fprintf(stderr, "mismatched-signature fixture is not the expected host function import\n");
            wasm_runtime_unload(module);
            free(wasm_bytes);
            return 0;
        }
        if (wasm_func_type_get_param_count(import_type.u.func_type) != 1 ||
            wasm_func_type_get_param_valkind(import_type.u.func_type, 0) != WASM_I64 ||
            wasm_func_type_get_result_count(import_type.u.func_type) != 1 ||
            wasm_func_type_get_result_valkind(import_type.u.func_type, 0) != WASM_I64) {
            fprintf(stderr, "mismatched-signature fixture is not the intended i64 -> i64 import\n");
            wasm_runtime_unload(module);
            free(wasm_bytes);
            return 0;
        }
        puts("PASS: WAMR import metadata exposes the mismatched i64 -> i64 signature before instantiation");
    }
    {
        char diagnostic[256] = { 0 };
        if (wamr_validate_module_import_abi(module, &operation_context_contract, 1,
                                             diagnostic, sizeof(diagnostic)) !=
                WAMR_IMPORT_ABI_SIGNATURE_MISMATCH ||
            callback_entries != callback_entries_before) {
            fprintf(stderr,
                    "mismatched import must be refused before instance creation: %s\n",
                    diagnostic[0] == '\0' ? "(no diagnostic)" : diagnostic);
            wasm_runtime_unload(module);
            free(wasm_bytes);
            return 0;
        }
    }
    wasm_runtime_unload(module);
    free(wasm_bytes);
    puts("PASS: host ABI gate rejects mismatched imports before instance creation");
    return callback_entries == callback_entries_before;
}

static int check_unapproved_import(const char *path)
{
    uint32_t wasm_size = 0;
    uint8_t *wasm_bytes = read_bytes(path, &wasm_size);
    char error[256] = { 0 };
    char diagnostic[256] = { 0 };
    wasm_module_t module;
    uint32_t callback_entries_before = callback_entries;
    wamr_import_abi_result_t result;

    if (wasm_bytes == NULL) {
        fprintf(stderr, "could not read unapproved-import Wasm fixture\n");
        return 0;
    }
    module = wasm_runtime_load(wasm_bytes, wasm_size, error, sizeof(error));
    if (module == NULL) {
        fprintf(stderr, "unapproved-import module could not be parsed: %s\n", error);
        free(wasm_bytes);
        return 0;
    }
    result = wamr_validate_module_import_abi(module, &operation_context_contract, 1,
                                              diagnostic, sizeof(diagnostic));
    wasm_runtime_unload(module);
    free(wasm_bytes);
    if (result != WAMR_IMPORT_ABI_UNAPPROVED_IMPORT ||
        callback_entries != callback_entries_before) {
        fprintf(stderr, "unapproved import must be rejected before instance creation: %s\n",
                diagnostic[0] == '\0' ? "(no diagnostic)" : diagnostic);
        return 0;
    }
    puts("PASS: host ABI gate rejects imports outside the closed allowlist");
    return 1;
}

static int check_unsupported_import_kind(const char *path)
{
    uint32_t wasm_size = 0;
    uint8_t *wasm_bytes = read_bytes(path, &wasm_size);
    char error[256] = { 0 };
    char diagnostic[256] = { 0 };
    wasm_module_t module;
    uint32_t callback_entries_before = callback_entries;
    wamr_import_abi_result_t result;

    if (wasm_bytes == NULL) {
        fprintf(stderr, "could not read non-function-import Wasm fixture\n");
        return 0;
    }
    module = wasm_runtime_load(wasm_bytes, wasm_size, error, sizeof(error));
    if (module == NULL) {
        fprintf(stderr, "non-function-import module could not be parsed: %s\n", error);
        free(wasm_bytes);
        return 0;
    }
    result = wamr_validate_module_import_abi(module, &operation_context_contract, 1,
                                              diagnostic, sizeof(diagnostic));
    wasm_runtime_unload(module);
    free(wasm_bytes);
    if (result != WAMR_IMPORT_ABI_UNSUPPORTED_KIND ||
        callback_entries != callback_entries_before) {
        fprintf(stderr, "non-function import must be refused before instance creation: %s\n",
                diagnostic[0] == '\0' ? "(no diagnostic)" : diagnostic);
        return 0;
    }
    puts("PASS: host ABI gate rejects non-function imports before instance creation");
    return 1;
}

static int check_invalid_contract_valkind(wasm_module_t module)
{
    const uint8_t invalid_parameter_kinds[] = { UINT8_MAX };
    const uint8_t invalid_result_kinds[] = { UINT8_MAX };
    const uint8_t unsupported_v128_result_kinds[] = { WASM_V128 };
    const uint8_t unsupported_externref_result_kinds[] = { WASM_EXTERNREF };
    const wamr_function_import_contract_t invalid_parameter_contract = {
        "host", "operation_context", invalid_parameter_kinds, 1,
        NULL, 0,
    };
    const wamr_function_import_contract_t invalid_result_contract = {
        "host", "operation_context", NULL, 0,
        invalid_result_kinds, 1,
    };
    const wamr_function_import_contract_t unsupported_v128_result_contract = {
        "host", "operation_context", NULL, 0,
        unsupported_v128_result_kinds, 1,
    };
    const wamr_function_import_contract_t unsupported_externref_result_contract = {
        "host", "operation_context", NULL, 0,
        unsupported_externref_result_kinds, 1,
    };
    char diagnostic[256] = { 0 };

    if (wamr_validate_module_import_abi(module, &invalid_parameter_contract, 1,
                                        diagnostic, sizeof(diagnostic)) !=
        WAMR_IMPORT_ABI_UNSUPPORTED_KIND) {
        fprintf(stderr, "invalid contract parameter valkind must be refused as invalid input: %s\n",
                diagnostic[0] == '\0' ? "(no diagnostic)" : diagnostic);
        return 0;
    }
    if (wamr_validate_module_import_abi(module, &invalid_result_contract, 1,
                                        diagnostic, sizeof(diagnostic)) !=
        WAMR_IMPORT_ABI_UNSUPPORTED_KIND) {
        fprintf(stderr, "invalid contract valkind must be refused as invalid input: %s\n",
                diagnostic[0] == '\0' ? "(no diagnostic)" : diagnostic);
        return 0;
    }
    if (wamr_validate_module_import_abi(module,
                                        &unsupported_v128_result_contract, 1,
                                        diagnostic, sizeof(diagnostic)) !=
        WAMR_IMPORT_ABI_UNSUPPORTED_KIND) {
        fprintf(stderr, "unsupported v128 result contract must be refused before type access: %s\n",
                diagnostic[0] == '\0' ? "(no diagnostic)" : diagnostic);
        return 0;
    }
    if (wamr_validate_module_import_abi(module,
                                        &unsupported_externref_result_contract, 1,
                                        diagnostic, sizeof(diagnostic)) !=
        WAMR_IMPORT_ABI_UNSUPPORTED_KIND) {
        fprintf(stderr, "unsupported externref result contract must be refused before type access: %s\n",
                diagnostic[0] == '\0' ? "(no diagnostic)" : diagnostic);
        return 0;
    }
    puts("PASS: host ABI gate rejects invalid valkind bytes and unsupported result kinds");
    return 1;
}

static int check_oversized_fixture_rejected(const char *path)
{
    uint32_t size = 0;
    uint8_t *bytes;

    errno = 0;
    bytes = read_bytes(path, &size);
    if (bytes != NULL || errno != EFBIG || size != 0) {
        free(bytes);
        fprintf(stderr,
                "oversized Wasm fixture must be refused specifically by the size bound (reported_size=%u errno=%d)\n",
                size, errno);
        return 0;
    }
    puts("PASS: WAMR probe refuses an oversized Wasm input before allocation");
    return 1;
}

static int check_limit_fixture_accepted(const char *path)
{
    uint32_t size = 0;
    uint32_t i;
    uint8_t *bytes = read_bytes(path, &size);

    if (bytes == NULL || size != RD1413_PROBE_MAX_WASM_BYTES) {
        free(bytes);
        fprintf(stderr,
                "Wasm fixture exactly at the probe size bound must be fully accepted (reported_size=%u)\n",
                size);
        return 0;
    }
    for (i = 0; i < size; ++i) {
        if (bytes[i] != 0xA5) {
            free(bytes);
            fprintf(stderr,
                    "Wasm fixture at the probe size bound was not fully read (first mismatch at byte %u)\n",
                    i);
            return 0;
        }
    }
    free(bytes);
    puts("PASS: WAMR probe accepts and fully reads a fixture exactly at its size bound");
    return 1;
}

static int check_unlinked_import(const char *path)
{
    const uint8_t result_kinds[] = { WASM_I32 };
    const wamr_function_import_contract_t contract = {
        "host", "unregistered_operation", NULL, 0, result_kinds, 1,
    };
    uint32_t wasm_size = 0;
    uint8_t *wasm_bytes = read_bytes(path, &wasm_size);
    char error[256] = { 0 };
    char diagnostic[256] = { 0 };
    wasm_module_t module;
    wasm_import_t imported = { 0 };
    wamr_import_abi_result_t result;

    if (wasm_bytes == NULL) {
        fprintf(stderr, "could not read unlinked-import Wasm fixture\n");
        return 0;
    }
    module = wasm_runtime_load(wasm_bytes, wasm_size, error, sizeof(error));
    if (module == NULL) {
        fprintf(stderr, "unlinked-import module failed to load: %s\n", error);
        free(wasm_bytes);
        return 0;
    }
    wasm_runtime_get_import_type(module, 0, &imported);
    if (imported.linked) {
        fprintf(stderr, "unregistered import unexpectedly reports linked\n");
        wasm_runtime_unload(module);
        free(wasm_bytes);
        return 0;
    }
    result = wamr_validate_module_import_abi(module, &contract, 1,
                                              diagnostic, sizeof(diagnostic));
    wasm_runtime_unload(module);
    free(wasm_bytes);
    if (result != WAMR_IMPORT_ABI_UNLINKED_IMPORT) {
        fprintf(stderr, "ABI-shaped but unlinked import must be refused before instantiation\n");
        return 0;
    }
    puts("PASS: host ABI gate refuses a matching but unlinked native import");
    return 1;
}

static int check_duplicate_imports(const char *path)
{
    const uint8_t result_kinds[] = { WASM_I32 };
    const wamr_function_import_contract_t contracts[] = {
        { "host", "operation_context", NULL, 0, result_kinds, 1 },
        { "host", "other_operation", NULL, 0, result_kinds, 1 },
    };
    uint32_t wasm_size = 0;
    uint8_t *wasm_bytes = read_bytes(path, &wasm_size);
    char error[256] = { 0 };
    char diagnostic[256] = { 0 };
    wasm_module_t module;
    wamr_import_abi_result_t result;

    if (wasm_bytes == NULL) {
        fprintf(stderr, "could not read duplicate-import Wasm fixture\n");
        return 0;
    }
    module = wasm_runtime_load(wasm_bytes, wasm_size, error, sizeof(error));
    if (module == NULL) {
        fprintf(stderr, "duplicate-import module failed to load: %s\n", error);
        free(wasm_bytes);
        return 0;
    }
    result = wamr_validate_module_import_abi(module, contracts, 2,
                                              diagnostic, sizeof(diagnostic));
    wasm_runtime_unload(module);
    free(wasm_bytes);
    if (result != WAMR_IMPORT_ABI_DUPLICATE_IMPORT) {
        fprintf(stderr, "duplicate imports must be rejected by the closed import contract\n");
        return 0;
    }
    puts("PASS: host ABI gate rejects duplicate module imports");
    return 1;
}

static int check_prior_import_metadata_unavailable(const char *path)
{
    const uint8_t result_kinds[] = { WASM_I32 };
    const wamr_function_import_contract_t contracts[] = {
        { "host", "operation_context", NULL, 0, result_kinds, 1 },
        { "host", "other_operation", NULL, 0, result_kinds, 1 },
    };
    uint32_t wasm_size = 0;
    uint8_t *wasm_bytes = read_bytes(path, &wasm_size);
    char error[256] = { 0 };
    char diagnostic[256] = { 0 };
    wasm_module_t module;
    uint32_t callback_entries_before = callback_entries;
    wamr_import_abi_result_t result;

    if (wasm_bytes == NULL) {
        fprintf(stderr, "could not read prior-import metadata Wasm fixture\n");
        return 0;
    }
    module = wasm_runtime_load(wasm_bytes, wasm_size, error, sizeof(error));
    if (module == NULL) {
        fprintf(stderr, "prior-import metadata module failed to load: %s\n", error);
        free(wasm_bytes);
        return 0;
    }
    if (setenv("RD1413_TEST_PRIOR_IMPORT_NAME_UNAVAILABLE", "1", 1) != 0) {
        fprintf(stderr, "could not enable prior-import metadata fault control\n");
        wasm_runtime_unload(module);
        free(wasm_bytes);
        return 0;
    }
    result = wamr_validate_module_import_abi(module, contracts, 2,
                                              diagnostic, sizeof(diagnostic));
    unsetenv("RD1413_TEST_PRIOR_IMPORT_NAME_UNAVAILABLE");
    wasm_runtime_unload(module);
    free(wasm_bytes);
    if (result != WAMR_IMPORT_ABI_METADATA_UNAVAILABLE ||
        callback_entries != callback_entries_before) {
        fprintf(stderr,
                "unavailable prior-import metadata must be refused before callback: %s\n",
                diagnostic[0] == '\0' ? "(no diagnostic)" : diagnostic);
        return 0;
    }
    puts("PASS: host ABI gate refuses unavailable prior-import metadata");
    return 1;
}

static int check_unsupported_module_result(const char *path)
{
    uint32_t wasm_size = 0;
    uint8_t *wasm_bytes = read_bytes(path, &wasm_size);
    char error[256] = { 0 };
    char diagnostic[256] = { 0 };
    wasm_module_t module;
    wamr_import_abi_result_t result;

    if (wasm_bytes == NULL) {
        fprintf(stderr, "could not read unsupported-result Wasm fixture\n");
        return 0;
    }
    module = wasm_runtime_load(wasm_bytes, wasm_size, error, sizeof(error));
    if (module == NULL) {
        fprintf(stderr, "unsupported-result module failed to load: %s\n", error);
        free(wasm_bytes);
        return 0;
    }
    result = wamr_validate_module_import_abi(module, &operation_context_contract, 1,
                                              diagnostic, sizeof(diagnostic));
    wasm_runtime_unload(module);
    free(wasm_bytes);
    if (result != WAMR_IMPORT_ABI_SIGNATURE_MISMATCH) {
        fprintf(stderr,
                "externref result must fail closed against the i32 contract: %s\n",
                diagnostic[0] == '\0' ? "(no diagnostic)" : diagnostic);
        return 0;
    }
    puts("PASS: host ABI gate classifies an externref result as a signature mismatch");
    return 1;
}

static int check_metadata_faults(const char *path)
{
    uint32_t wasm_size = 0;
    uint8_t *wasm_bytes = read_bytes(path, &wasm_size);
    char error[256] = { 0 };
    char diagnostic[256] = { 0 };
    wasm_module_t module;
    uint32_t callback_entries_before = callback_entries;
    wamr_import_abi_result_t result;

    if (wasm_bytes == NULL) {
        fprintf(stderr, "could not read metadata-fault Wasm fixture\n");
        return 0;
    }
    module = wasm_runtime_load(wasm_bytes, wasm_size, error, sizeof(error));
    if (module == NULL) {
        fprintf(stderr, "metadata-fault module failed to load: %s\n", error);
        free(wasm_bytes);
        return 0;
    }

    if (setenv("RD1413_TEST_IMPORT_COUNT_UNAVAILABLE", "1", 1) != 0) {
        fprintf(stderr, "could not enable import-count fault control\n");
        wasm_runtime_unload(module);
        free(wasm_bytes);
        return 0;
    }
    result = wamr_validate_module_import_abi(module, &operation_context_contract, 1,
                                              diagnostic, sizeof(diagnostic));
    unsetenv("RD1413_TEST_IMPORT_COUNT_UNAVAILABLE");
    if (result != WAMR_IMPORT_ABI_METADATA_UNAVAILABLE ||
        callback_entries != callback_entries_before) {
        fprintf(stderr, "unavailable import count was not refused as metadata unavailable: %s\n",
                diagnostic[0] == '\0' ? "(no diagnostic)" : diagnostic);
        wasm_runtime_unload(module);
        free(wasm_bytes);
        return 0;
    }
    puts("PASS: host ABI gate refuses unavailable import-count metadata");

    memset(diagnostic, 0, sizeof(diagnostic));
    if (setenv("RD1413_TEST_IMPORT_NAME_UNAVAILABLE", "1", 1) != 0) {
        fprintf(stderr, "could not enable import-name fault control\n");
        wasm_runtime_unload(module);
        free(wasm_bytes);
        return 0;
    }
    result = wamr_validate_module_import_abi(module, &operation_context_contract, 1,
                                              diagnostic, sizeof(diagnostic));
    unsetenv("RD1413_TEST_IMPORT_NAME_UNAVAILABLE");
    if (result != WAMR_IMPORT_ABI_INVALID_ARGUMENT ||
        callback_entries != callback_entries_before) {
        fprintf(stderr, "missing import name was not refused: %s\n",
                diagnostic[0] == '\0' ? "(no diagnostic)" : diagnostic);
        wasm_runtime_unload(module);
        free(wasm_bytes);
        return 0;
    }
    puts("PASS: host ABI gate refuses missing import-name metadata");

    memset(diagnostic, 0, sizeof(diagnostic));
    if (setenv("RD1413_TEST_IMPORT_FUNC_TYPE_UNAVAILABLE", "1", 1) != 0) {
        fprintf(stderr, "could not enable import-function-type fault control\n");
        wasm_runtime_unload(module);
        free(wasm_bytes);
        return 0;
    }
    result = wamr_validate_module_import_abi(module, &operation_context_contract, 1,
                                              diagnostic, sizeof(diagnostic));
    unsetenv("RD1413_TEST_IMPORT_FUNC_TYPE_UNAVAILABLE");
    wasm_runtime_unload(module);
    free(wasm_bytes);
    if (result != WAMR_IMPORT_ABI_SIGNATURE_MISMATCH ||
        callback_entries != callback_entries_before) {
        fprintf(stderr, "missing function-type metadata was not refused before callback: %s\n",
                diagnostic[0] == '\0' ? "(no diagnostic)" : diagnostic);
        return 0;
    }
    puts("PASS: host ABI gate refuses missing function-type metadata before callback");
    return 1;
}

int main(int argc, char **argv)
{
    uint32_t wasm_size = 0;
    uint8_t *wasm_bytes;
    char error[256] = { 0 };
    wasm_module_t module;
    wasm_module_inst_t instance_a;
    wasm_module_inst_t instance_b;
    wasm_module_inst_t instance_missing;
    struct operation_context context_a = { 101, 1, 0 };
    struct operation_context context_b = { 202, 1, 0 };
    int ok;

    if (argc == 3 &&
        (strcmp(argv[1], "--duplicate-imports") == 0 ||
         strcmp(argv[1], "--prior-import-metadata-fault") == 0 ||
         strcmp(argv[1], "--unlinked-import") == 0 ||
         strcmp(argv[1], "--externref-result") == 0)) {
        if (!wasm_runtime_init()) {
            fprintf(stderr, "runtime setup failed\n");
            return 2;
        }
        if (strcmp(argv[1], "--duplicate-imports") == 0) {
            if (!wasm_runtime_register_natives("host", native_symbols, 1)) {
                fprintf(stderr, "runtime/native registration setup failed\n");
                wasm_runtime_destroy();
                return 2;
            }
            ok = check_duplicate_imports(argv[2]);
        } else if (strcmp(argv[1], "--prior-import-metadata-fault") == 0) {
            if (!wasm_runtime_register_natives("host", native_symbols, 1)) {
                fprintf(stderr, "runtime/native registration setup failed\n");
                wasm_runtime_destroy();
                return 2;
            }
            ok = check_prior_import_metadata_unavailable(argv[2]);
        } else if (strcmp(argv[1], "--externref-result") == 0) {
            ok = check_unsupported_module_result(argv[2]);
        } else {
            if (!wasm_runtime_register_natives("host", native_symbols, 1)) {
                fprintf(stderr, "runtime/native registration setup failed\n");
                wasm_runtime_destroy();
                return 2;
            }
            ok = check_unlinked_import(argv[2]);
        }
        wasm_runtime_destroy();
        return ok ? 0 : 1;
    }
    if (argc == 3 && strcmp(argv[1], "--oversized-fixture") == 0) {
        return check_oversized_fixture_rejected(argv[2]) ? 0 : 1;
    }
    if (argc == 3 && strcmp(argv[1], "--limit-fixture") == 0) {
        return check_limit_fixture_accepted(argv[2]) ? 0 : 1;
    }
    if (argc == 3 && strcmp(argv[1], "--metadata-faults") == 0) {
        if (!wasm_runtime_init()) {
            fprintf(stderr, "runtime initialization failed for metadata-fault probe\n");
            return 2;
        }
        ok = check_metadata_faults(argv[2]);
        wasm_runtime_destroy();
        return ok ? 0 : 1;
    }

    if (argc != 7) {
        fprintf(stderr, "runtime/native registration setup failed\n");
        return 2;
    }
    if (!wasm_runtime_init()) {
        fprintf(stderr, "runtime initialization failed\n");
        return 2;
    }
    if (!wasm_runtime_register_natives("host", native_symbols, 1)) {
        fprintf(stderr, "runtime/native registration setup failed\n");
        wasm_runtime_destroy();
        return 2;
    }
    wasm_bytes = read_bytes(argv[1], &wasm_size);
    if (wasm_bytes == NULL) {
        fprintf(stderr, "could not read Wasm fixture\n");
        wasm_runtime_destroy();
        return 2;
    }
    module = wasm_runtime_load(wasm_bytes, wasm_size, error, sizeof(error));
    if (module == NULL) {
        fprintf(stderr, "module load failed: %s\n", error);
        free(wasm_bytes);
        wasm_runtime_destroy();
        return 2;
    }
    if (!has_expected_operation_context_signature(module)) {
        fprintf(stderr, "valid fixture did not match the expected host import ABI\n");
        wasm_runtime_unload(module);
        free(wasm_bytes);
        wasm_runtime_destroy();
        return 2;
    }
    {
        char diagnostic[256] = { 0 };
        if (wamr_validate_module_import_abi(module, &operation_context_contract, 1,
                                             diagnostic, sizeof(diagnostic)) !=
                WAMR_IMPORT_ABI_VALID) {
            fprintf(stderr, "valid fixture failed import admission: %s\n", diagnostic);
            wasm_runtime_unload(module);
            free(wasm_bytes);
            wasm_runtime_destroy();
            return 2;
        }
    }
    if (!check_invalid_contract_valkind(module)) {
        wasm_runtime_unload(module);
        free(wasm_bytes);
        wasm_runtime_destroy();
        return 1;
    }

    instance_a = instantiate(module, "A");
    instance_b = instantiate(module, "B");
    instance_missing = instantiate(module, "missing-context");
    if (instance_a == NULL || instance_b == NULL || instance_missing == NULL) {
        if (instance_a != NULL) wasm_runtime_deinstantiate(instance_a);
        if (instance_b != NULL) wasm_runtime_deinstantiate(instance_b);
        if (instance_missing != NULL) wasm_runtime_deinstantiate(instance_missing);
        wasm_runtime_unload(module);
        free(wasm_bytes);
        wasm_runtime_destroy();
        return 2;
    }

    wasm_runtime_set_custom_data(instance_a, &context_a);
    wasm_runtime_set_custom_data(instance_b, &context_b);
    ok = invoke(instance_a, "A", 1) && context_a.calls == 1 && context_b.calls == 0 &&
         invoke(instance_b, "B", 1) && context_b.calls == 1 && context_a.calls == 1 &&
         invoke(instance_missing, "missing-context", 0);

    wasm_runtime_deinstantiate(instance_missing);
    wasm_runtime_deinstantiate(instance_b);
    wasm_runtime_deinstantiate(instance_a);
    wasm_runtime_unload(module);
    free(wasm_bytes);
    if (!ok) {
        wasm_runtime_destroy();
        return 1;
    }
    if (!check_mismatched_signature(argv[2]) ||
        !check_unapproved_import(argv[3]) ||
        !check_unsupported_import_kind(argv[4]) ||
        !check_duplicate_imports(argv[5]) ||
        !check_unlinked_import(argv[6])) {
        wasm_runtime_destroy();
        return 1;
    }
    wasm_runtime_destroy();
    puts("PASS: per-instance context isolation, missing-context refusal, and mismatch callback refusal");
    return 0;
}

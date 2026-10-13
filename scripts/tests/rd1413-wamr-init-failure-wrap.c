#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include <wasm_export.h>

static bool injected_registration_failure;
static bool injected_runtime_init_failure;
static bool real_runtime_initialized;
static unsigned int injected_destroy_calls;
static unsigned int prior_import_zero_reads;

extern bool __real_wasm_runtime_init(void);
extern int32_t __real_wasm_runtime_get_import_count(const wasm_module_t module);
extern void __real_wasm_runtime_get_import_type(const wasm_module_t module,
                                                 int32_t import_index,
                                                 wasm_import_t *import_type);
extern bool __real_wasm_runtime_register_natives(const char *module_name,
                                                  NativeSymbol *native_symbols,
                                                  uint32_t n_native_symbols);
extern void __real_wasm_runtime_destroy(void);

int32_t __wrap_wasm_runtime_get_import_count(const wasm_module_t module)
{
    const char *inject = getenv("RD1413_TEST_IMPORT_COUNT_UNAVAILABLE");
    if (inject != NULL && strcmp(inject, "1") == 0) {
        return -1;
    }
    return __real_wasm_runtime_get_import_count(module);
}

void __wrap_wasm_runtime_get_import_type(const wasm_module_t module,
                                          int32_t import_index,
                                          wasm_import_t *import_type)
{
    const char *missing_name;
    const char *missing_func_type;
    const char *missing_prior_name;

    __real_wasm_runtime_get_import_type(module, import_index, import_type);
    missing_name = getenv("RD1413_TEST_IMPORT_NAME_UNAVAILABLE");
    if (missing_name != NULL && strcmp(missing_name, "1") == 0) {
        import_type->name = NULL;
    }
    missing_prior_name = getenv("RD1413_TEST_PRIOR_IMPORT_NAME_UNAVAILABLE");
    if (missing_prior_name != NULL && strcmp(missing_prior_name, "1") == 0 &&
        import_index == 0 && ++prior_import_zero_reads == 2) {
        import_type->name = NULL;
    }
    missing_func_type = getenv("RD1413_TEST_IMPORT_FUNC_TYPE_UNAVAILABLE");
    if (missing_func_type != NULL && strcmp(missing_func_type, "1") == 0 &&
        import_type->kind == WASM_IMPORT_EXPORT_KIND_FUNC) {
        import_type->u.func_type = NULL;
    }
}

bool __wrap_wasm_runtime_init(void)
{
    const char *inject = getenv("RD1413_TEST_FAIL_RUNTIME_INIT");
    const char *bypass_real_init = getenv("RD1413_TEST_BYPASS_REAL_RUNTIME_INIT");
    if (inject != NULL && strcmp(inject, "1") == 0) {
        injected_runtime_init_failure = true;
        puts("PASS: WAMR runtime init failure injected");
        return false;
    }
    if (bypass_real_init != NULL && strcmp(bypass_real_init, "1") == 0) {
        puts("TEST: real WAMR runtime initialization bypassed");
        return true;
    }
    real_runtime_initialized = __real_wasm_runtime_init();
    return real_runtime_initialized;
}

bool __wrap_wasm_runtime_register_natives(const char *module_name,
                                           NativeSymbol *native_symbols,
                                           uint32_t n_native_symbols)
{
    if (injected_runtime_init_failure) {
        puts("FAIL: native registration called after init failure");
        return false;
    }
    const char *inject = getenv("RD1413_TEST_FAIL_NATIVE_REGISTRATION");
    if (inject != NULL && strcmp(inject, "1") == 0) {
        injected_registration_failure = true;
        return false;
    }
    return __real_wasm_runtime_register_natives(module_name, native_symbols,
                                                n_native_symbols);
}

void __wrap_wasm_runtime_destroy(void)
{
    if (injected_runtime_init_failure) {
        puts("FAIL: wasm_runtime_destroy called after init failure");
        return;
    }
    if (injected_registration_failure) {
        if (!real_runtime_initialized) {
            puts("FAIL: runtime destroy called without successful real initialization");
            return;
        }
        injected_destroy_calls++;
        if (injected_destroy_calls > 1) {
            puts("FAIL: runtime destroyed more than once after registration refusal");
            return;
        }
    }
    __real_wasm_runtime_destroy();
    if (injected_registration_failure) {
        puts("PASS: initialized WAMR runtime destroy returned after registration refusal");
    }
}

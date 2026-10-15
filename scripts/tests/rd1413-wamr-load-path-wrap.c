#include <stdlib.h>
#include <string.h>

#include "wasm_export.h"

unsigned rd1413_load_path_instantiate_calls;
unsigned rd1413_load_path_unload_calls;
unsigned rd1413_load_path_deinstantiate_calls;
unsigned rd1413_load_path_import_count_calls;
unsigned rd1413_load_path_import_type_calls;

extern wasm_module_inst_t __real_wasm_runtime_instantiate(
    const wasm_module_t module, uint32_t default_stack_size,
    uint32_t host_managed_heap_size, char *error_buf, uint32_t error_buf_size);
extern void __real_wasm_runtime_unload(wasm_module_t module);
extern void __real_wasm_runtime_deinstantiate(wasm_module_inst_t module_inst);
extern int32_t __real_wasm_runtime_get_import_count(const wasm_module_t module);
extern void __real_wasm_runtime_get_import_type(const wasm_module_t module,
                                                int32_t import_index,
                                                wasm_import_t *import_type);

void rd1413_load_path_reset(void)
{
    rd1413_load_path_instantiate_calls = 0;
    rd1413_load_path_unload_calls = 0;
    rd1413_load_path_deinstantiate_calls = 0;
    rd1413_load_path_import_count_calls = 0;
    rd1413_load_path_import_type_calls = 0;
}

static int env_is_one(const char *name)
{
    const char *value = getenv(name);
    return value != NULL && strcmp(value, "1") == 0;
}

int32_t __wrap_wasm_runtime_get_import_count(const wasm_module_t module)
{
    rd1413_load_path_import_count_calls += 1;
    if (env_is_one("RD1413_TEST_IMPORT_COUNT_UNAVAILABLE")) {
        return -1;
    }
    return __real_wasm_runtime_get_import_count(module);
}

void __wrap_wasm_runtime_get_import_type(const wasm_module_t module,
                                         int32_t import_index,
                                         wasm_import_t *import_type)
{
    rd1413_load_path_import_type_calls += 1;
    __real_wasm_runtime_get_import_type(module, import_index, import_type);
}

wasm_module_inst_t __wrap_wasm_runtime_instantiate(
    const wasm_module_t module, uint32_t default_stack_size,
    uint32_t host_managed_heap_size, char *error_buf, uint32_t error_buf_size)
{
    rd1413_load_path_instantiate_calls += 1;
    if (env_is_one("RD1413_TEST_FAIL_INSTANTIATE")) {
        if (error_buf != NULL && error_buf_size > 0) {
            error_buf[0] = '\0';
        }
        return NULL;
    }
    return __real_wasm_runtime_instantiate(module, default_stack_size,
                                           host_managed_heap_size, error_buf,
                                           error_buf_size);
}

void __wrap_wasm_runtime_unload(wasm_module_t module)
{
    rd1413_load_path_unload_calls += 1;
    __real_wasm_runtime_unload(module);
}

void __wrap_wasm_runtime_deinstantiate(wasm_module_inst_t module_inst)
{
    rd1413_load_path_deinstantiate_calls += 1;
    __real_wasm_runtime_deinstantiate(module_inst);
}

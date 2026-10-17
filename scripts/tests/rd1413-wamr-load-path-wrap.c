#define _GNU_SOURCE

#include <fcntl.h>
#include <stdarg.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

#include "wasm_export.h"

unsigned rd1413_load_path_instantiate_calls;
unsigned rd1413_load_path_unload_calls;
unsigned rd1413_load_path_deinstantiate_calls;
unsigned rd1413_load_path_import_count_calls;
unsigned rd1413_load_path_import_type_calls;
size_t rd1413_track_wipe_size;
unsigned rd1413_wipe_ok_frees;
unsigned rd1413_wipe_dirty_frees;
unsigned rd1413_add_seals_full_calls;
unsigned rd1413_get_seals_calls;

#define RD1413_ALLOC_CAP 256u

static struct {
    void *p;
    size_t n;
} rd1413_allocs[RD1413_ALLOC_CAP];

extern void *__real_malloc(size_t n);
extern void __real_free(void *p);
extern int __real_fcntl(int fd, int cmd, ...);
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
    rd1413_wipe_ok_frees = 0;
    rd1413_wipe_dirty_frees = 0;
    rd1413_add_seals_full_calls = 0;
    rd1413_get_seals_calls = 0;
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

void *__wrap_malloc(size_t n)
{
    size_t i;
    void *p = __real_malloc(n);
    if (p == NULL) {
        return NULL;
    }
    for (i = 0; i < RD1413_ALLOC_CAP; i++) {
        if (rd1413_allocs[i].p == NULL) {
            rd1413_allocs[i].p = p;
            rd1413_allocs[i].n = n;
            break;
        }
    }
    return p;
}

void __wrap_free(void *p)
{
    size_t i;
    size_t n = 0;
    int found = 0;
    if (p == NULL) {
        return;
    }
    for (i = 0; i < RD1413_ALLOC_CAP; i++) {
        if (rd1413_allocs[i].p == p) {
            n = rd1413_allocs[i].n;
            rd1413_allocs[i].p = NULL;
            rd1413_allocs[i].n = 0;
            found = 1;
            break;
        }
    }
    if (found && rd1413_track_wipe_size != 0 && n == rd1413_track_wipe_size) {
        const uint8_t *bytes = (const uint8_t *)p;
        unsigned dirty = 0;
        for (i = 0; i < n; i++) {
            if (bytes[i] != 0) {
                dirty = 1;
                break;
            }
        }
        if (dirty) {
            rd1413_wipe_dirty_frees += 1;
        } else {
            rd1413_wipe_ok_frees += 1;
        }
    }
    __real_free(p);
}

int __wrap_fcntl(int fd, int cmd, ...)
{
    if (cmd == F_GETFD || cmd == F_GETFL || cmd == F_GET_SEALS) {
        if (cmd == F_GET_SEALS) {
            rd1413_get_seals_calls += 1;
        }
        return __real_fcntl(fd, cmd);
    }
    {
        va_list ap;
        int arg;
        va_start(ap, cmd);
        arg = va_arg(ap, int);
        va_end(ap);
        if (cmd == F_ADD_SEALS &&
            (unsigned)arg == (unsigned)(F_SEAL_WRITE | F_SEAL_GROW |
                                        F_SEAL_SHRINK | F_SEAL_SEAL)) {
            rd1413_add_seals_full_calls += 1;
        }
        return __real_fcntl(fd, cmd, arg);
    }
}

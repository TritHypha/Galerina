#!/usr/bin/env bash
# Keep LF line endings so WSL can execute this from a Windows checkout.
set -euo pipefail

command -v gcc >/dev/null
command -v wat2wasm >/dev/null
command -v sha256sum >/dev/null

if [[ -z "${WAMR_ROOT:-}" && ( -z "${WAMR_INCLUDE_DIR:-}" || -z "${WAMR_LIBRARY:-}" ) ]]; then
  printf 'Set WAMR_ROOT or both WAMR_INCLUDE_DIR and WAMR_LIBRARY\n' >&2
  exit 2
fi
wamr_include_dir="${WAMR_INCLUDE_DIR:-${WAMR_ROOT}/include}"
wamr_library="${WAMR_LIBRARY:-${WAMR_ROOT}/lib/libiwasm.a}"
test -f "$wamr_include_dir/wasm_export.h"
test -f "$wamr_include_dir/lib_export.h"
test -f "$wamr_library"

# Reproduced from bytecodealliance/wasm-micro-runtime WAMR-2.4.5
# (25bd7eb63e828e4bd242cc9b38d260b4b31c6605), product-mini Linux Release.
# Rebuild from that source root with CMake 4.4.3 and GCC 15.2.0:
# cmake -S product-mini/platforms/linux -B build-rd1413 -G "Unix Makefiles" \
#   -DCMAKE_BUILD_TYPE=Release -DCMAKE_C_COMPILER=/usr/bin/cc \
#   -DCMAKE_C_FLAGS_RELEASE="-O3 -DNDEBUG" -DWAMR_BUILD_PLATFORM=linux \
#   -DWAMR_BUILD_TARGET=X86_64 -DWAMR_BUILD_INTERP=1 \
#   -DWAMR_BUILD_FAST_INTERP=0 -DWAMR_BUILD_AOT=0 -DWAMR_BUILD_JIT=0 \
#   -DWAMR_BUILD_FAST_JIT=0 -DWAMR_BUILD_LIBC_BUILTIN=0 \
#   -DWAMR_BUILD_LIBC_WASI=0 -DWAMR_BUILD_LIB_PTHREAD=0 \
#   -DWAMR_BUILD_LIB_WASI_THREADS=0 -DWAMR_BUILD_MULTI_MODULE=0
# cmake --build build-rd1413 --target vmlib --parallel 2
expected_wamr_header_sha256=779ee0870da26f129afe26f58881d286e0bef1537d995acf9cdd27c8a50c3ee0
expected_wamr_lib_header_sha256=19c182c07246c971eee6c54ddf5bd552fcb5fee91be6970681815c0d19ea1264
expected_wamr_library_sha256=f21702522f6ce032193ac0529a95f841be044730a0b1c237f17ebb0d61f0104d
actual_wamr_header_sha256="$(sha256sum "$wamr_include_dir/wasm_export.h" | cut -d ' ' -f1)"
actual_wamr_lib_header_sha256="$(sha256sum "$wamr_include_dir/lib_export.h" | cut -d ' ' -f1)"
actual_wamr_library_sha256="$(sha256sum "$wamr_library" | cut -d ' ' -f1)"
if [[ "$actual_wamr_header_sha256" != "$expected_wamr_header_sha256" ||
      "$actual_wamr_lib_header_sha256" != "$expected_wamr_lib_header_sha256" ||
      "$actual_wamr_library_sha256" != "$expected_wamr_library_sha256" ]]; then
  printf 'WAMR SDK pin mismatch: header=%s lib_header=%s library=%s\n' \
    "$actual_wamr_header_sha256" "$actual_wamr_lib_header_sha256" \
    "$actual_wamr_library_sha256" >&2
  exit 2
fi
if [[ "$(wat2wasm --version)" != "1.0.36" || "$(gcc -dumpfullversion)" != "15.2.0" ]]; then
  printf 'Toolchain pin mismatch: wat2wasm=%s gcc=%s\n' \
    "$(wat2wasm --version)" "$(gcc -dumpfullversion)" >&2
  exit 2
fi

script_dir="$(cd -- "$(dirname -- "$0")" && pwd)"
temp_dir="$(mktemp -d "${TMPDIR:-/tmp}/rd1413-wamr-context.XXXXXX")"
trap 'rm -rf -- "$temp_dir"' EXIT

wat2wasm "$script_dir/rd1413-wamr-context-probe.wat" -o "$temp_dir/context.wasm"
wat2wasm "$script_dir/rd1413-wamr-context-mismatch-probe.wat" -o "$temp_dir/context-mismatch.wasm"
wat2wasm "$script_dir/rd1413-wamr-unapproved-import-probe.wat" -o "$temp_dir/context-unapproved.wasm"
wat2wasm "$script_dir/rd1413-wamr-nonfunction-import-probe.wat" -o "$temp_dir/context-nonfunction.wasm"
gcc -std=c11 -Wall -Wextra -Werror \
  -I"$wamr_include_dir" \
  -I"$script_dir/../../packages-ts/galerina-core-runtime/native/wamr-host/include" \
  "$script_dir/rd1413-wamr-context-probe.c" \
  "$script_dir/../../packages-ts/galerina-core-runtime/native/wamr-host/src/wamr_import_admission.c" \
  "$wamr_library" -lm -ldl -lpthread \
  -o "$temp_dir/context-probe"
"$temp_dir/context-probe" \
  "$temp_dir/context.wasm" \
  "$temp_dir/context-mismatch.wasm" \
  "$temp_dir/context-unapproved.wasm" \
  "$temp_dir/context-nonfunction.wasm"

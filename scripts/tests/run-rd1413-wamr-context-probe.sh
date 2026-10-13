#!/usr/bin/env bash
# Keep LF line endings so WSL can execute this from a Windows checkout.
set -euo pipefail

# Do not let a caller's test-injection environment contaminate the positive runs.
unset RD1413_TEST_FAIL_NATIVE_REGISTRATION RD1413_TEST_FAIL_RUNTIME_INIT
unset RD1413_TEST_IMPORT_COUNT_UNAVAILABLE RD1413_TEST_IMPORT_NAME_UNAVAILABLE
unset RD1413_TEST_IMPORT_FUNC_TYPE_UNAVAILABLE RD1413_TEST_BYPASS_REAL_RUNTIME_INIT
unset RD1413_TEST_PRIOR_IMPORT_NAME_UNAVAILABLE

command -v gcc >/dev/null
command -v wat2wasm >/dev/null
command -v sha256sum >/dev/null
command -v truncate >/dev/null
command -v head >/dev/null
command -v tr >/dev/null

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
#   -DWAMR_BUILD_LIB_WASI_THREADS=0 -DWAMR_BUILD_MULTI_MODULE=0 \
#   -DWAMR_BUILD_REF_TYPES=1 -DWAMR_BUILD_SIMD=1
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
wat2wasm "$script_dir/rd1413-wamr-duplicate-import-probe.wat" -o "$temp_dir/context-duplicate.wasm"
wat2wasm "$script_dir/rd1413-wamr-unlinked-import-probe.wat" -o "$temp_dir/context-unlinked.wasm"
wat2wasm "$script_dir/rd1413-wamr-externref-result-probe.wat" -o "$temp_dir/context-externref-result.wasm"
truncate -s 1048577 "$temp_dir/oversized-fixture.wasm"
head -c 1048576 /dev/zero | LC_ALL=C tr '\000' '\245' > "$temp_dir/limit-fixture.wasm"
gcc -std=c11 -Wall -Wextra -Werror \
  -I"$wamr_include_dir" \
  -I"$script_dir/../../packages-ts/galerina-core-runtime/native/wamr-host/include" \
  "$script_dir/rd1413-wamr-context-probe.c" \
  "$script_dir/rd1413-wamr-init-failure-wrap.c" \
  "$script_dir/../../packages-ts/galerina-core-runtime/native/wamr-host/src/wamr_import_admission.c" \
  -Wl,--wrap=wasm_runtime_get_import_count \
  -Wl,--wrap=wasm_runtime_get_import_type \
  -Wl,--wrap=wasm_runtime_register_natives \
  -Wl,--wrap=wasm_runtime_init \
  -Wl,--wrap=wasm_runtime_destroy \
  "$wamr_library" -lm -ldl -lpthread \
  -o "$temp_dir/context-probe"
"$temp_dir/context-probe" \
  "$temp_dir/context.wasm" \
  "$temp_dir/context-mismatch.wasm" \
  "$temp_dir/context-unapproved.wasm" \
  "$temp_dir/context-nonfunction.wasm" \
  "$temp_dir/context-duplicate.wasm" \
  "$temp_dir/context-unlinked.wasm"
"$temp_dir/context-probe" --externref-result "$temp_dir/context-externref-result.wasm"
"$temp_dir/context-probe" --oversized-fixture "$temp_dir/oversized-fixture.wasm"
"$temp_dir/context-probe" --limit-fixture "$temp_dir/limit-fixture.wasm"
"$temp_dir/context-probe" --metadata-faults "$temp_dir/context.wasm"
"$temp_dir/context-probe" --prior-import-metadata-fault "$temp_dir/context-duplicate.wasm"

set +e
standalone_registration_failure_output="$(RD1413_TEST_FAIL_NATIVE_REGISTRATION=1 \
  "$temp_dir/context-probe" --duplicate-imports \
  "$temp_dir/context-duplicate.wasm" 2>&1)"
standalone_registration_failure_status=$?
set -e
standalone_destroy_marker_count="$(printf '%s\n' "$standalone_registration_failure_output" | \
  grep -Fxc 'PASS: initialized WAMR runtime destroy returned after registration refusal' || true)"
if [[ "$standalone_registration_failure_status" -ne 2 ||
      "$standalone_destroy_marker_count" -ne 1 ||
      "$standalone_registration_failure_output" == *"FAIL: runtime destroyed more than once after registration refusal"* ]]; then
  printf 'FAIL: standalone duplicate-import registration refusal cleanup failed (status=%s)\n%s\n' \
    "$standalone_registration_failure_status" "$standalone_registration_failure_output" >&2
  exit 1
fi
printf '%s\n' "$standalone_registration_failure_output" | grep -F \
  'PASS: initialized WAMR runtime destroy returned after registration refusal'

set +e
uninitialized_registration_failure_output="$(RD1413_TEST_BYPASS_REAL_RUNTIME_INIT=1 \
  RD1413_TEST_FAIL_NATIVE_REGISTRATION=1 \
  "$temp_dir/context-probe" --duplicate-imports \
  "$temp_dir/context-duplicate.wasm" 2>&1)"
uninitialized_registration_failure_status=$?
set -e
if [[ "$uninitialized_registration_failure_status" -ne 2 ||
      "$uninitialized_registration_failure_output" != *"FAIL: runtime destroy called without successful real initialization"* ||
      "$uninitialized_registration_failure_output" == *"PASS: initialized WAMR runtime destroy returned after registration refusal"* ]]; then
  printf 'FAIL: cleanup witness accepted destruction without successful real initialization (status=%s)\n%s\n' \
    "$uninitialized_registration_failure_status" "$uninitialized_registration_failure_output" >&2
  exit 1
fi
printf 'PASS: cleanup witness rejects destruction without successful real initialization\n'

set +e
registration_failure_output="$(RD1413_TEST_FAIL_NATIVE_REGISTRATION=1 \
  "$temp_dir/context-probe" \
  "$temp_dir/context.wasm" \
  "$temp_dir/context-mismatch.wasm" \
  "$temp_dir/context-unapproved.wasm" \
  "$temp_dir/context-nonfunction.wasm" \
  "$temp_dir/context-duplicate.wasm" \
  "$temp_dir/context-unlinked.wasm" 2>&1)"
registration_failure_status=$?
set -e
registration_destroy_marker_count="$(printf '%s\n' "$registration_failure_output" | \
  grep -Fxc 'PASS: initialized WAMR runtime destroy returned after registration refusal' || true)"
if [[ "$registration_failure_status" -ne 2 ||
      "$registration_destroy_marker_count" -ne 1 ||
      "$registration_failure_output" == *"FAIL: runtime destroyed more than once after registration refusal"* ]]; then
  printf 'FAIL: registration refusal cleanup was not observed (status=%s)\n%s\n' \
    "$registration_failure_status" "$registration_failure_output" >&2
  exit 1
fi
printf '%s\n' "$registration_failure_output" | grep -F \
  'PASS: initialized WAMR runtime destroy returned after registration refusal'

set +e
runtime_init_failure_output="$(RD1413_TEST_FAIL_RUNTIME_INIT=1 \
  "$temp_dir/context-probe" \
  "$temp_dir/context.wasm" \
  "$temp_dir/context-mismatch.wasm" \
  "$temp_dir/context-unapproved.wasm" \
  "$temp_dir/context-nonfunction.wasm" \
  "$temp_dir/context-duplicate.wasm" \
  "$temp_dir/context-unlinked.wasm" 2>&1)"
runtime_init_failure_status=$?
set -e
runtime_init_marker_count="$(printf '%s\n' "$runtime_init_failure_output" | \
  grep -Fxc 'PASS: WAMR runtime init failure injected' || true)"
if [[ "$runtime_init_failure_status" -ne 2 ||
      "$runtime_init_marker_count" -ne 1 ||
      "$runtime_init_failure_output" == *"FAIL: wasm_runtime_destroy called after init failure"* ||
      "$runtime_init_failure_output" == *"FAIL: native registration called after init failure"* ]]; then
  printf 'FAIL: runtime init refusal cleanup contract failed (status=%s)\n%s\n' \
    "$runtime_init_failure_status" "$runtime_init_failure_output" >&2
  exit 1
fi
printf '%s\n' "$runtime_init_failure_output" | grep -F \
  'PASS: WAMR runtime init failure injected'

set +e
externref_init_failure_output="$(RD1413_TEST_FAIL_RUNTIME_INIT=1 \
  "$temp_dir/context-probe" --externref-result \
  "$temp_dir/context-externref-result.wasm" 2>&1)"
externref_init_failure_status=$?
set -e
externref_init_marker_count="$(printf '%s\n' "$externref_init_failure_output" | \
  grep -Fxc 'PASS: WAMR runtime init failure injected' || true)"
if [[ "$externref_init_failure_status" -ne 2 ||
      "$externref_init_marker_count" -ne 1 ||
      "$externref_init_failure_output" == *"FAIL: wasm_runtime_destroy called after init failure"* ||
      "$externref_init_failure_output" == *"FAIL: native registration called after init failure"* ]]; then
  printf 'FAIL: externref-path init failure ordering failed (status=%s)\n%s\n' \
    "$externref_init_failure_status" "$externref_init_failure_output" >&2
  exit 1
fi
printf '%s\n' "$externref_init_failure_output" | grep -F \
  'PASS: WAMR runtime init failure injected'

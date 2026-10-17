#!/usr/bin/env bash
# Keep LF line endings so WSL can execute this from a Windows checkout.
set -euo pipefail

unset RD1413_TEST_IMPORT_COUNT_UNAVAILABLE RD1413_TEST_FAIL_INSTANTIATE

command -v gcc >/dev/null
command -v wat2wasm >/dev/null
command -v sha256sum >/dev/null
command -v python3 >/dev/null

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
if [[ -n "${WAMR_HOST_ROOT:-}" || -n "${WAMR_HOST_INCLUDE:-}" ||
      -n "${WAMR_HOST_SRC:-}" ]]; then
  if [[ "${RD1413_ALLOW_HOST_REDIRECT:-}" != "1" ]]; then
    printf 'WAMR_HOST_* redirect refused without RD1413_ALLOW_HOST_REDIRECT=1\n' >&2
    exit 2
  fi
fi
wamr_host_root="${WAMR_HOST_ROOT:-$script_dir/../../packages-ts/galerina-core-runtime/native/wamr-host}"
host_include="${WAMR_HOST_INCLUDE:-$wamr_host_root/include}"
host_src="${WAMR_HOST_SRC:-$wamr_host_root/src}"
host_include="$(cd -- "$host_include" && pwd)"
host_src="$(cd -- "$host_src" && pwd)"
printf 'host_include=%s\n' "$host_include"
printf 'host_src=%s\n' "$host_src"
printf 'wamr_vok_verdict.c=%s\n' "$(sha256sum "$host_src/wamr_vok_verdict.c" | cut -d ' ' -f1)"
printf 'wamr_secrets_gateway_host.c=%s\n' "$(sha256sum "$host_src/wamr_secrets_gateway_host.c" | cut -d ' ' -f1)"
if [[ -z "${WAMR_VOK_VERIFIER:-}" ]]; then
  printf 'Set WAMR_VOK_VERIFIER to the hash-pinned vok-artifact-verifier binary\n' >&2
  exit 2
fi
verifier="$WAMR_VOK_VERIFIER"
test -x "$verifier"
pin="$(sha256sum "$verifier" | cut -d ' ' -f1)"
if [[ "${#pin}" -ne 64 ]]; then
  printf 'verifier pin is not 64 hex characters\n' >&2
  exit 2
fi
if grep -q 'wamr_secrets_gateway_load_expected' \
    "$host_include/wamr_secrets_gateway_host.h" \
    "$host_src/wamr_secrets_gateway_host.c"; then
  printf 'load_expected still present in production header/TU\n' >&2
  exit 2
fi
if grep -E 'wamr_vok_bind_bytes|pipe_origin' \
    "$host_include/wamr_vok_verdict.h"; then
  printf 'bind_bytes or pipe_origin still public\n' >&2
  exit 2
fi
if ! grep -q 'memfd_create' "$host_src/wamr_vok_verdict.c" ||
   ! grep -q 'F_SEAL_SEAL' "$host_src/wamr_vok_verdict.c" ||
   ! grep -q 'F_GET_SEALS' "$host_src/wamr_vok_verdict.c" ||
   ! grep -q 'empty_envp' "$host_src/wamr_vok_verdict.c"; then
  printf 'sealed memfd, F_GET_SEALS, or empty envp missing from spawn\n' >&2
  exit 2
fi
if ! grep -q 'pthread_sigmask' "$host_src/wamr_vok_verdict.c" ||
   ! grep -q 'WNOHANG' "$host_src/wamr_vok_verdict.c" ||
   ! grep -q 'reap_child_deadline' "$host_src/wamr_vok_verdict.c"; then
  printf 'pthread_sigmask or WNOHANG deadline reap missing from spawn\n' >&2
  exit 2
fi
if ! grep -q 'SNAPSHOT_WIPE' "$host_src/wamr_secrets_gateway_host.c" ||
   ! grep -q 'wipe_bytes' "$host_src/wamr_secrets_gateway_host.c"; then
  printf 'snapshot wipe missing from production TU\n' >&2
  exit 2
fi
if grep -q 'fexecve(.*environ' "$host_src/wamr_vok_verdict.c"; then
  printf 'fexecve still inherits host environ\n' >&2
  exit 2
fi
if ! grep -q 'AOT_REFUSED' "$host_src/wamr_secrets_gateway_host.c"; then
  printf 'AOT refuse missing from production TU\n' >&2
  exit 2
fi
if ! grep -q 'BYTECODE_REQUIRED' "$host_src/wamr_secrets_gateway_host.c" ||
   ! grep -q 'snapshot_is_wasm_bytecode' "$host_src/wamr_secrets_gateway_host.c"; then
  printf 'bytecode allowlist missing from production TU\n' >&2
  exit 2
fi
if grep -q 'rd1413_test_load_owned_snapshot' \
    "$host_include/wamr_secrets_gateway_host.h" \
    "$host_src/wamr_secrets_gateway_host.c"; then
  printf 'test helper leaked into production header/TU\n' >&2
  exit 2
fi
temp_dir="$(mktemp -d "${TMPDIR:-/tmp}/rd1413-wamr-load-path.XXXXXX")"
trap 'rm -rf -- "$temp_dir"' EXIT

wat2wasm "$script_dir/rd1413-wamr-load-path-admitted-subset.wat" -o "$temp_dir/subset.wasm"
wat2wasm "$script_dir/rd1413-wamr-load-path-admitted-full.wat" -o "$temp_dir/full.wasm"
wat2wasm "$script_dir/rd1413-wamr-load-path-superset.wat" -o "$temp_dir/superset.wasm"
wat2wasm "$script_dir/rd1413-wamr-load-path-duplicate.wat" -o "$temp_dir/duplicate.wasm"
wat2wasm "$script_dir/rd1413-wamr-load-path-mismatch.wat" -o "$temp_dir/mismatch.wasm"
wat2wasm "$script_dir/rd1413-wamr-load-path-nonfunction.wat" -o "$temp_dir/nonfunction.wasm"

export RD1413_SUBSET_SHA256
export RD1413_FULL_SHA256
RD1413_SUBSET_SHA256="$(sha256sum "$temp_dir/subset.wasm" | cut -d ' ' -f1)"
RD1413_FULL_SHA256="$(sha256sum "$temp_dir/full.wasm" | cut -d ' ' -f1)"

gcc -std=c11 -Wall -Wextra -Werror \
  -DWAMR_VOK_VERIFIER_SHA256_HEX=\"$pin\" \
  -I"$wamr_include_dir" \
  -I"$host_include" \
  -I"$host_src" \
  -I"$script_dir" \
  "$script_dir/rd1413-wamr-load-path-probe.c" \
  "$script_dir/rd1413-wamr-load-path-wrap.c" \
  "$script_dir/rd1413-wamr-load-path-test-host.c" \
  "$host_src/wamr_import_admission.c" \
  "$host_src/wamr_sha256.c" \
  "$host_src/wamr_vok_verdict.c" \
  -Wl,--wrap=wasm_runtime_get_import_count \
  -Wl,--wrap=wasm_runtime_get_import_type \
  -Wl,--wrap=wasm_runtime_instantiate \
  -Wl,--wrap=wasm_runtime_unload \
  -Wl,--wrap=wasm_runtime_deinstantiate \
  -Wl,--wrap=malloc \
  -Wl,--wrap=free \
  -Wl,--wrap=fcntl \
  "$wamr_library" -lm -ldl -lpthread \
  -o "$temp_dir/load-path-probe"

cp -- "$verifier" "$temp_dir/evil-verifier"
python3 - "$temp_dir/evil-verifier" <<'PY'
import pathlib, sys
path = pathlib.Path(sys.argv[1])
data = bytearray(path.read_bytes())
data[-1] ^= 0x01
path.write_bytes(data)
PY
chmod +x "$temp_dir/evil-verifier"

gcc -shared -fPIC -o "$temp_dir/evil-preload.so" \
  "$script_dir/rd1413-wamr-evil-preload.c"

"$temp_dir/load-path-probe" \
  "$temp_dir/subset.wasm" \
  "$temp_dir/full.wasm" \
  "$temp_dir/superset.wasm" \
  "$temp_dir/duplicate.wasm" \
  "$temp_dir/mismatch.wasm" \
  "$temp_dir/nonfunction.wasm" \
  "$temp_dir" \
  "$verifier" \
  "$temp_dir/evil-verifier"

# Pinned forging-stub suite (F1-F5). Compile stub, pin sha256 at harness
# compile time, one MODE per forgery.
if [[ ! -f "$script_dir/rd1413-wamr-forging-stub.c" ||
      ! -f "$script_dir/rd1413-wamr-forging-harness.c" ]]; then
  printf 'forging stub/harness missing\n' >&2
  exit 2
fi

compile_stub() {
  local mode="$1"
  local out="$2"
  gcc -std=c11 -Wall -Wextra -Werror -DMODE="$mode" \
    -DWAMR_VOK_VERIFIER_SHA256_HEX=\"0000000000000000000000000000000000000000000000000000000000000001\" \
    -I"$host_include" \
    -I"$host_src" \
    "$script_dir/rd1413-wamr-forging-stub.c" \
    "$host_src/wamr_sha256.c" \
    "$host_src/wamr_vok_verdict.c" \
    -lpthread \
    -o "$out"
}

compile_harness() {
  local pin="$1"
  local out="$2"
  gcc -std=c11 -Wall -Wextra -Werror \
    -DWAMR_VOK_VERIFIER_SHA256_HEX=\"$pin\" \
    -I"$host_include" \
    -I"$host_src" \
    "$script_dir/rd1413-wamr-forging-harness.c" \
    "$host_src/wamr_sha256.c" \
    "$host_src/wamr_vok_verdict.c" \
    -lpthread \
    -o "$out"
}

run_forge() {
  local label="$1"
  local mode="$2"
  local nbytes="$3"
  local expected_rc="$4"
  local max_ms="$5"
  local fdcheck="$6"
  local stub="$temp_dir/stub-$mode"
  local harness="$temp_dir/harness-$mode"
  local pin
  compile_stub "$mode" "$stub"
  pin="$(sha256sum "$stub" | cut -d ' ' -f1)"
  if [[ "${#pin}" -ne 64 ]]; then
    printf '%s: stub pin is not 64 hex characters\n' "$label" >&2
    exit 2
  fi
  compile_harness "$pin" "$harness"
  if ! "$harness" "$stub" "$nbytes" "$expected_rc" "$max_ms" "$fdcheck"; then
    printf '%s: forging harness failed (mode=%s nbytes=%s expected_rc=%s)\n' \
      "$label" "$mode" "$nbytes" "$expected_rc" >&2
    exit 1
  fi
  printf 'PASS: %s mode=%s rc=%s nbytes=%s max_ms=%s fdcheck=%s\n' \
    "$label" "$mode" "$expected_rc" "$nbytes" "$max_ms" "$fdcheck"
}

# BIND_OK=0 MISMATCH=3 REFUSED=4. Early-exit and non-reader use 1 MiB so
# the pipe fills and SIGPIPE / blocking-write paths are reachable.
run_forge "honest-4k" 3 4096 0 6000 0
run_forge "honest-1m" 3 1048576 0 6000 0
run_forge "early-exit" 0 1048576 4 6000 0
run_forge "non-reader" 1 1048576 4 6000 0
run_forge "fd-list" 2 4096 4 6000 1
run_forge "epoch-plus" 4 4096 4 6000 0
run_forge "authorizing-true" 5 4096 4 6000 0
run_forge "flipped-envelope" 6 4096 4 6000 0
run_forge "component-mismatch" 7 4096 3 6000 0
run_forge "trailing-byte" 8 4096 4 6000 0
run_forge "exit-status-3" 9 4096 4 6000 0
run_forge "epoch-negative-wrap" 11 4096 4 6000 0
run_forge "close-hang" 20 4096 4 6000 0
run_forge "verdict-then-hang" 21 4096 4 6000 0
run_forge "envelope-leading-zero" 22 4096 4 6000 0
run_forge "buildpoint-uppercase" 23 4096 4 6000 0
run_forge "envelope-plus" 27 4096 4 6000 0
run_forge "seal-leading-zero" 28 4096 4 6000 0
printf 'PASS: forging-stub suite\n'

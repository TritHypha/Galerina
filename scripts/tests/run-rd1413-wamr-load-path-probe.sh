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
host_include="$script_dir/../../packages-ts/galerina-core-runtime/native/wamr-host/include"
host_src="$script_dir/../../packages-ts/galerina-core-runtime/native/wamr-host/src"
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

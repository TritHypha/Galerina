#!/usr/bin/env bash
# Keep LF line endings so WSL can execute this from a Windows checkout.
# Composed probe: C WAMR host hash-pins the out-of-process Rust verifier,
# fexecves the same fd, writes the snapshot to stdin, and binds the
# Envelope + Wax Seal from the child's stdout pipe.
# C must not link libgalerina_vok_authority.
#
# WAMR_HOST_ROOT must point at a tree whose wamr-host has
# load_for_authority with verifier_path (PR #182 fix5).
set -euo pipefail

export PATH="$HOME/.cargo/bin:$HOME/.local/bin:$PATH"

if [[ -z "${WAMR_ROOT:-}" && ( -z "${WAMR_INCLUDE_DIR:-}" || -z "${WAMR_LIBRARY:-}" ) ]]; then
  printf 'Set WAMR_ROOT or both WAMR_INCLUDE_DIR and WAMR_LIBRARY\n' >&2
  exit 2
fi
wamr_include_dir="${WAMR_INCLUDE_DIR:-${WAMR_ROOT}/include}"
wamr_library="${WAMR_LIBRARY:-${WAMR_ROOT}/lib/libiwasm.a}"
test -f "$wamr_include_dir/wasm_export.h"
test -f "$wamr_library"

command -v gcc >/dev/null
command -v wat2wasm >/dev/null
command -v cargo >/dev/null
command -v nm >/dev/null
command -v python3 >/dev/null
command -v sha256sum >/dev/null

script_dir="$(cd -- "$(dirname -- "$0")" && pwd)"
repo_root="$(cd -- "$script_dir/../.." && pwd)"
vok_dir="$repo_root/packages-ts/galerina-core-runtime/native/vok-authority"
host_root="${WAMR_HOST_ROOT:-$repo_root}"
host_include="$host_root/packages-ts/galerina-core-runtime/native/wamr-host/include"
host_src="$host_root/packages-ts/galerina-core-runtime/native/wamr-host/src"
wat="$script_dir/rd1413-wamr-load-path-admitted-subset.wat"
full_wat="$host_root/scripts/tests/rd1413-wamr-load-path-admitted-full.wat"
probe="$script_dir/rd1413-wamr-vok-handoff-probe.c"

test -f "$host_include/wamr_secrets_gateway_host.h"
test -f "$host_src/wamr_secrets_gateway_host.c"
test -f "$host_src/wamr_vok_verdict.c"
test -f "$host_include/wamr_vok_verdict.h"
test ! -f "$host_src/wamr_vok_handle.c"
test ! -f "$host_include/wamr_vok_handle.h"
test -f "$probe"
test -f "$wat"
test -f "$full_wat"

if ! grep -q 'verifier_path' \
    "$host_include/wamr_secrets_gateway_host.h"; then
  printf 'WAMR_HOST_ROOT %s has no verifier_path load_for_authority (need PR #182 fix5 host)\n' \
    "$host_root" >&2
  exit 2
fi
if grep -q 'envelope_path' \
    "$host_include/wamr_secrets_gateway_host.h"; then
  printf 'WAMR_HOST_ROOT %s still exposes caller envelope_path\n' \
    "$host_root" >&2
  exit 2
fi
if grep -q 'wamr_secrets_gateway_load_expected' \
    "$host_include/wamr_secrets_gateway_host.h" \
    "$host_src/wamr_secrets_gateway_host.c"; then
  printf 'WAMR_HOST_ROOT %s still exposes load_expected\n' \
    "$host_root" >&2
  exit 2
fi
if grep -E 'wamr_vok_bind_bytes|pipe_origin' \
    "$host_include/wamr_vok_verdict.h"; then
  printf 'WAMR_HOST_ROOT %s still exposes public bind_bytes/pipe_origin\n' \
    "$host_root" >&2
  exit 2
fi
if ! grep -q 'memfd_create' "$host_src/wamr_vok_verdict.c" ||
   ! grep -q 'F_GET_SEALS' "$host_src/wamr_vok_verdict.c" ||
   ! grep -q 'empty_envp' "$host_src/wamr_vok_verdict.c"; then
  printf 'WAMR_HOST_ROOT %s missing sealed memfd, F_GET_SEALS, or empty envp\n' \
    "$host_root" >&2
  exit 2
fi
if ! grep -q 'SNAPSHOT_WIPE' "$host_src/wamr_secrets_gateway_host.c"; then
  printf 'WAMR_HOST_ROOT %s missing snapshot wipe before free\n' \
    "$host_root" >&2
  exit 2
fi
if ! grep -q 'AOT_REFUSED' "$host_src/wamr_secrets_gateway_host.c"; then
  printf 'WAMR_HOST_ROOT %s missing AOT refuse on authority load path\n' \
    "$host_root" >&2
  exit 2
fi
if ! grep -q 'BYTECODE_REQUIRED' "$host_src/wamr_secrets_gateway_host.c"; then
  printf 'WAMR_HOST_ROOT %s missing bytecode allowlist on authority load path\n' \
    "$host_root" >&2
  exit 2
fi
if ! grep -q 'VOK_AOT_REFUSED' "$vok_dir/src/assurance.rs"; then
  printf 'verifier missing VOK_AOT_REFUSED\n' >&2
  exit 2
fi

cd "$vok_dir"
cargo_release_dir() {
  local root="${CARGO_TARGET_DIR:-$vok_dir/target}"
  if [[ -n "${CARGO_BUILD_TARGET:-}" ]]; then
    printf '%s/%s/release' "$root" "$CARGO_BUILD_TARGET"
  else
    printf '%s/release' "$root"
  fi
}
release_dir="$(cargo_release_dir)"
rm -f -- "$release_dir/libgalerina_vok_authority.a"
cargo build --offline --locked --release --bin vok-artifact-verifier
verifier="$release_dir/vok-artifact-verifier"
if [[ ! -x "$verifier" ]]; then
  printf 'VOK_VERIFIER_MISSING %s\n' "$verifier" >&2
  exit 2
fi
if [[ -f "$release_dir/libgalerina_vok_authority.a" ]]; then
  printf 'staticlib libgalerina_vok_authority.a must not exist for the runtime build\n' >&2
  exit 1
fi
pin="$(sha256sum "$verifier" | cut -d ' ' -f1)"
if [[ "${#pin}" -ne 64 ]]; then
  printf 'verifier pin is not 64 hex characters\n' >&2
  exit 2
fi

temp_dir="$(mktemp -d "${TMPDIR:-/tmp}/rd1413-wamr-vok-handoff.XXXXXX")"
trap 'rm -rf -- "$temp_dir"' EXIT
wat2wasm "$wat" -o "$temp_dir/subset.wasm"
wat2wasm "$full_wat" -o "$temp_dir/full.wasm"

if "$verifier" --digest "$temp_dir/subset.wasm" \
    --envelope-out "$temp_dir/bad.env" --seal-out "$temp_dir/bad.seal"; then
  printf 'verifier accepted --digest\n' >&2
  exit 1
fi

if ! "$verifier" --stdin < "$temp_dir/subset.wasm" > "$temp_dir/verdict.pipe"; then
  printf 'verifier --stdin refused genuine subset\n' >&2
  exit 1
fi
if ! grep -q 'GALERINA_VOK_VERDICT_V1' "$temp_dir/verdict.pipe"; then
  printf 'stdin verdict missing frame magic\n' >&2
  exit 1
fi

"$verifier" --artifact "$temp_dir/subset.wasm" \
  --envelope-out "$temp_dir/env.subset" --seal-out "$temp_dir/seal.subset"
if grep -q 'UNAUTHENTICATED_REFERENCE' "$temp_dir/seal.subset"; then
  printf 'seal still uses UNAUTHENTICATED_REFERENCE\n' >&2
  exit 1
fi
if ! grep -q 'authentication=PINNED_CHILD_PIPE' "$temp_dir/seal.subset"; then
  printf 'seal missing PINNED_CHILD_PIPE\n' >&2
  exit 1
fi

cp -- "$verifier" "$temp_dir/evil-verifier"
python3 - "$temp_dir/evil-verifier" <<'PY'
import pathlib, sys
path = pathlib.Path(sys.argv[1])
data = bytearray(path.read_bytes())
data[-1] ^= 0x01
path.write_bytes(data)
PY
chmod +x "$temp_dir/evil-verifier"

gcc -std=c11 -Wall -Wextra -Werror \
  -DWAMR_VOK_VERIFIER_SHA256_HEX=\"$pin\" \
  -I"$wamr_include_dir" \
  -I"$host_include" \
  "$probe" \
  "$host_src/wamr_secrets_gateway_host.c" \
  "$host_src/wamr_import_admission.c" \
  "$host_src/wamr_sha256.c" \
  "$host_src/wamr_vok_verdict.c" \
  "$wamr_library" -lm -ldl -lpthread \
  -o "$temp_dir/handoff-probe"

if nm -a "$temp_dir/handoff-probe" | grep -E 'vok_authority_issue_sealed_handle|vok_authority_handoff_admit_lease_receipt|vok_authority_encode_return_u64'; then
  printf 'C probe still contains Rust VOK FFI symbols\n' >&2
  exit 1
fi

"$temp_dir/handoff-probe" \
  "$temp_dir/subset.wasm" \
  "$temp_dir/full.wasm" \
  "$verifier" \
  "$temp_dir/missing.bin" \
  "$temp_dir/evil-verifier"

#!/usr/bin/env bash
# Keep LF line endings so WSL can execute this from a Windows checkout.
# Composed probe: out-of-process Rust verifier hashes wasm independently,
# writes Envelope + Wax Seal; C WAMR loader binds that verdict and loads.
# C must not link libgalerina_vok_authority.
#
# WAMR_HOST_ROOT must point at a tree whose wamr-host has
# load_for_authority with envelope/seal paths (PR #182 fix4).
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

if ! grep -q 'envelope_path' \
    "$host_include/wamr_secrets_gateway_host.h"; then
  printf 'WAMR_HOST_ROOT %s has no verdict-path load_for_authority (need PR #182 fix4 host)\n' \
    "$host_root" >&2
  exit 2
fi

cd "$vok_dir"
rm -f -- "$vok_dir/target/release/libgalerina_vok_authority.a"
cargo build --offline --locked --release --bin vok-artifact-verifier
verifier="$vok_dir/target/release/vok-artifact-verifier"
test -x "$verifier"
if [[ -f "$vok_dir/target/release/libgalerina_vok_authority.a" ]]; then
  printf 'staticlib libgalerina_vok_authority.a must not exist for the runtime build\n' >&2
  exit 1
fi

temp_dir="$(mktemp -d "${TMPDIR:-/tmp}/rd1413-wamr-vok-handoff.XXXXXX")"
trap 'rm -rf -- "$temp_dir"' EXIT
wat2wasm "$wat" -o "$temp_dir/subset.wasm"
wat2wasm "$full_wat" -o "$temp_dir/full.wasm"
cp -- "$temp_dir/subset.wasm" "$temp_dir/tamper.wasm"
python3 - "$temp_dir/tamper.wasm" <<'PY'
import pathlib, sys
path = pathlib.Path(sys.argv[1])
data = bytearray(path.read_bytes())
data[-1] ^= 0x01
path.write_bytes(data)
PY

if "$verifier" --digest "$temp_dir/subset.wasm" \
    --envelope-out "$temp_dir/bad.env" --seal-out "$temp_dir/bad.seal"; then
  printf 'verifier accepted --digest\n' >&2
  exit 1
fi

"$verifier" --artifact "$temp_dir/subset.wasm" \
  --envelope-out "$temp_dir/env.subset" --seal-out "$temp_dir/seal.subset"
"$verifier" --artifact "$temp_dir/full.wasm" \
  --envelope-out "$temp_dir/env.full" --seal-out "$temp_dir/seal.full"

gcc -std=c11 -Wall -Wextra -Werror \
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
  "$temp_dir/tamper.wasm" \
  "$temp_dir/env.subset" \
  "$temp_dir/seal.subset" \
  "$temp_dir/env.full" \
  "$temp_dir/seal.full" \
  "$temp_dir/missing.env"

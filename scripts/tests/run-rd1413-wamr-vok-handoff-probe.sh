#!/usr/bin/env bash
# Keep LF line endings so WSL can execute this from a Windows checkout.
# Composed C probe: real wamr_secrets_gateway_load_for_authority digest
# into VOK admit/lease/receipt (match / mismatch / missing).
#
# WAMR_HOST_ROOT must point at a tree whose wamr-host has
# load_for_authority (PR #182). Default is this clone's in-tree host.
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

script_dir="$(cd -- "$(dirname -- "$0")" && pwd)"
repo_root="$(cd -- "$script_dir/../.." && pwd)"
vok_dir="$repo_root/packages-ts/galerina-core-runtime/native/vok-authority"
host_root="${WAMR_HOST_ROOT:-$repo_root}"
host_include="$host_root/packages-ts/galerina-core-runtime/native/wamr-host/include"
host_src="$host_root/packages-ts/galerina-core-runtime/native/wamr-host/src"
wat="$script_dir/rd1413-wamr-load-path-admitted-subset.wat"
probe="$script_dir/rd1413-wamr-vok-handoff-probe.c"

test -f "$host_include/wamr_secrets_gateway_host.h"
test -f "$host_src/wamr_secrets_gateway_host.c"
test -f "$vok_dir/include/vok_authority_handoff.h"
test -f "$probe"
test -f "$wat"

if ! grep -q 'wamr_secrets_gateway_load_for_authority' \
    "$host_include/wamr_secrets_gateway_host.h"; then
  printf 'WAMR_HOST_ROOT %s has no load_for_authority (need PR #182 host)\n' \
    "$host_root" >&2
  exit 2
fi

cd "$vok_dir"
cargo build --offline --locked --release --lib
test -f "$vok_dir/target/release/libgalerina_vok_authority.a"

temp_dir="$(mktemp -d "${TMPDIR:-/tmp}/rd1413-wamr-vok-handoff.XXXXXX")"
trap 'rm -rf -- "$temp_dir"' EXIT
wat2wasm "$wat" -o "$temp_dir/subset.wasm"

gcc -std=c11 -Wall -Wextra -Werror \
  -I"$wamr_include_dir" \
  -I"$host_include" \
  -I"$vok_dir/include" \
  "$probe" \
  "$host_src/wamr_secrets_gateway_host.c" \
  "$host_src/wamr_import_admission.c" \
  "$host_src/wamr_sha256.c" \
  "$vok_dir/target/release/libgalerina_vok_authority.a" \
  "$wamr_library" -lm -ldl -lpthread \
  -o "$temp_dir/handoff-probe"

"$temp_dir/handoff-probe" "$temp_dir/subset.wasm"

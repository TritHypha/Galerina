#!/usr/bin/env bash
set -euo pipefail
export PATH="$HOME/.cargo/bin:$HOME/.local/bin:$PATH"
root="$(cd "$(dirname "$0")/../.." && pwd)"
host="$root/scripts/lib/assurance-fabric/authenticated-host.mjs"
verifier_dir="$root/scripts/lib/assurance-fabric/signet-verifier"
cd "$verifier_dir"
if [[ ! -f Cargo.lock ]]; then
  cargo generate-lockfile
fi
cargo test --offline --locked -- --test-threads=1
cargo clippy --offline --locked --all-targets -- -D warnings
cargo build --offline --locked --release
bin="$verifier_dir/target/release/galerina-signet-verifier"
helper="$verifier_dir/target/release/signet-sealed-exec"
cc -O2 -Wall -Werror -o "$helper" "$root/scripts/lib/assurance-fabric/signet-sealed-exec.c"
test -x "$bin"
test -x "$helper"
pin="$(sha256sum "$bin" | cut -d ' ' -f1)"
helper_pin="$(sha256sum "$helper" | cut -d ' ' -f1)"
export GATE1_VERIFIER="$bin"
export GATE1_VERIFIER_SHA256="$pin"
export GATE1_SEALED_EXEC="$helper"
export GATE1_SEALED_EXEC_SHA256="$helper_pin"
cd "$root"
echo "=== existing UNAUTHENTICATED_REFERENCE suite ==="
node --test scripts/tests/assurance-private-host.test.mjs
echo "=== authenticated gate 1 suite ==="
node --test scripts/tests/assurance-authenticated-host.test.mjs
echo "=== rust symbols not in node runtime ==="
if command -v ldd >/dev/null 2>&1; then
  echo "node ldd (runtime, not the verifier):"
  ldd "$(command -v node)" | sed -n '1,20p' || true
fi
if nm -D "$(command -v node)" 2>/dev/null | grep -E 'galerina_signet|ed25519_dalek' ; then
  echo "FAIL: rust verifier symbols in node" >&2
  exit 2
fi
echo "NM NONE galerina_signet/ed25519_dalek in node"
echo "=== git status ==="
git status --short || true
echo "=== signet gate 1 PASS ==="

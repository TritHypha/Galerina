#!/usr/bin/env bash
# Wipe-removed and seal-removed mutants against the shipped load-path probe.
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "$0")" && pwd)"
repo_root="$(cd -- "$script_dir/../.." && pwd)"
host_c="$repo_root/packages-ts/galerina-core-runtime/native/wamr-host/src/wamr_secrets_gateway_host.c"
verdict_c="$repo_root/packages-ts/galerina-core-runtime/native/wamr-host/src/wamr_vok_verdict.c"
work="$(mktemp -d "${TMPDIR:-/tmp}/rd1413-fix7-mutants.XXXXXX")"

cleanup() {
  if [[ -f "$work/host.c.bak" ]]; then
    cp "$work/host.c.bak" "$host_c"
  fi
  if [[ -f "$work/verdict.c.bak" ]]; then
    cp "$work/verdict.c.bak" "$verdict_c"
  fi
  rm -rf -- "$work"
}
trap cleanup EXIT

cp "$host_c" "$work/host.c.bak"
cp "$verdict_c" "$work/verdict.c.bak"

run_probe() {
  local label="$1"
  local expect="$2"
  set +e
  bash "$script_dir/run-rd1413-wamr-load-path-probe.sh"
  local rc=$?
  set -e
  if [[ "$expect" == "red" && "$rc" -eq 0 ]]; then
    printf '%s: expected red, probe passed\n' "$label" >&2
    exit 1
  fi
  if [[ "$expect" == "green" && "$rc" -ne 0 ]]; then
    printf '%s: expected green, probe rc=%s\n' "$label" "$rc" >&2
    exit 1
  fi
  printf '%s: %s rc=%s\n' "$label" "$expect" "$rc"
}

run_probe "baseline" "green"

python3 - "$host_c" <<'PY'
from pathlib import Path
import sys
path = Path(sys.argv[1])
text = path.read_text(encoding="utf-8")
old = "        wipe_bytes(loaded->owned_snapshot, loaded->owned_snapshot_size);\n"
if old not in text:
    raise SystemExit("wipe_bytes call not found")
path.write_text(text.replace(old, ""), encoding="utf-8", newline="\n")
PY
run_probe "wipe-removed" "red"
cp "$work/host.c.bak" "$host_c"

python3 - "$verdict_c" <<'PY'
from pathlib import Path
import sys
path = Path(sys.argv[1])
text = path.read_text(encoding="utf-8")
old = """    if (fcntl(mfd, F_ADD_SEALS,
              F_SEAL_WRITE | F_SEAL_GROW | F_SEAL_SHRINK | F_SEAL_SEAL) != 0) {
        close(mfd);
        return -1;
    }
"""
new = """    /* F_SEAL_WRITE F_SEAL_GROW F_SEAL_SHRINK F_SEAL_SEAL tokens kept */
"""
if old not in text:
    raise SystemExit("F_ADD_SEALS call not found")
path.write_text(text.replace(old, new), encoding="utf-8", newline="\n")
PY
run_probe "seal-removed" "red"
cp "$work/verdict.c.bak" "$verdict_c"

run_probe "restored" "green"
echo "=== fix7 mutants wipe-removed and seal-removed red then restored green ==="

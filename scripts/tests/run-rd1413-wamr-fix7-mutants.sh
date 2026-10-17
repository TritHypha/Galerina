#!/usr/bin/env bash
# Wipe-removed and seal-removed mutants against copies of the host (N5).
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "$0")" && pwd)"
repo_root="$(cd -- "$script_dir/../.." && pwd)"
real_src="$repo_root/packages-ts/galerina-core-runtime/native/wamr-host/src"
work="$(mktemp -d "${TMPDIR:-/tmp}/rd1413-fix7-mutants.XXXXXX")"
src_copy="$work/src"

cleanup() {
  rm -rf -- "$work"
}
trap cleanup EXIT

refresh_copy() {
  rm -rf -- "$src_copy"
  mkdir -p -- "$src_copy"
  cp -a -- "$real_src/." "$src_copy/"
}

run_probe() {
  local label="$1"
  local expect="$2"
  set +e
  WAMR_HOST_SRC="$src_copy" bash "$script_dir/run-rd1413-wamr-load-path-probe.sh"
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

refresh_copy
run_probe "baseline" "green"

python3 - "$src_copy/wamr_secrets_gateway_host.c" <<'PY'
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

refresh_copy
python3 - "$src_copy/wamr_vok_verdict.c" <<'PY'
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

refresh_copy
run_probe "restored" "green"
echo "=== fix7 mutants wipe-removed and seal-removed red then restored green ==="

#!/usr/bin/env bash
set -euo pipefail
export PATH="$HOME/.cargo/bin:$HOME/.local/bin:$PATH"
root="$(cd "$(dirname "$0")/../.." && pwd)"
src="$root/scripts/lib/assurance-fabric/authenticated-host.mjs"
verifier_dir="$root/scripts/lib/assurance-fabric/signet-verifier"
bin="$verifier_dir/target/release/galerina-signet-verifier"
if [[ ! -x "$bin" ]]; then
  (cd "$verifier_dir" && cargo build --offline --locked --release)
fi
pin="$(sha256sum "$bin" | cut -d ' ' -f1)"
export GATE1_VERIFIER="$bin"
export GATE1_VERIFIER_SHA256="$pin"
work="$(mktemp -d "${TMPDIR:-/tmp}/signet-gate1-mutants.XXXXXX")"

run_suite() {
  local label="$1"
  local module="$2"
  local expect="$3"
  export GATE1_HOST_MODULE="$module"
  set +e
  node --test "$root/scripts/tests/assurance-authenticated-host.test.mjs" >"$work/$label.out" 2>&1
  local rc=$?
  set -e
  if [[ "$expect" == "red" && "$rc" -eq 0 ]]; then
    echo "FAIL: $label expected red, suite passed" >&2
    cat "$work/$label.out" >&2
    return 1
  fi
  if [[ "$expect" == "green" && "$rc" -ne 0 ]]; then
    echo "FAIL: $label expected green, suite failed" >&2
    cat "$work/$label.out" >&2
    return 1
  fi
  echo "PASS: mutant $label is $expect (rc=$rc)"
}

mutdir="$root/scripts/lib/assurance-fabric"
rust_src="$verifier_dir/src/main.rs"
cleanup_mutants() {
  if [[ -f "$work/main.rs.bak" ]]; then
    cp "$work/main.rs.bak" "$rust_src"
    (cd "$verifier_dir" && cargo build --offline --locked --release) >/dev/null 2>&1 || true
  fi
  rm -f "$mutdir"/.gate1-mutant-*.mjs
  rm -rf -- "$work"
}
trap cleanup_mutants EXIT

run_suite "baseline" "$src" "green"

strip_tag() {
  local tag="$1"
  local dest="$2"
  python3 - "$src" "$dest" "$tag" <<'PY'
import sys
src, dest, tag = sys.argv[1], sys.argv[2], sys.argv[3]
text = open(src, "r", encoding="utf-8").read()
lines = [line for line in text.splitlines(True) if tag not in line]
open(dest, "w", encoding="utf-8", newline="\n").write("".join(lines))
PY
}

strip_tag "GATE1_GUARD_TAMPER" "$mutdir/.gate1-mutant-tamper.mjs"
run_suite "tamper" "$mutdir/.gate1-mutant-tamper.mjs" "red"

# Wrong-issuer shares Ed25519 verification; skipping the pin without skipping
# the signature still refuses a foreign grant. The issuer mutant removes both.
python3 - "$src" "$mutdir/.gate1-mutant-issuer.mjs" <<'PY'
import sys
src, dest = sys.argv[1], sys.argv[2]
text = open(src, "r", encoding="utf-8").read()
lines = [line for line in text.splitlines(True)
         if "GATE1_GUARD_ISSUER" not in line and "GATE1_GUARD_TAMPER" not in line]
open(dest, "w", encoding="utf-8", newline="\n").write("".join(lines))
PY
run_suite "issuer" "$mutdir/.gate1-mutant-issuer.mjs" "red"

strip_tag "GATE1_GUARD_REPLAY" "$mutdir/.gate1-mutant-replay.mjs"
run_suite "replay" "$mutdir/.gate1-mutant-replay.mjs" "red"

# Kind is bound in the signed payload. Skipping GATE1_GUARD_KIND alone
# still refuses a mislabelled grant at the signature check.
strip_tag "GATE1_GUARD_KIND" "$mutdir/.gate1-mutant-kind-only.mjs"
run_suite "kind-only" "$mutdir/.gate1-mutant-kind-only.mjs" "green"

# Kind mutant removes both GATE1_GUARD_KIND lines and GATE1_GUARD_TAMPER.
python3 - "$src" "$mutdir/.gate1-mutant-kind.mjs" <<'PY'
import sys
src, dest = sys.argv[1], sys.argv[2]
text = open(src, "r", encoding="utf-8").read()
lines = [line for line in text.splitlines(True)
         if "GATE1_GUARD_KIND" not in line and "GATE1_GUARD_TAMPER" not in line]
open(dest, "w", encoding="utf-8", newline="\n").write("".join(lines))
PY
run_suite "kind" "$mutdir/.gate1-mutant-kind.mjs" "red"

strip_tag "GATE1_GUARD_EXPIRED" "$mutdir/.gate1-mutant-expired.mjs"
run_suite "expired" "$mutdir/.gate1-mutant-expired.mjs" "red"

cp "$rust_src" "$work/main.rs.bak"
python3 - "$rust_src" <<'PY'
from pathlib import Path
import sys
path = Path(sys.argv[1])
text = path.read_text(encoding="utf-8")
old = """    // GATE1_GUARD_VERIFY
    match verifying_key.verify(&message, &signature) {
        Ok(()) => emit(1, "OK", 0),
        Err(_) => emit(-1, "TAMPER", 1),
    }"""
new = """    // GATE1_MUTANT_SKIP_VERIFY
    let _ = (&verifying_key, &message, &signature);
    emit(1, "OK", 0)"""
if old not in text:
    raise SystemExit("GATE1_GUARD_VERIFY match arm not found")
path.write_text(text.replace(old, new), encoding="utf-8", newline="\n")
PY
(cd "$verifier_dir" && cargo build --offline --locked --release)
pin="$(sha256sum "$bin" | cut -d ' ' -f1)"
export GATE1_VERIFIER="$bin"
export GATE1_VERIFIER_SHA256="$pin"
run_suite "rust-skip-verify" "$src" "red"
cp "$work/main.rs.bak" "$rust_src"
(cd "$verifier_dir" && cargo build --offline --locked --release)
pin="$(sha256sum "$bin" | cut -d ' ' -f1)"
export GATE1_VERIFIER="$bin"
export GATE1_VERIFIER_SHA256="$pin"

run_suite "restored" "$src" "green"
echo "=== all mutants red then restored green ==="

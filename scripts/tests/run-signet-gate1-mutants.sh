#!/usr/bin/env bash
set -euo pipefail
export PATH="$HOME/.cargo/bin:$HOME/.local/bin:$PATH"
root="$(cd "$(dirname "$0")/../.." && pwd)"
src="$root/scripts/lib/assurance-fabric/authenticated-host.mjs"
verifier_dir="$root/scripts/lib/assurance-fabric/signet-verifier"
bin="$verifier_dir/target/release/galerina-signet-verifier"
helper="$verifier_dir/target/release/signet-sealed-exec"
c_src="$root/scripts/lib/assurance-fabric/signet-sealed-exec.c"
if [[ ! -x "$bin" ]]; then
  (cd "$verifier_dir" && cargo build --offline --locked --release)
fi
if [[ ! -x "$helper" ]]; then
  cc -O2 -Wall -Werror -o "$helper" "$c_src"
fi
pin="$(sha256sum "$bin" | cut -d ' ' -f1)"
export GATE1_VERIFIER="$bin"
export GATE1_VERIFIER_SHA256="$pin"
set_helper() {
  export GATE1_SEALED_EXEC="$1"
  export GATE1_SEALED_EXEC_SHA256="$(sha256sum "$1" | cut -d ' ' -f1)"
}
set_helper "$helper"
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
spawn_src="$root/scripts/lib/assurance-fabric/signet-verifier-spawn.mjs"
cleanup_mutants() {
  if [[ -f "$work/main.rs.bak" ]]; then
    cp "$work/main.rs.bak" "$rust_src"
    (cd "$verifier_dir" && cargo build --offline --locked --release) >/dev/null 2>&1 || true
  fi
  if [[ -f "$work/spawn.mjs.bak" ]]; then
    cp "$work/spawn.mjs.bak" "$spawn_src"
  fi
  rm -f "$mutdir"/.gate1-mutant-*.mjs
  rm -rf -- "$work"
}
cp "$spawn_src" "$work/spawn.mjs.bak"
cp "$rust_src" "$work/main.rs.bak"
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

replace_once() {
  python3 - "$1" "$2" "$3" "$4" <<'PY'
import sys
src, dest, old, new = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
text = open(src, encoding="utf-8").read()
if old not in text:
    raise SystemExit("MUTANT_ANCHOR_MISSING: " + old[:80])
open(dest, "w", encoding="utf-8", newline="\n").write(text.replace(old, new, 1))
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

python3 - "$spawn_src" <<'PY'
from pathlib import Path
import sys
path = Path(sys.argv[1])
text = path.read_text(encoding="utf-8")
old = """    sealedSpawnCount += 1;
    /* GATE1_SEALED_EXEC */
    const result = spawnSync(verifiedHelperPath, [expectedSha256Hex], {
      input,
      encoding: "utf8",
      timeout: timeoutMs,
      maxBuffer: MAX_VERIFY_BYTES,
      env: {},
      shell: false,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe", fd],
    });
    lastHelperStdout = String(result.stdout ?? "");
    lastHelperStderr = String(result.stderr ?? "");
    void verifierPath;
    return parseChildResult(result);"""
new = """    sealedSpawnCount += 1;
    /* GATE1_SEALED_EXEC tokens kept */
    const result = spawnSync(verifierPath, [], {
      input,
      encoding: "utf8",
      timeout: timeoutMs,
      maxBuffer: MAX_VERIFY_BYTES,
      env: {},
      shell: false,
      windowsHide: true,
    });
    lastHelperStdout = String(result.stdout ?? "");
    lastHelperStderr = String(result.stderr ?? "");
    return parseChildResult(result);"""
if old not in text:
    raise SystemExit("GATE1_SEALED_EXEC spawn block not found")
path.write_text(text.replace(old, new), encoding="utf-8", newline="\n")
PY
run_suite "binary-swap" "$src" "red"
cp "$work/spawn.mjs.bak" "$spawn_src"

python3 - "$spawn_src" <<'PY'
from pathlib import Path
import sys
path = Path(sys.argv[1])
text = path.read_text(encoding="utf-8")
lines = [line for line in text.splitlines(True) if "GATE1_GUARD_HEADER" not in line]
path.write_text("".join(lines), encoding="utf-8", newline="\n")
PY
run_suite "header-check-removed" "$src" "red"
cp "$work/spawn.mjs.bak" "$spawn_src"

strip_tag "GATE1_GUARD_RESTART" "$mutdir/.gate1-mutant-restart.mjs"
run_suite "restart-guard-removed" "$mutdir/.gate1-mutant-restart.mjs" "red"

replace_once "$src" "$mutdir/.gate1-mutant-g1.mjs" \
  '    if (payload.action !== requested) throw new TypeError("grant action mismatch");' \
  '    void requested;'
run_suite "g1-action-binding" "$mutdir/.gate1-mutant-g1.mjs" "red"

replace_once "$src" "$mutdir/.gate1-mutant-g2.mjs" \
  '        if (payload.subjectId !== subjectId) return TRIT.DISTRUSTED;' \
  '        void subjectId;'
run_suite "g2-copy-path-subject" "$mutdir/.gate1-mutant-g2.mjs" "red"

replace_once "$src" "$mutdir/.gate1-mutant-g3.mjs" \
  'if (payload.epoch !== epoch || payload.profileDigest !== currentProfileDigest()) {' \
  'if (false) {'
run_suite "g3-copy-path-epoch-profile" "$mutdir/.gate1-mutant-g3.mjs" "red"

replace_once "$src" "$mutdir/.gate1-mutant-g6.mjs" \
  '    if (state.subjectId !== subjectId) return TRIT.DISTRUSTED;' \
  '    void state;'
run_suite "g6-identity-path-subject" "$mutdir/.gate1-mutant-g6.mjs" "red"

replace_once "$src" "$mutdir/.gate1-mutant-g7.mjs" \
  '    if (!ok) return TRIT.DISTRUSTED;' \
  '    void ok;'
run_suite "g7-copy-path-signature" "$mutdir/.gate1-mutant-g7.mjs" "red"

replace_once "$c_src" "$work/g4.c" \
  '    if (!digest_eq(got, want)) {' \
  '    if (0 && !digest_eq(got, want)) {'
cc -O2 -o "$work/g4-helper" "$work/g4.c"
set_helper "$work/g4-helper"
run_suite "g4-c-pin-bypassed" "$src" "red"
set_helper "$helper"

replace_once "$c_src" "$work/g5.c" \
  '    if (fcntl(mfd, F_ADD_SEALS,' \
  '    return mfd;
    if (fcntl(mfd, F_ADD_SEALS,'
cc -O2 -o "$work/g5-helper" "$work/g5.c"
set_helper "$work/g5-helper"
run_suite "g5-memfd-seals-skipped" "$src" "red"
set_helper "$helper"

python3 - "$spawn_src" <<'PY'
from pathlib import Path
import sys
path = Path(sys.argv[1])
text = path.read_text(encoding="utf-8")
old = "  if (result.status === 3) {"
new = "  if (false) {"
if old not in text:
    raise SystemExit("G8 PIN_MISMATCH mapping not found")
path.write_text(text.replace(old, new, 1), encoding="utf-8", newline="\n")
PY
run_suite "g8-exit3-mapping-removed" "$src" "red"
cp "$work/spawn.mjs.bak" "$spawn_src"

strip_tag "GATE1_GUARD_CLOCK" "$mutdir/.gate1-mutant-clock.mjs"
run_suite "clock-guard-removed" "$mutdir/.gate1-mutant-clock.mjs" "red"

strip_tag "GATE1_GUARD_SINK" "$mutdir/.gate1-mutant-sink.mjs"
run_suite "sink-failed-outcome-removed" "$mutdir/.gate1-mutant-sink.mjs" "red"

replace_once "$src" "$mutdir/.gate1-mutant-exact-grant.mjs" \
  '    const recorded = exactRecord(value, GRANT_INPUT_KEYS, "GRANT");' \
  '    const recorded = value;'
run_suite "exact-grant-removed" "$mutdir/.gate1-mutant-exact-grant.mjs" "red"

replace_once "$src" "$mutdir/.gate1-mutant-restart-order.mjs" \
  '    if (epoch === Number.MAX_SAFE_INTEGER) throw new RangeError("host context epoch is exhausted");
    consumed.clear();
    epoch += 1; /* GATE1_GUARD_RESTART */' \
  '    consumed.clear();
    if (epoch === Number.MAX_SAFE_INTEGER) throw new RangeError("host context epoch is exhausted");
    epoch += 1; /* GATE1_GUARD_RESTART */'
run_suite "restart-clears-before-exhaustion-check" "$mutdir/.gate1-mutant-restart-order.mjs" "red"

python3 - "$spawn_src" <<'PY'
from pathlib import Path
import sys
path = Path(sys.argv[1])
text = path.read_text(encoding="utf-8")
old = """  if (actual !== expectedSha256Hex) {
    return { ok: false, result: refuse(mismatchReason, 2) };
  }"""
new = """  if (false && actual !== expectedSha256Hex) {
    return { ok: false, result: refuse(mismatchReason, 2) };
  }"""
if old not in text:
    raise SystemExit("helper pin compare not found")
path.write_text(text.replace(old, new, 1), encoding="utf-8", newline="\n")
PY
run_suite "helper-pin-skipped" "$src" "red"
cp "$work/spawn.mjs.bak" "$spawn_src"

python3 - "$spawn_src" <<'PY'
from pathlib import Path
import sys
path = Path(sys.argv[1])
text = path.read_text(encoding="utf-8")
old = "  if (trit === 1 && result.status !== 0) {"
new = "  if (false && trit === 1 && result.status !== 0) {"
if old not in text:
    raise SystemExit("plus-one status guard not found")
path.write_text(text.replace(old, new, 1), encoding="utf-8", newline="\n")
PY
run_suite "plus-one-without-exit0" "$src" "red"
cp "$work/spawn.mjs.bak" "$spawn_src"

python3 - "$rust_src" <<'PY'
from pathlib import Path
import sys
path = Path(sys.argv[1])
text = path.read_text(encoding="utf-8")
old = "    let mut limited = reader.take((MAX_STDIN as u64) + 1);"
new = "    let mut limited = reader;"
if old not in text:
    raise SystemExit("read_bounded take not found")
path.write_text(text.replace(old, new, 1), encoding="utf-8", newline="\n")
PY
set +e
(cd "$verifier_dir" && cargo test --offline --locked -- --test-threads=1) >"$work/n4-take.out" 2>&1
n4_rc=$?
set -e
if [[ "$n4_rc" -eq 0 ]]; then
  echo "FAIL: n4-take-removed expected red, cargo test passed" >&2
  cat "$work/n4-take.out" >&2
  exit 1
fi
echo "PASS: mutant n4-take-removed is red (rc=$n4_rc)"
cp "$work/main.rs.bak" "$rust_src"
(cd "$verifier_dir" && cargo build --offline --locked --release)
pin="$(sha256sum "$bin" | cut -d ' ' -f1)"
export GATE1_VERIFIER="$bin"
export GATE1_VERIFIER_SHA256="$pin"

run_suite "restored" "$src" "green"
echo "=== git status ==="
git -C "$root" status --short || true
echo "=== all mutants red then restored green ==="

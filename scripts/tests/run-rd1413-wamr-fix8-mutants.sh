#!/usr/bin/env bash
# Behavioural mutants against copies of the WAMR host (N5: never mutate
# tracked files). Each mutant must go red on the shipped load-path probe
# including the forging-stub suite; the tree is restored green at the end.
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "$0")" && pwd)"
repo_root="$(cd -- "$script_dir/../.." && pwd)"
real_src="$repo_root/packages-ts/galerina-core-runtime/native/wamr-host/src"
work="$(mktemp -d "${TMPDIR:-/tmp}/rd1413-fix8-mutants.XXXXXX")"
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

mutate() {
  local file="$1"
  python3 - "$src_copy/$file" "$2" "$3" <<'PY'
from pathlib import Path
import sys
path = Path(sys.argv[1])
old = sys.argv[2]
new = sys.argv[3]
text = path.read_text(encoding="utf-8")
if old not in text:
    raise SystemExit("mutant original not found in " + str(path))
path.write_text(text.replace(old, new, 1), encoding="utf-8", newline="\n")
PY
}

refresh_copy
run_probe "baseline" "green"

refresh_copy
mutate "wamr_secrets_gateway_host.c" \
  "        wipe_bytes(loaded->owned_snapshot, loaded->owned_snapshot_size);" \
  "        /* SNAPSHOT_WIPE wipe_bytes token kept */"
run_probe "wipe-removed" "red"

refresh_copy
mutate "wamr_vok_verdict.c" \
  "    if (fcntl(mfd, F_ADD_SEALS,
              F_SEAL_WRITE | F_SEAL_GROW | F_SEAL_SHRINK | F_SEAL_SEAL) != 0) {
        close(mfd);
        return -1;
    }
" \
  "    /* F_SEAL_WRITE F_SEAL_GROW F_SEAL_SHRINK F_SEAL_SEAL tokens kept */
"
run_probe "seal-removed" "red"

refresh_copy
mutate "wamr_vok_verdict.c" \
  "    if (!WIFEXITED(status) || WEXITSTATUS(status) != 0) {
        return WAMR_VOK_BIND_REFUSED;
    }
" \
  "    if (0 && (!WIFEXITED(status) || WEXITSTATUS(status) != 0)) {
        return WAMR_VOK_BIND_REFUSED;
    }
"
run_probe "exit-status-off" "red"

refresh_copy
mutate "wamr_vok_verdict.c" \
  "    if (seal->authorizing || seal->replayable ||
" \
  "    if (seal->replayable || /* authorizing check off */
"
run_probe "authorizing-off" "red"

refresh_copy
mutate "wamr_vok_verdict.c" \
  "    if (!digest_eq_ct(recomputed, envelope->envelope_digest) ||
        !digest_eq_ct(seal->envelope_digest, envelope->envelope_digest)) {
        return WAMR_VOK_BIND_REFUSED;
    }
" \
  "    if (0 && (!digest_eq_ct(recomputed, envelope->envelope_digest) ||
        !digest_eq_ct(seal->envelope_digest, envelope->envelope_digest))) {
        return WAMR_VOK_BIND_REFUSED;
    }
"
run_probe "envelope-recompute-off" "red"

refresh_copy
mutate "wamr_vok_verdict.c" \
  "    if (cursor != end) {
        return WAMR_VOK_BIND_REFUSED;
    }
" \
  "    if (0 && cursor != end) {
        return WAMR_VOK_BIND_REFUSED;
    }
"
run_probe "trailing-byte-off" "red"

refresh_copy
mutate "wamr_vok_verdict.c" \
  "    if (!digest_eq_ct(computed, envelope->component_digest)) {
        return WAMR_VOK_BIND_MISMATCH;
    }
" \
  "    if (0 && !digest_eq_ct(computed, envelope->component_digest)) {
        return WAMR_VOK_BIND_MISMATCH;
    }
"
run_probe "component-check-off" "red"

refresh_copy
mutate "wamr_secrets_gateway_host.c" \
  "        memset(computed, 0, sizeof(computed));
        release_loaded(out);
        return WAMR_SECRETS_GATEWAY_ARTIFACT_MISMATCH;
" \
  "        memset(computed, 0, sizeof(computed));
        /* release_loaded token kept on mismatch */
        return WAMR_SECRETS_GATEWAY_ARTIFACT_MISMATCH;
"
run_probe "no-release-on-mismatch" "red"

refresh_copy
mutate "wamr_secrets_gateway_host.c" \
  "        set_code_diagnostic(diagnostic, diagnostic_capacity, mapped,
                            \"pinned-child\");
        release_loaded(out);
        return mapped;
" \
  "        set_code_diagnostic(diagnostic, diagnostic_capacity, mapped,
                            \"pinned-child\");
        /* release_loaded token kept on verdict-refused */
        return mapped;
"
run_probe "no-release-on-verdict-refused" "red"

refresh_copy
mutate "wamr_vok_verdict.c" \
  "    if (!block_sigpipe(&old_mask)) {
        (void)kill(child, SIGKILL);
        (void)waitpid(child, &status, 0);
        close_fd(&in_pipe[1]);
        close_fd(&out_pipe[0]);
        close_fd(&err_pipe[0]);
        return WAMR_VOK_BIND_REFUSED;
    }
    sigpipe_blocked = 1;
" \
  "    if (0 && !block_sigpipe(&old_mask)) {
        (void)kill(child, SIGKILL);
        (void)waitpid(child, &status, 0);
        close_fd(&in_pipe[1]);
        close_fd(&out_pipe[0]);
        close_fd(&err_pipe[0]);
        return WAMR_VOK_BIND_REFUSED;
    }
    sigpipe_blocked = 0;
"
mutate "wamr_vok_verdict.c" \
  "        if (stdin_ix >= 0 &&
            (fds[stdin_ix].revents &
             (POLLOUT | POLLERR | POLLHUP | POLLNVAL))) {
            if (fds[stdin_ix].revents & (POLLERR | POLLHUP | POLLNVAL)) {
                close_fd(&in_pipe[1]);
                stdin_open = 0;
            } else {
                ssize_t n = write(in_pipe[1], bytes + written, size - written);
" \
  "        if (stdin_ix >= 0 && (fds[stdin_ix].revents & (POLLOUT | POLLERR | POLLHUP | POLLNVAL))) {
            {
                ssize_t n = write(in_pipe[1], bytes + written, size - written);
"
run_probe "sigpipe-handling-off" "red"

refresh_copy
mutate "wamr_vok_verdict.c" \
  "    if (!set_nonblock(in_pipe[1]) || !set_nonblock(out_pipe[0]) ||
        !set_nonblock(err_pipe[0])) {
        (void)kill(child, SIGKILL);
        (void)waitpid(child, &status, 0);
        close_fd(&in_pipe[1]);
        close_fd(&out_pipe[0]);
        close_fd(&err_pipe[0]);
        return WAMR_VOK_BIND_REFUSED;
    }
" \
  "    if (0 && (!set_nonblock(in_pipe[1]) || !set_nonblock(out_pipe[0]) ||
        !set_nonblock(err_pipe[0]))) {
        (void)kill(child, SIGKILL);
        (void)waitpid(child, &status, 0);
        close_fd(&in_pipe[1]);
        close_fd(&out_pipe[0]);
        close_fd(&err_pipe[0]);
        return WAMR_VOK_BIND_REFUSED;
    }
"
run_probe "ononblock-off" "red"

refresh_copy
mutate "wamr_vok_verdict.c" \
  "        close_extra_child_fds(mem_fd);
" \
  "        if (0) {
            close_extra_child_fds(mem_fd);
        }
"
run_probe "fd-close-off" "red"

refresh_copy
mutate "wamr_vok_verdict.c" \
  "    if (!digest_eq_ct(hashed, pin)) {
        memset(verifier_bytes, 0, verifier_size);
        free(verifier_bytes);
        return WAMR_VOK_BIND_REFUSED;
    }
" \
  "    if (0 && !digest_eq_ct(hashed, pin)) {
        memset(verifier_bytes, 0, verifier_size);
        free(verifier_bytes);
        return WAMR_VOK_BIND_REFUSED;
    }
"
run_probe "pin-check-off" "red"

refresh_copy
mutate "wamr_vok_verdict.c" \
  "        fexecve(mem_fd, argv_child, empty_envp);
" \
  "        {
            extern char **environ;
            char **inherited = environ;
            (void)empty_envp;
            fexecve(mem_fd, argv_child, inherited);
        }
"
run_probe "empty-envp-off" "red"

refresh_copy
mutate "wamr_secrets_gateway_host.c" \
  "                            WAMR_SECRETS_GATEWAY_VERDICT_REFUSED, \"AOT_REFUSED\");
        release_loaded(out);
        return WAMR_SECRETS_GATEWAY_VERDICT_REFUSED;
" \
  "                            WAMR_SECRETS_GATEWAY_VERDICT_REFUSED, \"AOT_REFUSED\");
        /* release_loaded token kept on AOT refuse */
        return WAMR_SECRETS_GATEWAY_VERDICT_REFUSED;
"
run_probe "aot-no-release" "red"

refresh_copy
run_probe "restored" "green"
echo "=== fix8 mutants red then restored green ==="

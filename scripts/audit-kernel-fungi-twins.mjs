#!/usr/bin/env node
/**
 * audit-kernel-fungi-twins.mjs — fail-closed gate for the Stage-6 kernel .fungi twins.
 *
 * The app-kernel's governed DECISION surfaces are being converted to `.fungi` twins under
 * src/self-hosted/ (checker-verified now; build-wired when the execution switch #143 lands).
 * A twin that is only checked ONCE rots silently — this gate runs `galerina check` on EVERY
 * kernel twin on every audit pass, so a twin that stops type-checking or governance-verifying
 * is a RED gate, never a silent drift. Zero-dep; spawns the same `galerina check` a developer runs.
 *
 * Exit 0 = every twin is check-clean (0 errors). Exit 1 = at least one twin failed, or the
 * twin directory is missing (fail-closed: the gate cannot silently pass when it cannot look).
 */
import { spawnSync } from "node:child_process";
import { readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TWIN_DIR = join(ROOT, "packages-galerina", "galerina-framework-app-kernel", "src", "self-hosted");
const GALERINA = join(ROOT, "galerina.mjs");

if (!existsSync(TWIN_DIR)) {
  console.error(`kernel-fungi-twins: twin dir missing (${TWIN_DIR}) — fail-closed`);
  process.exit(1);
}

const twins = readdirSync(TWIN_DIR).filter((f) => f.endsWith(".fungi")).sort();
if (twins.length === 0) {
  console.log("kernel-fungi-twins: no twins yet (0 checked) — vacuously green");
  process.exit(0);
}

let failed = 0;
for (const twin of twins) {
  const rel = `packages-galerina/galerina-framework-app-kernel/src/self-hosted/${twin}`;
  const r = spawnSync(process.execPath, [GALERINA, "check", rel], { cwd: ROOT, encoding: "utf8" });
  // Fail-closed: check must exit 0 AND report no POSITIVE error count ("0 errors" is clean;
  // "3 errors" is not). Matching a bare /error/ is wrong — it hits the word in "0 errors".
  const out = (r.stdout ?? "") + (r.stderr ?? "");
  const ok = r.status === 0 && !/[1-9]\d* error/i.test(out);
  console.log(`  ${ok ? "OK  " : "FAIL"} ${twin}${ok ? "" : "  →  " + out.trim().split("\n").slice(-1)[0]}`);
  if (!ok) failed += 1;
}

console.log(`kernel-fungi-twins: ${twins.length - failed}/${twins.length} check-clean`);
process.exit(failed === 0 ? 0 : 1);

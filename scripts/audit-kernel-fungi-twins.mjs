#!/usr/bin/env node
/**
 * audit-kernel-fungi-twins.mjs — fail-closed gate for the Stage-6 governed-surface `.fungi` twins.
 *
 * Governed DECISION surfaces are being converted to `.fungi` twins under `src/self-hosted/` (checker-
 * verified now; build-wired when the execution switch #143 lands) — first the app-kernel, now also the
 * tower-citizen governance core. A twin that is only checked ONCE rots silently — this gate runs
 * `galerina check` on EVERY twin in every declared twin dir on every audit pass, so a twin that stops
 * type-checking or governance-verifying is a RED gate, never a silent drift. Zero-dep; spawns the same
 * `galerina check` a developer runs.
 *
 * (Filename kept as `kernel-fungi-twins` for the dev-tool-index reference; scope is now all TWIN_DIRS.)
 *
 * Exit 0 = every twin in every existing dir is check-clean. Exit 1 = at least one twin failed, or a
 * declared twin dir is missing (fail-closed: the gate cannot silently pass when it cannot look).
 */
import { spawnSync } from "node:child_process";
import { readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const GALERINA = join(ROOT, "galerina.mjs");

// Declared self-hosted twin dirs (repo-relative). Add a package's `src/self-hosted` here when it gains twins.
const TWIN_DIRS = [
  "packages-galerina/galerina-framework-app-kernel/src/self-hosted",
  "packages-galerina/galerina-tower-citizen/src/self-hosted",
  "packages-galerina/galerina-core-sentinel-memory/src/self-hosted",
  "packages-galerina/galerina-core-sentinel-io/src/self-hosted",
];

let failed = 0;
let checked = 0;

for (const dir of TWIN_DIRS) {
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) {
    console.error(`fungi-twins: declared twin dir missing (${dir}) — fail-closed`);
    failed += 1;
    continue;
  }
  const twins = readdirSync(abs).filter((f) => f.endsWith(".fungi")).sort();
  for (const twin of twins) {
    const rel = `${dir}/${twin}`;
    const r = spawnSync(process.execPath, [GALERINA, "check", rel], { cwd: ROOT, encoding: "utf8" });
    // Fail-closed: check must exit 0 AND report no POSITIVE error count ("0 errors" is clean;
    // "3 errors" is not). Matching a bare /error/ is wrong — it hits the word in "0 errors".
    const out = (r.stdout ?? "") + (r.stderr ?? "");
    const ok = r.status === 0 && !/[1-9]\d* error/i.test(out);
    console.log(`  ${ok ? "OK  " : "FAIL"} ${rel}${ok ? "" : "  →  " + out.trim().split("\n").slice(-1)[0]}`);
    checked += 1;
    if (!ok) failed += 1;
  }
}

if (checked === 0 && failed === 0) {
  console.log("fungi-twins: no twins yet (0 checked) — vacuously green");
  process.exit(0);
}
console.log(`fungi-twins: ${checked - failed}/${checked} check-clean across ${TWIN_DIRS.length} dir(s)`);
process.exit(failed === 0 ? 0 : 1);

#!/usr/bin/env node
// =============================================================================
// audit-retention-nightly.mjs — the NIGHTLY / RELEASE stage of the retention gate.
//
// The per-commit stage (`audit-retention-gate.mjs`) is static: it reads code. This
// stage MEASURES — it runs real workloads and watches live memory across iterations.
// It is separate for one honest reason: it needs a forced full GC between samples and
// takes tens of seconds per subject, which does not belong on every commit. Putting it
// there would make people skip the gate, and a skipped gate is worse than no gate.
//
// ★ WHAT THIS STAGE CAN AND CANNOT SHOW.
// It can establish PRESENCE of retention on a path a workload actually exercises. It
// can never establish ABSENCE: a cache that only fills on an error path, or behind a
// flag the harness never set, is invisible to it. That is intrinsic to runtime leak
// detection — AddressSanitizer has exactly the same blindness — and it is why the
// static pass exists beside it rather than instead of it.
//
// ★ PLATFORM. The owner ruling asks for "dynamic retention measurements across
// supported platforms". This script measures THIS platform and says which one it was.
// It does not pretend to speak for others: a leak that only appears under a different
// allocator would be invisible here, and reporting one platform's result as "the"
// result is the kind of quiet over-claim the estate's discipline exists to stop. CI
// runs it once per platform and compares the reports.
//
// EXIT: 0 clean · 1 retention detected · 2 harness/self-test failure
// =============================================================================

import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import process from "node:process";
import { parseRetentionReceipt } from "./lib/retention-receipt.mjs";

function findGalerina() {
  const here = dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
  const root = dirname(here);
  if (!existsSync(join(root, "packages-ts"))) {
    throw new Error(`cannot locate the Galerina checkout: no packages-ts under ${root}`);
  }
  return root.replace(/\\/g, "/");
}
const ROOT = findGalerina();
const SCRIPTS = ROOT + "/scripts";
const P = console.log;

P("== nightly retention stage ==");
P(`  platform ${process.platform}/${process.arch} · node ${process.version}`);
P("  ⚠ this result speaks for THIS platform only — a leak that appears under a different");
P("    allocator is invisible here. CI compares one report per supported platform.\n");

// ---------------------------------------------------------------------------
// Stage 0 — the detector proves itself, or nothing below means anything.
// ---------------------------------------------------------------------------
{
  const r = spawnSync(process.execPath, [SCRIPTS + "/audit-memory-leak.mjs", "--self-test"],
    { encoding: "utf8", timeout: 900000 });
  if (r.status !== 0) {
    console.error("  ❌ the dynamic detector failed its own self-test — refusing to report a result.");
    console.error("     'no retention found' from an unproven detector is indistinguishable from");
    console.error("     'the detector cannot detect'.");
    console.error(((r.stdout || "") + (r.stderr || "")).split(/\r?\n/).slice(-25).join("\n"));
    process.exit(2);
  }
  P("  * detector self-test passed (known leaker flagged, clean workload silent, off-heap leaker flagged)");
}

// ---------------------------------------------------------------------------
// Stage 1 — measured subjects.
// Each subject is a real workload. `env` lets one subject be driven two ways, which
// is how the identical/unique distinction is made: growth on UNIQUE input is a cache
// filling; growth on IDENTICAL input cannot be.
// ---------------------------------------------------------------------------
const SUBJECTS = [
  { name: "compiler pipeline, identical input", file: "subject-galerina-compile.mjs", env: { LEAK_MODE: "identical" } },
  { name: "compiler pipeline, unique input", file: "subject-galerina-compile.mjs", env: { LEAK_MODE: "unique" } },
];

let failures = 0, ran = 0;
for (const s of SUBJECTS) {
  P(`\n-- ${s.name}`);
  const r = spawnSync(process.execPath,
    [SCRIPTS + "/audit-memory-leak.mjs", "--run", SCRIPTS + "/" + s.file, "--iters", "40", "--warmup", "10"],
    { encoding: "utf8", timeout: 1800000, env: { ...process.env, ...s.env } });
  const out = (r.stdout || "") + (r.stderr || "");
  const receipt = parseRetentionReceipt({ status: r.status, stdout: r.stdout, stderr: r.stderr });
  if (!receipt.ok) {
    console.error("  ❌ incomplete or invalid subject receipt — refusing to summarise as clean.");
    console.error("     " + receipt.reason);
    console.error(out.split(/\r?\n/).slice(-12).join("\n"));
    process.exit(2);
  }
  ran++;
  // The parser scopes output to the final subject section and requires all
  // channels plus a status-consistent verdict. Fixture output can therefore
  // never be mistaken for the subject's result.
  receipt.channelLines.forEach((line) => P("  " + line.trim()));
  P("  -> " + receipt.verdict);
  if (receipt.leak) {
    failures++;
  }
}

// ---------------------------------------------------------------------------
// Stage 2 — the bounded caches are still bounded through the production path.
// ---------------------------------------------------------------------------
P("\n-- execution-graph cache invariant (through executeFlow)");
{
  const r = spawnSync(process.execPath, [SCRIPTS + "/kat-executeflow-cache-growth.mjs"],
    { encoding: "utf8", timeout: 900000 });
  const out = (r.stdout || "") + (r.stderr || "");
  out.split(/\r?\n/).filter((l) => /^\s{2}\d\.|VERDICT|evictions/.test(l)).forEach((l) => P("  " + l.trim()));
  if (r.status !== 0) failures++;
}

P("\n== result ==");
P(`  ${ran}/${SUBJECTS.length} subject(s) measured on ${process.platform}/${process.arch}`);
if (failures > 0) { console.error(`  NIGHTLY RETENTION: FAIL (${failures})`); process.exit(1); }
P("  NIGHTLY RETENTION: PASS");
P("  Scope: presence-only. A clean result here means no retention was observed on the");
P("  paths these subjects exercise — never that none exists. The static stage covers");
P("  what execution does not reach.");
process.exit(0);

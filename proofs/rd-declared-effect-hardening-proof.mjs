// rd-declared-effect-hardening-proof.mjs (2026-07-02)
// Owner decision "harden after proof" (task #13/#5): declared effect names must be
// validated at the production boundary, and a signed manifest must never be minted
// for an artifact production-strict rejects. This proof machine-checks the LIVE
// compiler + bundled CLI (not a model):
//   P1  production-strict checkEffects ERRORS on an unknown declared name
//   P2  deny-only eval.execute → FUNGI-EFFECT-006 error (recognised, never grantable),
//       and it has NO grant path (mask-invisible, no capability mapping)
//   P3  deprecated alias ai.infer → FUNGI-EFFECT-004 with canonical suggestion ai.inference
//   P4  telemetry.read is canonical AND mask-visible (CG-2)
//   P5  CG-4 at the BUNDLED CLI: a lenient `build --package` of a production-violating
//       package emits NO .lmanifest / .fuse.json (the 2026-07-02-found signing fail-open, closed)
//   P6  control: a clean package DOES mint its manifest (the gate is not over-broad)
// DISMISSED posture (recorded per prove-own-maths): "keep lenient + sign anyway"
// was refuted empirically 2026-07-02 — the pre-fix bundled CLI hybrid-SIGNED
// effects{totally.fake.effect}, i.e. a governance-violating artifact received an
// admission credential (CG-4 fail-open). P5/P6 pin the fix; P1 pins the boundary.
// Exit 0 = all GREEN.
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

// Resolve the Galerina repo: env override → cwd (cadence runs from repo root) → KB sibling.
const HERE = dirname(fileURLToPath(import.meta.url));
const CANDIDATES = [process.env.GALERINA_ROOT, process.cwd(), join(HERE, "../../Galerina")].filter(Boolean);
const ROOT = CANDIDATES.find((c) => existsSync(join(c, "galerina.mjs")));
assert.ok(ROOT, `Galerina repo not found (tried: ${CANDIDATES.join(" | ")}) — refusing to report green on nothing`);

const dist = await import(pathToFileURL(join(ROOT, "packages-galerina/galerina-core-compiler/dist/index.js")).href);
const { parseProgram, checkEffects, effectsToFlags } = dist;

const diagsFor = (name) => {
  const p = parseProgram(
    `secure flow f(x: Int) -> Int contract { effects { ${name} } } { return x }`, "proof.fungi");
  return checkEffects(p.flows, p.ast, "production", true).flatMap((r) => r.diagnostics ?? []);
};

// P1 — unknown declared name errors at production strictness
{
  const d = diagsFor("totally.fake.effect").find((x) => x.code === "FUNGI-EFFECT-004");
  assert.ok(d && d.severity === "error" && d.name === "UNKNOWN_EFFECT", "P1: unknown name must ERROR");
  console.log("P1 ✅ production-strict rejects an unknown declared effect name");
}
// P2 — deny-only: recognised, never grantable, no grant path
{
  const d = diagsFor("eval.execute").find((x) => x.code === "FUNGI-EFFECT-006");
  assert.ok(d && d.severity === "error", "P2: deny-only must ERROR with its own code");
  assert.equal(effectsToFlags(["eval.execute"]), 0, "P2: deny-only must be mask-invisible");
  console.log("P2 ✅ eval.execute is deny-only (FUNGI-EFFECT-006) with no grant path");
}
// P3 — deprecated alias points at the canonical name
{
  const d = diagsFor("ai.infer").find((x) => x.code === "FUNGI-EFFECT-004");
  assert.ok(d && d.suggestedCode === "ai.inference", "P3: ai.infer must suggest ai.inference");
  console.log("P3 ✅ ai.infer is a one-way deprecation alias of ai.inference");
}
// P4 — telemetry.read canonical + mask-visible
{
  const bad = diagsFor("telemetry.read").filter((x) => /^FUNGI-EFFECT-00[456]$/.test(x.code));
  assert.equal(bad.length, 0, "P4: telemetry.read must carry no name diagnostics");
  assert.notEqual(effectsToFlags(["telemetry.read"]), 0, "P4: telemetry.read must have a flag bit (CG-2)");
  console.log("P4 ✅ telemetry.read is canonical and mask-visible");
}
// P5/P6 — CG-4 at the bundled CLI (one lenient build each way)
{
  const tmp = mkdtempSync(join(tmpdir(), "fungi-proof-cg4-"));
  try {
    const mk = (name, effects) => {
      const dir = join(tmp, name);
      mkdirSync(join(dir, "src"), { recursive: true });
      writeFileSync(join(dir, "package.fungi.json"), JSON.stringify({ name, entry: "src/index.fungi" }));
      writeFileSync(join(dir, "src", "index.fungi"),
        `secure flow f(x: Int) -> Int\ncontract {\n  intent "proof fixture"\n  effects { ${effects} }\n}\n{\n  return x\n}\n`);
      return dir;
    };
    const build = (dir) => spawnSync("node", [join(ROOT, "galerina.mjs"), "build", "--package", dir],
      { cwd: ROOT, encoding: "utf8", timeout: 120_000, shell: process.platform === "win32" });

    const bad = mk("proof-violating", "totally.fake.effect");
    const rBad = build(bad);
    assert.equal(rBad.status, 0, "P5: lenient build still compiles");
    assert.ok(!existsSync(join(bad, "dist", "proof-violating.lmanifest")), "P5: NO manifest for a violating package");
    assert.ok(!existsSync(join(bad, "dist", "proof-violating.fuse.json")), "P5: NO fusion descriptor either");
    console.log("P5 ✅ lenient build --package refuses to mint a manifest for a production-violating package (CG-4)");

    const good = mk("proof-clean", "");
    const rGood = build(good);
    assert.equal(rGood.status, 0, "P6: clean build must succeed");
    assert.ok(existsSync(join(good, "dist", "proof-clean.lmanifest")), "P6: clean package mints its manifest");
    console.log("P6 ✅ clean package still mints (gate is not over-broad)");
  } finally {
    try { rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ }
  }
}
console.log("DISMISSED (recorded): 'keep lenient + sign anyway' — refuted 2026-07-02: the pre-fix bundled CLI hybrid-signed effects{totally.fake.effect} (admission credential for a governance-violating artifact).");
console.log("ALL GREEN — declared-effect hardening proof (P1–P6).");

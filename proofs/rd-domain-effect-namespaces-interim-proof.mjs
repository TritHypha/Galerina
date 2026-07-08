// rd-domain-effect-namespaces-interim-proof.mjs (2026-07-02)
// Task #8 (owner-gated decision, R&D done in advance per owner instruction):
// the aerospace showcase invents domain effect names (mission.read, orbit.compute,
// propulsion.plan, navigation.compute, flight_control.propose) that sit on a
// reviewed WARN-level allowlist in the corpus gate. This proof pins the claim
// that makes the interim state SAFE:
//
//   N1  an invented domain name grants NOTHING: it is mask-INVISIBLE
//       (effectsToFlags = 0 — no V_DPM/EffectFlags bit can ever carry it)
//   N2  production-strict compile REJECTS a flow declaring it (FUNGI-EFFECT-004)
//   N3  even a lenient (dev) build refuses to mint a signed .lmanifest for it
//       (the CG-4 pre-signing gate re-checks production strictness)
//   N4  the corpus gate BLOCKS any NEW invented name (the allowlist is exact
//       (file,name) pairs — a different name in the same file still fails)
//
// So the allowlisted names are teaching text only: no admission surface exists.
// DISMISSED alternative (recorded): "let unknown names float as forward-compat
// custom capabilities" — refuted by N1-N3 being desirable, not accidental: a
// floating name that ever GAINED a grant path silently would be the vocabulary
// fail-open C10 now blocks. The sound custom-namespace design (if the owner
// wants one) is package-scoped ALIAS declarations onto canonical families —
// mechanically the shipped EFFECT_NAME_ALIASES model, scoped and signed.
// Exit 0 = all GREEN.
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const CANDIDATES = [process.env.GALERINA_ROOT, process.cwd(), join(HERE, "../../Galerina")].filter(Boolean);
const ROOT = CANDIDATES.find((c) => existsSync(join(c, "galerina.mjs")));
assert.ok(ROOT, `Galerina repo not found (tried: ${CANDIDATES.join(" | ")})`);

const dist = await import(pathToFileURL(join(ROOT, "packages-galerina/galerina-core-compiler/dist/index.js")).href);
const { parseProgram, checkEffects, effectsToFlags } = dist;
const INVENTED = ["mission.read", "orbit.compute", "propulsion.plan", "navigation.compute", "flight_control.propose"];

// N1 — mask-invisible: no bit can carry an invented name
for (const name of INVENTED) {
  // BK-1 (2026-07-03, POST-DATES this proof): an unmapped name sets the UnmappedEffect
  // SENTINEL (1<<30), not 0 (fail-CLOSED hardening). Property is unchanged: no GRANTABLE
  // capability bit survives masking out the sentinel.
  assert.equal(effectsToFlags([name]) & ~(1 << 30), 0, `N1: ${name} carries no grantable EffectFlags bit (UnmappedEffect sentinel only)`);
}
console.log("N1 ✅ every invented aerospace name is mask-invisible (no grant bit exists)");

// N2 — production-strict compile rejects each
for (const name of INVENTED) {
  const p = parseProgram(`secure flow f(x: Int) -> Int contract { effects { ${name} } } { return x }`, "n2.fungi");
  const errs = checkEffects(p.flows, p.ast, "production", true)
    .flatMap((r) => r.diagnostics ?? [])
    .filter((d) => d.code === "FUNGI-EFFECT-004" && d.severity === "error");
  assert.ok(errs.length > 0, `N2: production must reject ${name}`);
}
console.log("N2 ✅ production-strict compile rejects every invented name (FUNGI-EFFECT-004)");

// N3 — a lenient package build of an invented-name flow mints NO signed manifest
{
  const tmp = mkdtempSync(join(tmpdir(), "fungi-proof-ns-"));
  try {
    const dir = join(tmp, "ns-pkg");
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "package.fungi.json"), JSON.stringify({ name: "ns-pkg", entry: "src/index.fungi" }));
    writeFileSync(join(dir, "src", "index.fungi"),
      `secure flow f(x: Int) -> Int\ncontract {\n  intent "ns proof"\n  effects { mission.read }\n}\n{\n  return x\n}\n`);
    const r = spawnSync("node", [join(ROOT, "galerina.mjs"), "build", "--package", dir],
      { cwd: ROOT, encoding: "utf8", timeout: 120_000, shell: process.platform === "win32" });
    assert.equal(r.status, 0, "N3: lenient build still compiles");
    assert.ok(!existsSync(join(dir, "dist", "ns-pkg.lmanifest")), "N3: no signed manifest for an invented-name flow");
  } finally {
    try { rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ }
  }
}
console.log("N3 ✅ lenient build mints NO signed manifest for an invented-name flow (CG-4)");

// N4 — the corpus gate blocks a NEW invented name even in an allowlisted file's directory
{
  const tmp = mkdtempSync(join(tmpdir(), "fungi-proof-ns4-"));
  try {
    mkdirSync(join(tmp, "packages-galerina", "galerina-core-compiler", "src"), { recursive: true });
    writeFileSync(join(tmp, "packages-galerina", "galerina-core-compiler", "src", "effect-checker.ts"), [
      `const CANONICAL_EFFECTS = new Set(["audit.write"]);`,
      `const EFFECT_NAME_ALIASES: ReadonlyMap<string, string> = new Map([]);`,
      `const BROAD_EFFECT_ALIASES: ReadonlySet<string> = new Set([]);`,
      `const DENY_ONLY_EFFECTS: ReadonlySet<string> = new Set([]);`,
    ].join("\n"));
    mkdirSync(join(tmp, "examples", "aerospace"), { recursive: true });
    writeFileSync(join(tmp, "examples", "aerospace", "planSatelliteManeuver.fungi"),
      `secure flow f(x: Int) -> Int\ncontract {\n  intent "n4"\n  effects { brand.new.invented }\n}\n{ return x }\n`);
    const r = spawnSync("node", [join(ROOT, "scripts", "audit-corpus-effect-names.mjs"), "--root", tmp],
      { encoding: "utf8", timeout: 60_000, shell: process.platform === "win32" });
    assert.equal(r.status, 1, "N4: a NEW invented name must BLOCK even in an allowlisted file path");
  } finally {
    try { rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ }
  }
}
console.log("N4 ✅ corpus gate blocks any NEW invented name (allowlist is exact pairs, not a blanket)");
console.log("DISMISSED (recorded): floating unknown names as implicit custom capabilities — the grant-path absence (N1-N3) is the safety property; C10 gates it staying absent.");
console.log("ALL GREEN — domain-namespace interim safety proof (N1–N4).");

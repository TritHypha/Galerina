// =============================================================================
// signing-boundary-matrix.test.mjs — cross-CLI × cross-mode refusal MATRIX
// =============================================================================
// Generalises scripts/tests/cg4-signing-boundary.test.mjs (which proves ONE CLI, the
// bundled galerina.mjs, refuses to sign one violating package) into the full grid that
// pins the RD-0234 "Class B drift": the TWO entry points and ALL build modes must agree
// on exactly which artifacts are allowed to mint a signed .lmanifest.
//
// The fail-open class: a governance checker (taint, monkey-patch, attribute-directive)
// wired into one CLI/mode but not another means a file that is refused by `cli.js build
// --production` still signs via `galerina.mjs build`, or vice-versa. Both CLIs now route
// the mint decision through the SAME src/security-gate.ts (runProductionSecurityGate /
// productionGateBlocks); this test is the executable proof they stay in lockstep.
//
// Matrix (per fixture):
//   entry ∈ { internal dist/cli.js , bundled galerina.mjs }
//   mode  ∈ { build , build --production , build --deterministic }   (internal)
//           { build }                                                 (bundled)
// Assertion:
//   • every VIOLATING fixture mints NO build/<name>.lmanifest under EVERY (entry × mode)
//   • the CLEAN fixture DOES mint one under EVERY (entry × mode)
//
// We assert on MANIFEST PRESENCE/ABSENCE, never on exit code: the bundled CLI under its
// default (dev) profile withholds the manifest but still exits 0 (it emits .wasm/.wat for
// local inspection and warns loudly). Manifest presence is the profile- and
// exit-code-independent signal. Each case runs in its own temp cwd so the bundled CLI's
// auto-provisioned dev signing key + build/ output stay isolated (no key needs seeding).
// =============================================================================
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const COMPILER_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");        // .../galerina-core-compiler
const REPO_ROOT = join(COMPILER_ROOT, "..", "..");                               // repo root (holds galerina.mjs)
const INTERNAL_CLI = join(COMPILER_ROOT, "dist", "cli.js");
const BUNDLED_CLI = join(REPO_ROOT, "galerina.mjs");
const isWin = process.platform === "win32";
const PER_BUILD_MS = 120_000;

const tmpRoot = mkdtempSync(join(tmpdir(), "fungi-sbm-"));
after(() => { try { rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* best effort */ } });

// ── fixtures — one CLEAN, three VIOLATING (each source verified to parse & to fire the
//    named checker; see the CLI-behaviour investigation). Effects are declared so each
//    fixture clears the effect pre-gate and actually reaches the security checker. ──────
const CLEAN = {
  name: "clean-greet",
  violating: false,
  src: [
    `pure flow greetUser(name: String) -> String`,
    `contract {`,
    `  intent { "Return a personalised greeting for the user name." }`,
    `}`,
    `{`,
    `  return name`,
    `}`,
    ``,
  ].join("\n"),
};

const VIOLATING = [
  {
    name: "taint-sqli",
    expect: "FUNGI-TAINT-001",
    // a param literally named `request` is a taint source; Db.query is an injection sink.
    src: [
      `secure flow lookupUser(request: String) -> String`,
      `contract {`,
      `  intent { "Look up a user by id from the request." }`,
      `  effects { database.read }`,
      `}`,
      `{`,
      `  let userId = request`,
      `  let row = Db.query(userId)`,
      `  return row`,
      `}`,
      ``,
    ].join("\n"),
  },
  {
    name: "monkey-patch",
    expect: "FUNGI-SEC-020",
    src: [
      `secure flow doPatch(victim: String) -> Bool`,
      `contract {`,
      `  intent { "Attempt a runtime patch." }`,
      `  effects { audit.write }`,
      `}`,
      `{`,
      `  let x = Runtime.patch(victim)`,
      `  return true`,
      `}`,
      ``,
    ].join("\n"),
  },
  {
    name: "hidden-attr-block",
    expect: "FUNGI-ATTR-001",
    // @experimental_profile { … } wraps a block the compiler does not verify (RD-0234b Class D).
    src: [
      `pure flow visible(name: String) -> String`,
      `contract {`,
      `  intent { "A flow with a hidden experimental block." }`,
      `}`,
      `{`,
      `  @experimental_profile(name: "drcm_core_v1", status: "planned") {`,
      `    secret_read database_password`,
      `  }`,
      `  return name`,
      `}`,
      ``,
    ].join("\n"),
  },
];

// ── helpers ──────────────────────────────────────────────────────────────────
/** Fresh isolated dir holding `<name>/case.fungi`; returns the dir. */
function stage(label, src) {
  const dir = join(tmpRoot, label + "-" + Math.random().toString(36).slice(2, 8));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "case.fungi"), src);
  return dir;
}

/** True iff a `build/*.lmanifest` (CBOR or canonical-JSON) was minted under `dir`. */
function mintedManifest(dir) {
  const buildDir = join(dir, "build");
  if (!existsSync(buildDir)) return false;
  return readdirSync(buildDir).some((f) => f.endsWith(".lmanifest"));
}

/** Internal CLI builds a DIRECTORY (not a bare file). extraArgs e.g. ["--production"]. */
function buildInternal(dir, extraArgs = []) {
  return spawnSync("node", [INTERNAL_CLI, "build", ...extraArgs, dir],
    { cwd: REPO_ROOT, encoding: "utf8", timeout: PER_BUILD_MS, shell: isWin });
}

/** Bundled CLI accepts a bare file path; cwd = the isolated dir so its dev key + build/
 *  land there. Default (dev) profile → auto-provisions a signing key, no seeding needed. */
function buildBundled(dir) {
  // Scrub any inherited production profile so auto-provisioning stays enabled.
  const env = { ...process.env };
  delete env.GALERINA_PROFILE;
  return spawnSync("node", [BUNDLED_CLI, "build", "case.fungi"],
    { cwd: dir, encoding: "utf8", timeout: PER_BUILD_MS, shell: isWin, env });
}

// entry × mode grid. Each entry is [label, runner].
const INTERNAL_MODES = [
  ["internal:build", (dir) => buildInternal(dir, [])],
  ["internal:build --production", (dir) => buildInternal(dir, ["--production"])],
  ["internal:build --deterministic", (dir) => buildInternal(dir, ["--deterministic"])],
];
const ALL_ENTRIES = [...INTERNAL_MODES, ["bundled:build", (dir) => buildBundled(dir)]];

// ── sanity: both entry points exist (dist built, bundle present) ──────────────
test("signing-boundary matrix: both CLI entry points are present", () => {
  assert.ok(existsSync(INTERNAL_CLI), `internal CLI missing — build dist first: ${INTERNAL_CLI}`);
  assert.ok(existsSync(BUNDLED_CLI), `bundled CLI missing: ${BUNDLED_CLI}`);
});

// ── VIOLATING fixtures: NO manifest under ANY (entry × mode) ──────────────────
for (const fx of VIOLATING) {
  for (const [entryLabel, run] of ALL_ENTRIES) {
    test(`VIOLATING ${fx.name} (${fx.expect}) mints NO manifest via ${entryLabel}`, () => {
      const dir = stage(`${fx.name}-${entryLabel.replace(/[^\w]+/g, "_")}`, fx.src);
      const r = run(dir);
      assert.ok(r.status !== null, `${entryLabel} did not run (timeout/spawn error): ${r.error ?? ""}`);
      assert.ok(
        !mintedManifest(dir),
        `${entryLabel} SIGNED a ${fx.expect}-violating fixture — signing-boundary fail-open.\n` +
          `stdout+stderr:\n${(r.stdout ?? "") + (r.stderr ?? "")}`,
      );
    });
  }
}

// ── CLEAN fixture: a manifest IS minted under EVERY (entry × mode) ────────────
for (const [entryLabel, run] of ALL_ENTRIES) {
  test(`CLEAN ${CLEAN.name} mints a manifest via ${entryLabel}`, () => {
    const dir = stage(`${CLEAN.name}-${entryLabel.replace(/[^\w]+/g, "_")}`, CLEAN.src);
    const r = run(dir);
    assert.ok(r.status !== null, `${entryLabel} did not run (timeout/spawn error): ${r.error ?? ""}`);
    assert.ok(
      mintedManifest(dir),
      `${entryLabel} refused to sign the CLEAN fixture (should mint a .lmanifest).\n` +
        `stdout+stderr:\n${(r.stdout ?? "") + (r.stderr ?? "")}`,
    );
  });
}

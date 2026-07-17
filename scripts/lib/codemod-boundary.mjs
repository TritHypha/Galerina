// =============================================================================
// codemod-boundary.mjs — RD-0452: a codemod is a defect multiplier with good hygiene
// =============================================================================
// THE THESIS. A codemod applies ONE question to N files. A wrong question becomes N defects —
// atomically, with a clean diff and an honest commit message. It is the most efficient way to be
// consistently wrong. Two live proofs, both found the hard way on 2026-07-17:
//
//   • repoint-kb-refs (#34) — "repoint 400 dangling KB refs → the sibling repo". Answered its question
//     correctly. The question was wrong. Result: 123 links in a PUBLIC repo pointing into a PRIVATE
//     sibling — dead for every reader who clones it, and 85 of them in the public "Start Here" index.
//     ★ Nothing was hidden: that tool's own header states the escape as the DESIGN INTENT — "the sibling
//     repo ZTF-Knowledge-Bases/ (checked out one level ABOVE the Galerina repo root)". Written down,
//     deliberate, reviewed. Still wrong.
//   • the brand rebrands — four passes rewrote `../../galerina-core-config/dist/posture.js` in
//     app-kernel/src/kernel.ts. Not one asked whether that cross-package edge should exist. It broke a
//     clean-checkout CI build eight months later.
//
// ★ AGE-LAUNDERING — the harm that let both survive. `git blame kernel.ts:36` says "8 days ago,
// rebrand". The defect is from `d3f83a58 Initial commit`. The most recent toucher DECIDED NOTHING, but
// blame says they did. So every instinct that asks "is this recent? has anyone looked at it?" gets a
// misleadingly reassuring YES. A codemod resets a defect's apparent age without resetting anyone's
// understanding of it. (R&D hit this too: `git log -S` on the CURRENT string returned only the rebrand;
// the truth needed a search on the OLD brand name.)
//
// THE QUESTION THIS ASKS — and it is deliberately NOT "is the new path valid?":
//
//     Does the new path assert a boundary claim the old one didn't — or one nobody has evaluated?
//
// Validity is what the codemod already checks. A boundary CLAIM is what nobody checks, because the
// codemod is answering a different question — and the codemod is the one moment someone is guaranteed
// to be looking at the line.
//
// WRITE-TIME, not audit-time. The audit half already ships and is green + ratcheted (`escapesRoot` in
// audit-claim-hygiene → 123 declared; the widened border → 39 declared). This is the cheaper half: it
// converts N findings into ONE decision. repoint-kb-refs would have refused all 400 at once —
// "400 refs move outside the repo root; target is PRIVATE, this repo is PUBLIC. Confirm or refuse."
//
// ★ NON-VACUITY IS THE WHOLE DESIGN RISK. A rename WITHIN a package (`logicn-foo` → `galerina-foo`, same
// directory) MUST be silent. Rebrands are legitimate and a helper that refuses every one of them is
// worse than no helper — it would be turned off inside a day, and then nothing asks the question at all.
// The self-test's most important case is the SILENT one.
//
// Usage:  import { classifyRewrite } from "./lib/codemod-boundary.mjs"
//         node scripts/lib/codemod-boundary.mjs --self-test
// =============================================================================
import { resolve, relative, isAbsolute, dirname, join } from "node:path";

/**
 * Does an already-resolved absolute path land OUTSIDE the repo root?
 *
 * PURE + FILESYSTEM-FREE, and that is the point: the disk answers for the AUTHOR, not for whoever
 * clones the repo. `../../ZTF-Knowledge-Bases/x.md` resolves on a machine that happens to have the
 * sibling checked out and nowhere else — so asking the filesystem is itself the bug. Same predicate as
 * audit-claim-hygiene's `escapesRoot`, asked at WRITE time instead of AUDIT time.
 *
 * Compares path SEGMENTS, not string prefixes: `/repo-evil` is not inside `/repo`.
 */
export function escapesRoot(abs, root) {
  const rel = relative(root, abs);
  return rel.startsWith("..") || isAbsolute(rel);
}

/** Which package directory (if any) does an absolute path live in, given the packages root? */
export function packageOf(abs, root, packagesDirName = "packages-galerina") {
  const rel = relative(join(root, packagesDirName), abs);
  if (rel.startsWith("..") || isAbsolute(rel)) return null;
  const seg = rel.split(/[\\/]/)[0];
  return seg && seg !== "" ? seg : null;
}

/**
 * Classify a single path rewrite as a boundary DELTA.
 *
 * Returns { verdict, claim, reason }:
 *   "silent"  — the rewrite asserts no new boundary claim (the rebrand-in-place case). Proceed.
 *   "refuse"  — the rewrite asserts a boundary claim nobody has evaluated. Stop and ask.
 *
 * DELTA, not absolute: a path that ALREADY crossed a boundary and still crosses the same one is not a
 * new claim — the codemod didn't create it and refusing there would punish the rename for a
 * pre-existing defect (and get the helper switched off). What matters is the claim the rewrite
 * INTRODUCES. Pre-existing crossings are the audit half's job (#103, #104), which already tracks them.
 */
export function classifyRewrite({ fromFile, oldTarget, newTarget, repoRoot, packagesDirName }) {
  const dir = dirname(resolve(repoRoot, fromFile));
  const oldAbs = resolve(dir, oldTarget);
  const newAbs = resolve(dir, newTarget);

  const oldEscapes = escapesRoot(oldAbs, repoRoot);
  const newEscapes = escapesRoot(newAbs, repoRoot);
  if (newEscapes && !oldEscapes) {
    return {
      verdict: "refuse",
      claim: "escapes-repo-root",
      reason:
        `the rewrite moves this reference OUTSIDE the repo root, which the old one did not. It will ` +
        `resolve only on a machine that happens to have that sibling checked out — and for nobody who ` +
        `clones this repo. If the target repo is private and this one is public, it resolves for no ` +
        `reader at all. Confirm the boundary or refuse.`,
    };
  }

  const oldPkg = packageOf(oldAbs, repoRoot, packagesDirName);
  const newPkg = packageOf(newAbs, repoRoot, packagesDirName);
  const fromPkg = packageOf(resolve(repoRoot, fromFile), repoRoot, packagesDirName);
  // A crossing is NEW if the rewrite lands in a different package than the importer, and the old one
  // didn't. The rename does not CREATE the crossing when the old target already crossed — it PRESERVES
  // it, which is the age-laundering case the audit half owns.
  const oldCrossed = fromPkg && oldPkg && oldPkg !== fromPkg;
  const newCrossed = fromPkg && newPkg && newPkg !== fromPkg;
  if (newCrossed && !oldCrossed) {
    return {
      verdict: "refuse",
      claim: "crosses-package",
      reason:
        `the rewrite makes this reference cross from package '${fromPkg}' into sibling '${newPkg}', ` +
        `which the old one did not. A cross-package relative import bypasses package.json entirely — no ` +
        `declaration, no version, invisible to the file: closure walk. Declare the dependency and import ` +
        `by package name, or refuse.`,
    };
  }

  return { verdict: "silent", claim: null, reason: "no new boundary claim — same repo, same package" };
}

// ── self-test ────────────────────────────────────────────────────────────────
// The SILENT cases matter most: a helper that refuses legitimate rebrands is worse than none.

function selfTest() {
  const R = "/repo";
  const P = "packages-galerina";
  const c = (fromFile, oldTarget, newTarget) =>
    classifyRewrite({ fromFile, oldTarget, newTarget, repoRoot: R, packagesDirName: P });

  const checks = [
    // ── SILENT: the legitimate rebrands. If these fire, the helper gets switched off and nothing asks. ──
    ["rebrand IN PLACE is silent (logicn-foo → galerina-foo, same dir)",
      c("packages-galerina/pkg-a/src/x.ts", "./logicn-foo.js", "./galerina-foo.js").verdict === "silent"],
    ["intra-package move is silent (./a.js → ../lib/a.js, same package)",
      c("packages-galerina/pkg-a/src/x.ts", "./a.js", "../lib/a.js").verdict === "silent"],
    ["a docs-internal repoint is silent (docs/x.md → docs/y/z.md)",
      c("docs/README.md", "./old.md", "./sub/new.md").verdict === "silent"],
    ["a rewrite that PRESERVES an existing crossing is silent — the rename didn't create it",
      c("packages-galerina/pkg-a/src/x.ts", "../../pkg-b/dist/old.js", "../../pkg-b/dist/new.js").verdict === "silent"],

    // ── REFUSE: the two real cases, reconstructed from the actual defects. ──
    ["#34's ACTUAL rewrite refuses — docs/Knowledge-Bases/ → ../../ZTF-Knowledge-Bases/ escapes the root",
      c("docs/README.md", "./Knowledge-Bases/architecture-charter.md", "../../ZTF-Knowledge-Bases/architecture-charter.md").claim === "escapes-repo-root"],
    ["a NEW cross-package reach refuses (./config.js → ../../pkg-b/dist/config.js)",
      c("packages-galerina/pkg-a/src/x.ts", "./config.js", "../../pkg-b/dist/config.js").claim === "crosses-package"],
    ["…and it names both packages in the reason (so the message is actionable, not just a verdict)",
      /from package 'pkg-a' into sibling 'pkg-b'/.test(c("packages-galerina/pkg-a/src/x.ts", "./config.js", "../../pkg-b/dist/config.js").reason)],

    // ── the predicates themselves ──
    ["escapesRoot is arithmetic, never the filesystem", escapesRoot("/repo/../x", "/repo") && !escapesRoot("/repo/a/b", "/repo")],
    ["escapesRoot compares SEGMENTS not prefixes (/repo-evil is not inside /repo)", escapesRoot("/repo-evil/x", "/repo")],
    ["packageOf finds the owning package", packageOf("/repo/packages-galerina/pkg-a/src/x.ts", R, P) === "pkg-a"],
    ["packageOf returns null outside packages/", packageOf("/repo/docs/x.md", R, P) === null],
  ];

  let ok = true;
  for (const [name, pass] of checks) { console.log(`  ${pass ? "✅" : "❌"} ${name}`); if (!pass) ok = false; }
  if (!ok) { console.error("\n  ❌ codemod-boundary self-test FAILED"); process.exit(1); }
  console.log("\n  codemod-boundary self-test: refuses NEW boundary claims, silent on legitimate rebrands ✅");
  process.exit(0);
}

if (process.argv.includes("--self-test")) selfTest();

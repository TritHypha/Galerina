// OPEN-S2-2 (2026-10-28): unit-qualified flow names. kernel.fungi and auth-verify-route.fungi both define
// applyClock (and mintOperation, httpStatusFor, applyConsume, recoverLease); four units define finish.
// Decision (zero-trust default, under the owner rulings of 2026-10-22 "no renames" and crr-01 item 3): a flow's
// identity is its unit-qualified key from build/flow-registry/flow-registry.json (kernel.applyClock is not
// auth-verify-route.applyClock). An unqualified name may be shared across units only when the shared clash
// table (clash-table.mjs) says why: REGISTERED means every copy is the same code, DIVERGENT pins exactly which
// units define it and the reviewed sha256 of each body. This suite binds the two sources of truth together,
// globally (every unit, not only one import closure), so neither can drift from the other.
// Rejected: renaming route copies to routeApplyClock etc. (owner ruling: no renames; would re-open the ACK'd
// 35/36/47 suites and their evidence pins); allowing an undeclared cross-unit duplicate because it sits in no
// shared import closure today (the next composition would inherit a silent clash); a hand list of the six
// names here (a third copy of the table would drift).
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { basename, dirname, join } from "node:path";
import { readFileSync } from "node:fs";
import { REGISTERED, DIVERGENT, sha, flowsOf } from "./clash-table.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..", "..", "..", "..");
const REGISTRY = join(REPO, "build", "flow-registry", "flow-registry.json");

// rows: [{ qualified, unit, flow, file, body }]; body is the normalised flowsOf text of that unit's copy.
// Returns a sorted list of human-readable problems; [] means the registry and the clash table agree.
export function qualifiedProblems(rows, srcRoot, tables = { REGISTERED, DIVERGENT }) {
  const out = [];
  const seen = new Map();
  const byFlow = new Map();
  for (const r of rows) {
    const rel = typeof r.file === "string" && r.file.startsWith(srcRoot + "/") ? r.file.slice(srcRoot.length + 1) : null;
    if (rel === null || rel.endsWith(".fungi") !== true) {
      out.push("row " + r.qualified + ": file " + r.file + " is not a .fungi unit under " + srcRoot);
    } else if (r.unit !== rel.replace(/\.fungi$/, "")) {
      out.push("row " + r.qualified + ": unit " + r.unit + " does not match its file " + rel);
    }
    if (r.qualified !== r.unit + "." + r.flow) {
      out.push("row " + r.qualified + ": key is not unit-qualified (" + r.unit + "." + r.flow + ")");
    }
    if (seen.has(r.qualified)) {
      out.push("qualified key " + r.qualified + " appears twice");
    }
    seen.set(r.qualified, r);
    byFlow.set(r.flow, [...(byFlow.get(r.flow) ?? []), r]);
  }
  for (const name of tables.REGISTERED.keys()) {
    if (tables.DIVERGENT.has(name)) {
      out.push("'" + name + "' is both REGISTERED (same code) and DIVERGENT (different code)");
    }
  }
  for (const [name, defs] of byFlow) {
    if (defs.length < 2) {
      continue;
    }
    const units = defs.map((d) => basename(d.file)).sort();
    if (tables.REGISTERED.has(name)) {
      for (const d of defs) {
        if (d.body !== defs[0].body) {
          out.push("REGISTERED '" + name + "': " + d.qualified + " differs from " + defs[0].qualified);
        }
      }
      continue;
    }
    const decl = tables.DIVERGENT.get(name);
    if (decl === undefined) {
      out.push("undeclared cross-unit flow '" + name + "' in " + units.join(", ") + " (add it to clash-table.mjs or rename by owner decision)");
      continue;
    }
    if (units.join(",") !== [...decl.units].sort().join(",")) {
      out.push("DIVERGENT '" + name + "' is defined in " + units.join(",") + " but declared for " + [...decl.units].sort().join(","));
    }
    for (const d of defs) {
      if (decl.sha[basename(d.file)] !== sha(d.body)) {
        out.push("DIVERGENT '" + name + "': " + d.qualified + " body is not the reviewed one (pinned sha256 mismatch)");
      }
    }
  }
  for (const name of tables.REGISTERED.keys()) {
    if ((byFlow.get(name) ?? []).length < 2) {
      out.push("stale REGISTERED '" + name + "': defined in fewer than two units");
    }
  }
  for (const [name, decl] of tables.DIVERGENT) {
    if ((byFlow.get(name) ?? []).length < 2) {
      out.push("stale DIVERGENT '" + name + "': defined in fewer than two units (declared " + decl.units.join(",") + ")");
    }
    if (decl.bound !== "none" && decl.units.includes(decl.bound) !== true) {
      out.push("DIVERGENT '" + name + "' binds " + decl.bound + ", which is not one of its units");
    }
  }
  return out.sort();
}

function liveRows() {
  const reg = JSON.parse(readFileSync(REGISTRY, "utf8"));
  assert.equal(reg.schema, "galerina.flow-registry.v1");
  assert.equal(reg.total, reg.flows.length, "registry total disagrees with its rows");
  const cache = new Map();
  const rows = reg.flows.map((r) => {
    if (cache.has(r.file) !== true) {
      cache.set(r.file, flowsOf(readFileSync(join(REPO, r.file), "utf8")));
    }
    const bodies = cache.get(r.file).get(r.flow) ?? [];
    assert.equal(bodies.length, 1, r.qualified + " must have exactly one body in its unit, found " + bodies.length);
    return { ...r, body: bodies[0] };
  });
  return { reg, rows };
}

test("S2-Q-01 the flow registry and the clash table agree for every unit", () => {
  const { reg, rows } = liveRows();
  assert.notEqual(rows.length, 0, "empty flow registry");
  assert.deepEqual(qualifiedProblems(rows, reg.generatedFrom), []);
});

test("S2-Q-02 every cross-unit name is declared, and the declared set is exactly the live set", () => {
  const { rows } = liveRows();
  const units = new Map();
  for (const r of rows) {
    units.set(r.flow, [...(units.get(r.flow) ?? []), r.unit]);
  }
  const shared = [...units].filter(([, u]) => u.length > 1).map(([n]) => n).sort();
  const declared = [...REGISTERED.keys(), ...DIVERGENT.keys()].sort();
  assert.deepEqual(shared, declared);
});

test("S2-Q-03 kernel.applyClock and auth-verify-route.applyClock are distinct identities with pinned bodies", () => {
  const { rows } = liveRows();
  const k = rows.find((r) => r.qualified === "kernel.applyClock");
  const a = rows.find((r) => r.qualified === "auth-verify-route.applyClock");
  assert.ok(k !== undefined && a !== undefined, "both qualified applyClock rows must exist");
  assert.notEqual(k.body, a.body, "the two applyClock copies are expected to differ (route adds the budget cap)");
  const decl = DIVERGENT.get("applyClock");
  assert.equal(sha(k.body), decl.sha["kernel.fungi"]);
  assert.equal(sha(a.body), decl.sha["auth-verify-route.fungi"]);
  assert.equal(decl.bound, "kernel.fungi");
});

const S = "packages/fungi/memory/src";
const row = (unit, flow, body, extra = {}) => ({ qualified: unit + "." + flow, unit, flow, file: S + "/" + unit + ".fungi", body, ...extra });
const tbl = (reg = [], div = []) => ({ REGISTERED: new Map(reg), DIVERGENT: new Map(div) });
const zeta = { units: ["a.fungi", "b.fungi"], bound: "a.fungi", sha: { "a.fungi": sha("x"), "b.fungi": sha("y") } };

test("S2-Q-04 checker accepts a well-formed synthetic registry", () => {
  const rows = [row("a", "zeta", "x"), row("b", "zeta", "y"), row("a", "fin", "f"), row("b", "fin", "f"), row("c", "solo", "s")];
  assert.deepEqual(qualifiedProblems(rows, S, tbl([["fin", "same packer"]], [["zeta", zeta]])), []);
});

test("S2-Q-05 checker refuses an undeclared cross-unit duplicate", () => {
  const p = qualifiedProblems([row("a", "omega", "x"), row("b", "omega", "x")], S, tbl());
  assert.match(p.join("\n"), /undeclared cross-unit flow 'omega'/);
});

test("S2-Q-06 checker refuses a third unit joining a DIVERGENT clash and a tampered body", () => {
  const third = qualifiedProblems([row("a", "zeta", "x"), row("b", "zeta", "y"), row("c", "zeta", "x")], S, tbl([], [["zeta", zeta]]));
  assert.match(third.join("\n"), /is defined in a\.fungi,b\.fungi,c\.fungi but declared for a\.fungi,b\.fungi/);
  const tampered = qualifiedProblems([row("a", "zeta", "x"), row("b", "zeta", "y2")], S, tbl([], [["zeta", zeta]]));
  assert.match(tampered.join("\n"), /b\.zeta body is not the reviewed one/);
});

test("S2-Q-07 checker refuses a REGISTERED name whose copies differ", () => {
  const p = qualifiedProblems([row("a", "fin", "f"), row("b", "fin", "g")], S, tbl([["fin", "same"]]));
  assert.match(p.join("\n"), /REGISTERED 'fin': b\.fin differs from a\.fin/);
});

test("S2-Q-08 checker refuses unqualified, mis-unit, duplicate and out-of-tree keys", () => {
  assert.match(qualifiedProblems([row("a", "f", "x", { qualified: "f" })], S, tbl()).join("\n"), /key is not unit-qualified/);
  assert.match(qualifiedProblems([row("a", "f", "x", { unit: "b", qualified: "b.f" })], S, tbl()).join("\n"), /unit b does not match its file a\.fungi/);
  assert.match(qualifiedProblems([row("a", "f", "x"), row("a", "f", "x")], S, tbl([["f", "same"]])).join("\n"), /qualified key a\.f appears twice/);
  assert.match(qualifiedProblems([row("a", "f", "x", { file: "elsewhere/a.fungi" })], S, tbl()).join("\n"), /is not a \.fungi unit under/);
});

test("S2-Q-09 checker refuses stale or contradictory table entries", () => {
  const rows = [row("a", "zeta", "x"), row("b", "zeta", "y")];
  assert.match(qualifiedProblems(rows, S, tbl([["gone", "old"]], [["zeta", zeta]])).join("\n"), /stale REGISTERED 'gone'/);
  assert.match(qualifiedProblems([row("a", "zeta", "x")], S, tbl([], [["zeta", zeta]])).join("\n"), /stale DIVERGENT 'zeta'/);
  assert.match(qualifiedProblems(rows, S, tbl([["zeta", "x"]], [["zeta", zeta]])).join("\n"), /both REGISTERED .* and DIVERGENT/);
  assert.match(qualifiedProblems(rows, S, tbl([], [["zeta", { ...zeta, bound: "c.fungi" }]])).join("\n"), /binds c\.fungi, which is not one of its units/);
});

test("S2-Q-10 the checker does not mutate its inputs and reads the shared frozen table", () => {
  const rows = Object.freeze([Object.freeze(row("a", "zeta", "x")), Object.freeze(row("b", "zeta", "y"))]);
  assert.deepEqual(qualifiedProblems(rows, S, tbl([], [["zeta", zeta]])), []);
  const self = readFileSync(fileURLToPath(import.meta.url), "utf8");
  assert.match(self, /^import \{[^}]*\bREGISTERED\b[^}]*\bDIVERGENT\b[^}]*\} from "\.\/clash-table\.mjs";$/m);
  assert.doesNotMatch(self, /^\s*(?:const|let|var)\s+(?:REGISTERED|DIVERGENT)\b/m);
  assert.throws(() => DIVERGENT.set("applyClock", {}), TypeError);
});

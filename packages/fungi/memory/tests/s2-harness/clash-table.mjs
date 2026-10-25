// Shared clash table for every harness that composes memory units (S2 X-DUP and 47b's flattened e2e).
// Side-effect free: no test() calls, so importing it never re-runs another suite. Frozen so a suite cannot
// rewrite the reviewed table at run time. OPEN-S2-1 (S21, 2026-10-25): moved here from s2-dup.test.mjs so the
// 47b flattener derives which copy of a divergent flow it keeps from DIVERGENT.bound instead of a hand list.
// Zero-trust choice: one source of truth; the flattener refuses any clash this table does not declare.
// Rejected: importing s2-dup.test.mjs from 47b (runs its tests twice, hidden coupling); two copies (drift).
import { createHash } from "node:crypto";

const freezeDecl = (d) => Object.freeze({ ...d, units: Object.freeze([...d.units]), sha: Object.freeze({ ...d.sha }) });

// Registered clashes: name -> why the duplicate is tolerated. Anything else fails.
export const REGISTERED = new Map([["finish", "identical refusal/wipe packer in body-reader, release-commit-point, serve-gate, cleanup-evidence"],
  ["applyConsume", "identical in kernel and auth-verify-route"],
  ["recoverLease", "identical in kernel and auth-verify-route"]]);
// S2 round 3 (2026-10-22): DECLARED DIVERGENT clashes. kernel.fungi and auth-verify-route.fungi each define
// mintOperation, applyClock and httpStatusFor with DIFFERENT bodies (different refusal codes and branches), so
// any program composing both (47b's auth-verify-e2e) must say which copy it binds. Zero-trust choice: a divergent
// clash is tolerated only when declared here with (a) exactly the units that define it, (b) the sha256 of each
// reviewed normalised body (any edit goes red until re-reviewed), and (c) the bound copy, or "none" meaning no
// composing root may call it. Rejected: registering by name only (lets a body divergence through), first- or
// last-occurrence binding (silent substitution), renaming now (flow renames wait on Phillip's naming decisions).
// Intent text and comments are ignored by the comparison and recorded in the round notes instead.
export const DIVERGENT = new Map([
  ["mintOperation", freezeDecl({ units: ["auth-verify-route.fungi", "kernel.fungi"], bound: "none", sha: { "auth-verify-route.fungi": "514c4beb500566a85faaf48c257f83c1564766bf8f8770f5e763c4fb809a42d2", "kernel.fungi": "81c4c5f892613fe715ceb44d858d47e3ae1ebc1767a04818f121d17f6b188e48" }, why: "kernel and route mint with different refusal codes; 47b strips both and its root never calls it" })],
  ["applyClock", freezeDecl({ units: ["auth-verify-route.fungi", "kernel.fungi"], bound: "kernel.fungi", sha: { "auth-verify-route.fungi": "0c238a28b58969388547dda6fdd8e7237c77e17d17e6345bac5f5588a6ffac31", "kernel.fungi": "90f558d0c6dfd19ab4329ef5b70f58c925aca54722538186b3c45d329ed13565" }, why: "route adds a budget > 5000 refusal and other codes; 47b keeps the kernel copy" })],
  ["httpStatusFor", freezeDecl({ units: ["auth-verify-route.fungi", "kernel.fungi"], bound: "auth-verify-route.fungi", sha: { "auth-verify-route.fungi": "7b62b5b046a4917ac0a9ab2ad3ca0e7ca0f0327e7bea3d7ce5b287b092b4970e", "kernel.fungi": "bc5681e36cdcaf745a94d7c169cf09baab35a7d2b5f1d70afb34f121c36ad589" }, why: "route maps 112-120 to 400 and 140 to 499; 47b keeps the route copy, which its root calls" })],
]);
for (const m of [REGISTERED, DIVERGENT]) {
  m.set = () => { throw new TypeError("clash table is frozen"); };
  m.delete = () => { throw new TypeError("clash table is frozen"); };
  m.clear = () => { throw new TypeError("clash table is frozen"); };
  Object.freeze(m);
}

export const sha = (t) => createHash("sha256").update(t).digest("hex");

export const DECL = /^[ \t]*(?:[a-z]+[ \t]+)*flow[ \t]+([A-Za-z_]\w*)[ \t]*\(/;
const TOP = /^(?:\S.*\bflow\s+[A-Za-z_]\w*\s*\(|\/\/\/|@|import\b|type\b|enum\b|record\b|const\b)/;

// name -> normalised bodies (signature + body; intent lines, comments and blank lines dropped; lines trimmed).
export function flowsOf(src) {
  const lines = src.split("\n");
  const out = new Map();
  for (let i = 0; i < lines.length; i++) {
    const m = DECL.exec(lines[i]);
    if (m === null) {
      continue;
    }
    let j = i + 1;
    while (j < lines.length && TOP.test(lines[j]) !== true) {
      j++;
    }
    const norm = lines.slice(i, j)
      .filter((l) => /^\s*intent\s*\{/.test(l) !== true && /^\s*\/\//.test(l) !== true)
      .map((l) => l.trim()).filter((l) => l !== "").join("\n");
    const prior = out.get(m[1]);
    out.set(m[1], prior === undefined ? [norm] : [...prior, norm]);
  }
  return out;
}

// Typed refusal for a composing harness. kind is one of UNDECLARED_CLASH | SURVIVOR_COUNT | PIN_MISMATCH |
// UNBOUND_CALL | UNSTRIPPABLE | BAD_BINDING. A flattener throws instead of picking a copy.
export class FlattenRefusal extends Error {
  constructor(kind, detail) {
    super("flatten refused (" + kind + "): " + detail);
    this.name = "FlattenRefusal";
    this.kind = kind;
  }
}

// For each divergent name whose units are ALL in the composed set, the copies to strip: every unit except the
// bound one ("none" strips every copy). A declaration binding a unit outside its own list is refused.
export function divergentStrips(composedUnits, table = DIVERGENT) {
  const out = [];
  for (const [name, decl] of table) {
    if (decl.bound !== "none" && decl.units.includes(decl.bound) !== true) {
      throw new FlattenRefusal("BAD_BINDING", name + " binds " + decl.bound + ", not one of its units");
    }
    if (decl.units.every((u) => composedUnits.includes(u)) !== true) {
      continue;
    }
    for (const u of decl.units) {
      if (u !== decl.bound) {
        out.push({ unit: u, name });
      }
    }
  }
  return out;
}

// After flattening: no name may be defined twice; a declared divergent name keeps exactly its bound copy (pinned
// sha) or, when bound "none", no copy and no call from the composing root.
export function assertFlatBinding(flatText, rootSrc, composedUnits, table = DIVERGENT) {
  const flows = flowsOf(flatText);
  for (const [name, bodies] of flows) {
    if (bodies.length > 1) {
      throw new FlattenRefusal("UNDECLARED_CLASH", "'" + name + "' defined " + bodies.length + " times in the flattened program");
    }
  }
  for (const [name, decl] of table) {
    if (decl.units.every((u) => composedUnits.includes(u)) !== true) {
      continue;
    }
    const bodies = flows.get(name) ?? [];
    if (decl.bound === "none") {
      if (bodies.length !== 0) {
        throw new FlattenRefusal("SURVIVOR_COUNT", "'" + name + "' is bound to no unit but a copy survived");
      }
      const calls = rootSrc.split("\n").filter((l) => DECL.test(l) !== true && /^\s*\/\//.test(l) !== true);
      if (calls.some((l) => new RegExp("\\b" + name + "\\s*\\(").test(l))) {
        throw new FlattenRefusal("UNBOUND_CALL", "root calls '" + name + "', a divergent clash bound to no unit");
      }
      continue;
    }
    if (bodies.length !== 1) {
      throw new FlattenRefusal("SURVIVOR_COUNT", "'" + name + "' must keep exactly its bound copy, found " + bodies.length);
    }
    if (sha(bodies[0]) !== decl.sha[decl.bound]) {
      throw new FlattenRefusal("PIN_MISMATCH", "surviving '" + name + "' is not the reviewed " + decl.bound + " body");
    }
  }
  return true;
}
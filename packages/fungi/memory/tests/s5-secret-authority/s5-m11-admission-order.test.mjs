// OPEN-S5-2 (2026-10-28, work driver gcw-wd-bfafa576): M11 killing test.
// M11 = "kernel secretsAdmittedThisRequest forced true". Round m (f07eb6d4) recorded it as an EQUIVALENT
// mutant: the only reader is the getSecret closure, which is created only after the post-wait admit at
// gate 9.5 returned null, so on every reachable call the flag is already true. That was an argument, not
// a test (merge check s5mc-090d00b6 note: "M11 equivalence is an argument, not a killing test").
// Decision (zero-trust default): pin the ORDER that makes M11 equivalent, so the equivalence cannot rot.
// The suite reads the frozen TS reference (read-only, TS stays frozen) and proves, on the source text:
//   P1 the flag is declared exactly once and starts false;
//   P2 it is assigned exactly once, to `postWaitSecretRefusal === null`, never to a literal;
//   P3 that assignment sits after the post-wait admit AND after its refusal block, and the refusal block
//      returns a 503 before the assignment (so the assignment only runs on the admitted path);
//   P4 it has exactly one reader, inside the handler's getSecret closure, after the assignment;
//   P5 secret-gate.ts counts only the literal true as presence (`presenceObserved === true`).
// Every M11 shape (init true, assign true, assign before the refusal, refusal return dropped, an extra
// early reader, gate accepting truthy) turns this suite RED, which is the killing test M11 lacked.
// Rejected: deleting the flag (round m kept it as a second fence if the order ever changes); a behavioural
// kill (impossible by definition for an equivalent mutant: no reachable input tells the two apart);
// pinning a sha256 of kernel.ts (any unrelated edit would break it and hide the real invariant).
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync } from "node:fs";

const HERE = dirname(fileURLToPath(import.meta.url));
const MEM = join(HERE, "..", "..");
const REPO = join(MEM, "..", "..", "..");
const AK = join(REPO, "packages-ts", "galerina-framework-app-kernel");
const KERNEL_TS = join(AK, "src", "kernel.ts");
const GATE_TS = join(AK, "src", "secret-gate.ts");

const FLAG = "secretsAdmittedThisRequest";
const ADMIT = "const postWaitSecretRefusal = fungiGate.admit(";
const REFUSAL_IF = "if (postWaitSecretRefusal !== null) {";
const CLOSURE = "getSecret: (name, callback) => {";

function indexesOf(src, needle) {
  const out = [];
  let i = src.indexOf(needle);
  while (i !== -1) {
    out.push(i);
    i = src.indexOf(needle, i + needle.length);
  }
  return out;
}

// Returns the matching close brace index for the "{" at open, or -1. Strings and comments in the
// scanned window are plain TS without braces in literals; a mismatch fails closed (-1 -> problem).
function blockEnd(src, open) {
  if (src[open] !== "{") return -1;
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === "{") depth += 1;
    else if (src[i] === "}") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

// Sorted list of problems; [] means M11 is still an equivalent mutant on this source.
export function m11Problems(kernelSrc, gateSrc) {
  const out = [];
  const words = [...kernelSrc.matchAll(new RegExp("\\b" + FLAG + "\\b", "g"))].map((m) => m.index);
  const decls = indexesOf(kernelSrc, "let " + FLAG + " = false;");
  const anyDecl = [...kernelSrc.matchAll(new RegExp("\\b(?:let|var|const)\\s+" + FLAG + "\\b", "g"))];
  if (anyDecl.length !== 1) out.push("P1 expected exactly one declaration, found " + anyDecl.length);
  if (decls.length !== 1) out.push("P1 declaration does not start false");
  const assigns = [...kernelSrc.matchAll(new RegExp("(?<!let |var |const )\\b" + FLAG + "\\s*=(?!=)\\s*([^;]*);", "g"))];
  if (assigns.length !== 1) out.push("P2 expected exactly one assignment, found " + assigns.length);
  for (const a of assigns) {
    if (a[1].trim() !== "postWaitSecretRefusal === null") out.push("P2 assignment is not `postWaitSecretRefusal === null`: " + a[1].trim());
  }
  const admits = indexesOf(kernelSrc, ADMIT);
  if (admits.length !== 1) out.push("P3 expected exactly one post-wait admit, found " + admits.length);
  const ifs = indexesOf(kernelSrc, REFUSAL_IF);
  if (ifs.length !== 1) out.push("P3 expected exactly one post-wait refusal block, found " + ifs.length);
  const assignAt = assigns.length === 1 ? assigns[0].index : -1;
  if (admits.length === 1 && ifs.length === 1 && assignAt !== -1) {
    const open = ifs[0] + REFUSAL_IF.length - 1;
    const end = blockEnd(kernelSrc, open);
    if (!(admits[0] < ifs[0])) out.push("P3 refusal block precedes the admit");
    if (end === -1) out.push("P3 refusal block is not closed");
    else {
      const body = kernelSrc.slice(open, end);
      if (!/\breturn\s+pipelineOutcome\(\s*errorResponse\(\s*503\b/.test(body)) out.push("P3 refusal block does not return a 503");
      if (!(end < assignAt)) out.push("P3 assignment is not after the refusal block");
    }
  }
  const declAt = anyDecl.length === 1 ? anyDecl[0].index : -1;
  const reads = words.filter((i) => i !== declAt + anyDecl[0]?.[0].indexOf(FLAG) && i !== assignAt);
  if (reads.length !== 1) out.push("P4 expected exactly one reader, found " + reads.length);
  const closures = indexesOf(kernelSrc, CLOSURE);
  if (closures.length !== 1) out.push("P4 expected exactly one getSecret closure, found " + closures.length);
  if (reads.length === 1 && closures.length === 1) {
    const open = closures[0] + CLOSURE.length - 1;
    const end = blockEnd(kernelSrc, open);
    if (!(open < reads[0] && reads[0] < end)) out.push("P4 reader is outside the getSecret closure");
    if (assignAt !== -1 && !(assignAt < closures[0])) out.push("P4 getSecret closure is created before the assignment");
  }
  if (gateSrc.includes("const currentlyValid = presenceObserved === true;") !== true) {
    out.push("P5 secret gate no longer requires the literal true presence fact");
  }
  return out.sort();
}

// git.exe checkouts on Windows may carry CRLF; the invariant is about code order, not line endings.
const KERNEL = readFileSync(KERNEL_TS, "utf8").replace(/\r\n/g, "\n");
const GATE = readFileSync(GATE_TS, "utf8").replace(/\r\n/g, "\n");

function mutate(src, from, to) {
  assert.ok(src.includes(from), "mutant anchor missing: " + from);
  return src.replace(from, to);
}

test("S5-M11-01 frozen kernel.ts keeps M11 equivalent (P1-P5 hold)", () => {
  assert.deepEqual(m11Problems(KERNEL, GATE), []);
});

test("S5-M11-02 M11 as round m wrote it (assignment forced true) is RED", () => {
  const m = mutate(KERNEL, FLAG + " = postWaitSecretRefusal === null;", FLAG + " = true;");
  assert.ok(m11Problems(m, GATE).some((p) => p.startsWith("P2")));
});

test("S5-M11-03 M11 declared true at entry is RED", () => {
  const m = mutate(KERNEL, "let " + FLAG + " = false;", "let " + FLAG + " = true;");
  assert.ok(m11Problems(m, GATE).some((p) => p.startsWith("P1")));
});

test("S5-M11-04 assignment hoisted above the refusal block is RED", () => {
  const assign = "      " + FLAG + " = postWaitSecretRefusal === null;\n";
  const m0 = mutate(KERNEL, assign, "");
  const m = mutate(m0, "      " + REFUSAL_IF, "      " + FLAG + " = postWaitSecretRefusal === null;\n      " + REFUSAL_IF);
  assert.ok(m11Problems(m, GATE).some((p) => p === "P3 assignment is not after the refusal block"));
});

test("S5-M11-05 refusal block that no longer returns is RED", () => {
  const m = mutate(KERNEL, "return pipelineOutcome(errorResponse(503, postWaitSecretRefusal,", "void pipelineOutcome(errorResponse(503, postWaitSecretRefusal,");
  assert.ok(m11Problems(m, GATE).some((p) => p === "P3 refusal block does not return a 503"));
});

test("S5-M11-06 a second, early reader of the flag is RED", () => {
  const m = mutate(KERNEL, "      " + ADMIT, "      void " + FLAG + ";\n      " + ADMIT);
  assert.ok(m11Problems(m, GATE).some((p) => p.startsWith("P4 expected exactly one reader")));
});

test("S5-M11-07 secret gate accepting a truthy presence fact is RED", () => {
  const m = mutate(GATE, "const currentlyValid = presenceObserved === true;", "const currentlyValid = Boolean(presenceObserved);");
  assert.ok(m11Problems(KERNEL, m).some((p) => p.startsWith("P5")));
});

test("S5-M11-08 a second assignment (latched true elsewhere) is RED", () => {
  const m = mutate(KERNEL, "      requestActive = true;\n", "      requestActive = true;\n      " + FLAG + " = true;\n");
  assert.ok(m11Problems(m, GATE).some((p) => p.startsWith("P2")));
});

test("S5-M11-09 the checker fails closed on a source with no flag at all", () => {
  const stripped = KERNEL.split(FLAG).join("removedFlag");
  const p = m11Problems(stripped, GATE);
  assert.ok(p.length > 0);
  assert.ok(p.some((x) => x.startsWith("P1")));
});
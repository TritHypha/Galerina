// MEM-R9 mutant runner: each mutant breaks one rule in
// src/linear_memory_bounds.rs and `cargo test --test linear_memory_trap_parity`
// must go red. The file is restored byte for byte (sha256 checked) after
// every mutant, even on failure.
//
//   node vectors/linear-memory-trap-mutants.mjs   (run from vok-authority)

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const FILE = "src/linear_memory_bounds.rs";
const MUTANTS = [
  ["access end > mem becomes >=", "    if end > memory_bytes {", "    if end >= memory_bytes {"],
  ["effective address wraps at 2^32", "    let end = address + static_offset + width;", "    let end = ((address + static_offset) & 0xFFFF_FFFF) + width;"],
  ["div_s MIN/-1 overflow check dropped", "            if a == min && b == -1 {\n                return Outcome::trap(LMB_FAILURE_OVERFLOW);\n            }\n", ""],
  ["rem_s MIN/-1 traps", "            if a == min && b == -1 {\n                0\n", "            if a == min && b == -1 {\n                return Outcome::trap(LMB_FAILURE_OVERFLOW);\n"],
  ["grow pages > limit becomes >=", "    if pages > limit {", "    if pages >= limit {"],
  ["copy checks destination only", "    if into.verdict != 1 || from.verdict != 1 {", "    if into.verdict != 1 {"],
  ["range end > mem becomes >=", "    if start + length > memory_bytes {", "    if start + length >= memory_bytes {"],
  ["zero divisor no longer traps", "    if b == 0 {\n        return Outcome::trap(LMB_FAILURE_DIVIDE_BY_ZERO);\n    }\n", "    if b == 0 {\n        return Outcome::admitted(Status::Value);\n    }\n"],
  ["width 3 admitted", "pub const LMB_ADMITTED_WIDTHS: [u128; 5] = [1, 2, 4, 8, 16];", "pub const LMB_ADMITTED_WIDTHS: [u128; 6] = [1, 2, 3, 4, 8, 16];"],
];

const original = readFileSync(FILE, "utf8");
const originalSha = createHash("sha256").update(original).digest("hex");
let killed = 0;
try {
  for (const [label, from, to] of MUTANTS) {
    const normalized = original.replace(/\r\n/g, "\n");
    if (!normalized.includes(from)) throw new Error(`mutant anchor missing: ${label}`);
    writeFileSync(FILE, normalized.replace(from, to));
    const run = spawnSync("cargo", ["test", "--quiet", "--test", "linear_memory_trap_parity"], { encoding: "utf8" });
    const red = run.status !== 0;
    console.log(`${red ? "KILLED " : "SURVIVED"} ${label}`);
    if (red) killed += 1;
    writeFileSync(FILE, original);
  }
} finally {
  writeFileSync(FILE, original);
}
const restoredSha = createHash("sha256").update(readFileSync(FILE)).digest("hex");
if (restoredSha !== originalSha) throw new Error("source not restored");
console.log(`LMB_MUTANTS killed=${killed}/${MUTANTS.length}`);
process.exitCode = killed === MUTANTS.length ? 0 : 1;

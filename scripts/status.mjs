#!/usr/bin/env node
// status.mjs — Galerina STATUS one-shot. Print the live project state (version / stage / test line / overall % /
// open critical gates / R&D bridge queue / pointers) WITHOUT re-running the test suite or re-deriving counts.
// A re-runnable TOKEN-SAVER (owner request, 2026-06-22): a session runs THIS instead of `npm test` or grepping.
// Pure-read, zero deps (node:fs/node:path only). The bounded repository ledger is authoritative; malformed,
// missing, or traversal-bearing authority is refused with a non-zero exit instead of falling back to history.
//
//   node scripts/status.mjs
import { closeSync, existsSync, fstatSync, openSync, readFileSync, readdirSync, readSync } from "node:fs";
import { join, dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), ".."); // repo root (scripts/..)
// R&D bridge lives in a SIBLING repo (…/Galerina-R-AND-D). Resolve relative to the repo root so this
// works on any checkout — never a hardcoded absolute path (see scripts/audit-path-leak.mjs). Missing dir
// is handled gracefully (listDir → null), so an absent sibling just prints n/a.
const RND_TASKS = join(ROOT, "..", "Galerina-R-AND-D", "_session-bridge", "tasks");
const RND_DONE = join(ROOT, "..", "Galerina-R-AND-D", "_session-bridge", "done");
const STATUS_LEDGER = process.env.GALERINA_STATUS_LEDGER || join(ROOT, "governance", "status-ledger.json");
const STATUS_LEDGER_MAX_BYTES = 16_384;
// Detailed gate summaries remain bounded independently of the whole-file cap.
const STATUS_GATE_SUMMARY_MAX_CHARS = 2_048;

const NA = "n/a";
const readText = (p) => { try { return readFileSync(p, "utf8"); } catch { return null; } };
const readJSON = (p) => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } };
const listDir = (p) => { try { return readdirSync(p); } catch { return null; } };

const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const hasExactKeys = (value, expected) => {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
};
const isBoundedLine = (value, max) => (
  typeof value === "string"
  && value.length > 0
  && value.length <= max
  && !/[\u0000-\u001f\u007f]/u.test(value)
);
const admittedDocPath = (value) => {
  if (!isBoundedLine(value, 240) || value.includes("\\") || isAbsolute(value)) return false;
  if (!value.startsWith("docs/") || !value.endsWith(".md")) return false;
  if (value.split("/").some((part) => part === "." || part === ".." || part === "")) return false;
  const absolute = resolve(ROOT, value);
  const fromRoot = relative(ROOT, absolute);
  return fromRoot !== "" && !fromRoot.startsWith("..") && !isAbsolute(fromRoot) && existsSync(absolute);
};
const escapedJsonKeyPattern = (key) => [...key]
  .map((character) => {
    const literal = character.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    const hex = character.codePointAt(0).toString(16).padStart(4, "0");
    return `(?:${literal}|\\\\u${hex})`;
  })
  .join("");
const countRawKey = (raw, key) => (
  raw.match(new RegExp(`"${escapedJsonKeyPattern(key)}"\\s*:`, "giu")) || []
).length;
const hasUniqueLedgerKeys = (raw, value) => {
  for (const key of ["schema", "asOf", "milestone", "roadmap", "openGates"]) {
    if (countRawKey(raw, key) !== 1) return false;
  }
  const expectedGateKeys = Array.isArray(value?.openGates) ? value.openGates.length : 0;
  for (const key of ["id", "summary", "evidence"]) {
    if (countRawKey(raw, key) !== expectedGateKeys) return false;
  }
  return true;
};
const readStatusLedger = (path) => {
  let descriptor;
  try { descriptor = openSync(path, "r"); } catch { return { error: "cannot be read" }; }
  let bytes;
  try {
    const before = fstatSync(descriptor);
    if (!before.isFile()) return { error: "is not a regular file" };
    if (before.size > STATUS_LEDGER_MAX_BYTES) {
      return { error: `exceeds the ${STATUS_LEDGER_MAX_BYTES.toLocaleString("en-US")} bytes pre-read ceiling` };
    }
    const boundedRead = () => {
      const buffer = Buffer.allocUnsafe(STATUS_LEDGER_MAX_BYTES + 1);
      let total = 0;
      while (total < buffer.length) {
        const count = readSync(descriptor, buffer, total, buffer.length - total, total);
        if (count === 0) break;
        total += count;
      }
      return buffer.subarray(0, total);
    };
    const first = boundedRead();
    const between = fstatSync(descriptor);
    const second = boundedRead();
    const after = fstatSync(descriptor);
    if (first.length > STATUS_LEDGER_MAX_BYTES || second.length > STATUS_LEDGER_MAX_BYTES) {
      return { error: `exceeds the ${STATUS_LEDGER_MAX_BYTES.toLocaleString("en-US")} bytes pre-read ceiling` };
    }
    if (before.size !== between.size || between.size !== after.size || first.length !== before.size || !first.equals(second)) {
      return { error: "changed while it was being read" };
    }
    bytes = first;
  } catch {
    return { error: "cannot be read consistently" };
  } finally {
    closeSync(descriptor);
  }
  let raw;
  try { raw = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { return { error: "is not canonical UTF-8" }; }
  let value;
  try { value = JSON.parse(raw); } catch { return { error: "is not valid JSON" }; }
  if (!hasUniqueLedgerKeys(raw, value)) return { error: "field names are missing or duplicate" };
  return { value };
};
const validateStatusLedger = (value) => {
  if (!isRecord(value) || !hasExactKeys(value, ["schema", "asOf", "milestone", "roadmap", "openGates"])) {
    return "root must contain exactly schema, asOf, milestone, roadmap, and openGates";
  }
  if (value.schema !== "galerina.status-ledger.v1") return "schema is not galerina.status-ledger.v1";
  if (typeof value.asOf !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value.asOf)) return "asOf is not an ISO date";
  if (!isBoundedLine(value.milestone, 240)) return "milestone is empty, oversized, or multiline";
  if (!admittedDocPath(value.roadmap)) return "roadmap is not an existing repository docs/*.md path";
  if (!Array.isArray(value.openGates) || value.openGates.length > 8) return "openGates must be an array with at most 8 entries";
  const ids = new Set();
  for (const gate of value.openGates) {
    if (!isRecord(gate) || !hasExactKeys(gate, ["id", "summary", "evidence"])) return "each gate must contain exactly id, summary, and evidence";
    if (typeof gate.id !== "string" || !/^[A-Z][A-Z0-9-]{2,47}$/u.test(gate.id)) return "gate id is not canonical uppercase kebab-case";
    if (ids.has(gate.id)) return "gate ids must be unique";
    ids.add(gate.id);
    if (!isBoundedLine(gate.summary, STATUS_GATE_SUMMARY_MAX_CHARS)) return `gate ${gate.id} summary is empty, oversized, or multiline`;
    if (!admittedDocPath(gate.evidence)) return `gate ${gate.id} evidence is not an existing repository docs/*.md path`;
  }
  return null;
};

const statusLedgerRead = readStatusLedger(STATUS_LEDGER);
const statusLedger = statusLedgerRead.value;
const statusLedgerError = statusLedgerRead.error || validateStatusLedger(statusLedger);
if (statusLedgerError) {
  console.error(`REFUSED: status ledger ${statusLedgerError}.`);
  process.exit(1);
}

// ── version.json ──────────────────────────────────────────────────────────────
const v = readJSON(join(ROOT, "version.json")) || {};
const version = v.version || NA;
const stage = v.stage || NA;
const date = statusLedger.asOf;
const milestone = statusLedger.milestone;

// live test line: prefer packageCount/testCount; format with thousands separators + '0 fail'
const fmt = (n) => (typeof n === "number" ? n.toLocaleString("en-US") : null);
let testLine = NA;
if (v.packageCount != null && v.testCount != null) {
  testLine = `${v.packageCount}/${v.packageCount} packages, ${fmt(v.testCount)} tests, 0 fail`;
} else if (v.testCountNote) {
  testLine = v.testCountNote;
}

// ── overall % : newest *percent-audit* doc in the KB ──────────────────────────
// The KB corpus migrated to the sibling ZTF-Knowledge-Bases repo — resolve like kb-index.mjs /
// audit-doc-drift.mjs (GALERINA_KB_DIR override first), NOT the retired local docs/Knowledge-Bases.
const KB = process.env.GALERINA_KB_DIR || join(ROOT, "..", "ZTF-Knowledge-Bases");
let overall = NA;
let roadmapDoc = null;
const kbFiles = listDir(KB) || [];
// Match ANY percent-audit doc across the historical naming variants (roadmap-and-percent-audit-*,
// percent-audit-roadmap-*, percent-audit-and-*) and pick the newest by the ISO date embedded in the name.
const dateOf = (f) => (f.match(/(\d{4}-\d{2}-\d{2})/) || [])[1] || "";
const audits = kbFiles
  // GALERINA-framework audits only — exclude sibling products (tritmeshql-percent-audit-*, etc.).
  .filter((f) => /^galerina-.*percent-audit.*\.md$/i.test(f))
  .sort((a, b) => (dateOf(a) < dateOf(b) ? -1 : dateOf(a) > dateOf(b) ? 1 : a.localeCompare(b)));
if (audits.length) {
  const newest = audits[audits.length - 1];
  roadmapDoc = newest; // KB-relative (sibling ZTF-Knowledge-Bases)
  const txt = readText(join(KB, newest)) || "";
  const line = txt.split(/\r?\n/).find((l) => /shippable|overall/i.test(l));
  if (line) {
    overall = line.replace(/^#+\s*/, "").replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
    overall = overall.split(/\s+[—–-]\s+/)[0].trim(); // keep the leading headline clause only
  }
}

// ── R&D bridge queue : queued tasks vs matching done records ──────────────────
let rndLine = NA;
const tasks = listDir(RND_TASKS);
if (tasks) {
  const queued = tasks.filter((f) => f.endsWith(".md") && f !== "_TEMPLATE.md");
  const doneFiles = listDir(RND_DONE) || [];
  const doneNums = new Set(
    doneFiles
      .map((f) => (f.match(/^(\d{3,4})/) || [])[1])
      .filter(Boolean),
  );
  let doneCount = 0;
  for (const t of queued) {
    const num = (t.match(/^(\d{3,4})/) || [])[1];
    if (num && doneNums.has(num)) doneCount++;
  }
  rndLine = `${queued.length} queued, ${doneCount} done`;
}

// ── pointers (print only if present in the sibling KB) ────────────────────────
const pointerCandidates = [roadmapDoc, "galerina-rd-results-log.md", "galerina-roadmap.md"].filter(Boolean);
const pointers = [statusLedger.roadmap].concat(pointerCandidates
  .filter((p) => existsSync(join(KB, p)))
  .map((p) => `ZTF-Knowledge-Bases/${p}`));

// ── print compact status block ────────────────────────────────────────────────
const out = [];
out.push(`Galerina status — v${version} · ${stage}${date !== NA ? ` · ${date}` : ""}`);
out.push("");
out.push(`  tests     : ${testLine}`);
out.push(`  overall   : ${overall}`);
out.push(`  milestone : ${milestone}`);
out.push("");
out.push(`  open critical tasks:`);
const openGates = statusLedger.openGates;
if (openGates.length) {
  for (const gate of openGates) out.push(`    • [${gate.id}] ${gate.summary} (${gate.evidence})`);
} else {
  out.push(`    ${NA}`);
}
out.push("");
out.push(`  R&D queue : ${rndLine}`);
out.push("");
out.push(`  pointers:`);
if (pointers.length) {
  for (const p of pointers) out.push(`    - ${p}`);
} else {
  out.push(`    ${NA}`);
}

console.log(out.join("\n"));
process.exit(0);

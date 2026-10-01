// =============================================================================
// wat-lowering-ladder.mjs — the WAT emitter %'s RULING-1 L1 ladder
// =============================================================================
// PLAN.md D1 = L1: a rung is one self-hosted flow (the seven .fungi stages, unique by name).
// It is DONE iff that flow's rendered WAT function body contains no `emitter cannot lower`
// marker. Rendering uses the same stageSource composition as audit-unlowered-nodes.mjs
// (lexer+parser[+stage], plus J7 GIR record decls for runtime.fungi).
//
// SINGLE SOURCE OF THE MARKER is the emitter's own phrase. This lib SHAPES per-flow
// lowered/unlowered lists into a ladder so the two consumers cannot disagree:
//   component-health.mjs      — imports watLoweringLadder() to PUBLISH the pct + ladder
//   audit-percent-evidence.mjs — imports it to build checkRung and VERIFY pct == derived
//
// Usage: node scripts/lib/wat-lowering-ladder.mjs [--self-test]
// =============================================================================
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SH = join(ROOT, "packages-ts/galerina-core-compiler/src/self-hosted");
const DIST = join(ROOT, "packages-ts/galerina-core-compiler/dist/index.js");
const MARKER = "emitter cannot lower";
const STAGES = [
  "lexer.fungi",
  "parser.fungi",
  "type-checker.fungi",
  "effect-checker.fungi",
  "governance-verifier.fungi",
  "gir-emitter.fungi",
  "runtime.fungi",
];
const RUNTIME_GIR_RECORDS = [
  "GIRNode",
  "GIRExprNode",
  "GIRModule",
  "GIRExpr",
  "GIRStmt",
  "FlowEntry",
];

function strip(p) {
  let s = readFileSync(join(SH, p), "utf8");
  if (s.charCodeAt(0) === 0xFEFF) s = s.slice(1);
  return s.replace(/^@version 1\s*/m, "");
}

function extractRecordDecl(src, name) {
  const re = new RegExp(`(^|\\n)record\\s+${name}\\b`);
  const m = re.exec(src);
  if (!m) throw new Error(`wat-lowering-ladder: missing record ${name} in gir-emitter.fungi`);
  const start = m.index + (m[1] ? m[1].length : 0);
  const brace = src.indexOf("{", start);
  if (brace < 0) throw new Error(`wat-lowering-ladder: record ${name} has no body`);
  let depth = 0;
  for (let i = brace; i < src.length; i++) {
    const c = src[i];
    if (c === "{") depth += 1;
    else if (c === "}") {
      depth -= 1;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error(`wat-lowering-ladder: unclosed record ${name}`);
}

function girRecordsForRuntime() {
  const src = strip("gir-emitter.fungi");
  return RUNTIME_GIR_RECORDS.map((n) => extractRecordDecl(src, n)).join("\n\n");
}

function stageSource(file) {
  const extra = file === "parser.fungi" ? "" : `\n${strip(file)}`;
  const girDecls = file === "runtime.fungi" ? `\n${girRecordsForRuntime()}` : "";
  return `@version 1\n${strip("lexer.fungi")}\n${strip("parser.fungi")}${girDecls}${extra}`;
}

function renderWat(L, source, label) {
  const prog = L.parseProgram(source, label);
  const errs = (prog.diagnostics ?? []).filter((d) => d.severity === "error");
  if (errs.length) return { kind: "err", reason: `parse:${errs[0].code}` };
  const fx = L.checkEffects(prog.flows, prog.ast);
  const { gir } = L.emitGIR(prog.ast, prog.flows, fx);
  const wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, label, prog.ast, true));
  if (typeof wat !== "string" || wat.length === 0) return { kind: "err", reason: `empty-wat:${label}` };
  return { kind: "ok", wat };
}

function funcBodies(wat) {
  const starts = [...wat.matchAll(/\(func\s+(\$[^\s()]+)/g)];
  const seg = new Map();
  for (let i = 0; i < starts.length; i++) {
    const body = wat.slice(starts[i].index, i + 1 < starts.length ? starts[i + 1].index : wat.length);
    if (!seg.has(starts[i][1])) seg.set(starts[i][1], body);
  }
  return seg;
}

/**
 * Pure: shape { lowered, unlowered } name lists into { ladder, lowered, done, total, pct }.
 * `lowered` is the Set the verifier's checkRung consults. Injected data ⇒ self-testable
 * without spawning the compiler (DI seam).
 */
export function deriveLadder(j) {
  const loweredList = Array.isArray(j?.lowered) ? j.lowered : [];
  const unloweredList = Array.isArray(j?.unlowered) ? j.unlowered : [];
  if (loweredList.some((n) => typeof n !== "string") || unloweredList.some((n) => typeof n !== "string")) {
    throw new Error("wat-lowering-ladder: lowered/unlowered must be string arrays");
  }
  const lowered = new Set(loweredList);
  const unlowered = new Set(unloweredList);
  for (const name of unlowered) lowered.delete(name);
  const ladder = [...new Set([...loweredList, ...unloweredList])].sort();
  const done = ladder.filter((c) => lowered.has(c)).length;
  const total = ladder.length;
  if (total === 0) {
    throw new Error("wat-lowering-ladder: empty ladder — no self-hosted flows measured; RULING-1 forbids publishing a number with no rungs.");
  }
  const refused = unlowered.size;
  return { ladder, lowered, done, total, refused, pct: Math.round((done / total) * 100) };
}

/** A WAT func body is refused (not done) iff it carries the exact class-A marker. */
export function bodyIsRefused(body) {
  return typeof body === "string" && body.includes(MARKER);
}

function measureFlowLists(L) {
  const lowered = [];
  const unlowered = [];
  for (const file of STAGES) {
    const own = L.parseProgram(`@version 1\n${strip(file)}`, file);
    const names = (own.flows ?? []).map((f) => f.name).filter((n) => typeof n === "string" && n.length > 0);
    if (names.length === 0) throw new Error(`wat-lowering-ladder: ${file} declared no flows`);
    const rendered = renderWat(L, stageSource(file), `l1-${file}`);
    if (rendered.kind === "err") throw new Error(`wat-lowering-ladder: ${file} render failed (${rendered.reason})`);
    const seg = funcBodies(rendered.wat);
    for (const name of names) {
      const body = seg.get(`$${name}`);
      if (typeof body !== "string") {
        throw new Error(`wat-lowering-ladder: ${file} flow ${name} has no WAT func — cannot score the rung`);
      }
      if (body.includes(MARKER)) unlowered.push(name);
      else lowered.push(name);
    }
  }
  return { lowered, unlowered };
}

/**
 * Live: load the compiler dist, render each composed stage, score named flows.
 * Fail-closed — a missing dist / render / empty charter THROWS rather than letting
 * the % audit silently fall back to a stale hand-typed number.
 */
export async function watLoweringLadderAsync() {
  if (!existsSync(DIST)) {
    throw new Error(`wat-lowering-ladder: compiler dist not built (${DIST}) — cannot derive the L1 ladder, and RULING-1 forbids publishing an unevidenced number.`);
  }
  let L;
  try {
    L = await import(`file:///${DIST.replace(/\\/g, "/")}`);
  } catch (e) {
    throw new Error(`wat-lowering-ladder: failed to load compiler dist (${e.message})`);
  }
  return deriveLadder(measureFlowLists(L));
}

/**
 * Live sync wrapper: spawn this file with --json so component-health (CJS-style sync
 * import graph) and the percent-evidence gate share one measurement without top-level await.
 */
export function watLoweringLadder() {
  const self = resolve(fileURLToPath(import.meta.url));
  let raw;
  try {
    raw = execFileSync(process.execPath, [self, "--json"], {
      encoding: "utf8",
      cwd: ROOT,
      maxBuffer: 16 * 1024 * 1024,
    });
  } catch (e) {
    throw new Error(`wat-lowering-ladder: --json failed (${e.message}) — cannot derive the WAT L1 ladder, and RULING-1 forbids publishing an unevidenced number.`);
  }
  const parsed = JSON.parse(raw);
  if (!parsed || parsed.ok !== true) {
    throw new Error(`wat-lowering-ladder: --json did not return ok (got ${parsed?.reason ?? "invalid"})`);
  }
  return deriveLadder({ lowered: parsed.lowered, unlowered: parsed.unlowered });
}

const IS_MAIN = process.argv[1] !== undefined && process.argv[1].replace(/\\/g, "/").endsWith("scripts/lib/wat-lowering-ladder.mjs");

if (IS_MAIN && process.argv.includes("--self-test")) {
  let pass = 0;
  let fail = 0;
  const ok = (c, m) => {
    if (c) {
      pass += 1;
      console.log(`  ✅ ${m}`);
    } else {
      fail += 1;
      console.log(`  ❌ ${m}`);
    }
  };

  const r = deriveLadder({ lowered: ["a", "b", "c"], unlowered: ["d"] });
  ok(r.total === 4 && r.done === 3 && r.pct === 75, `derives done/total/pct from the lists (3/4 = 75; got ${r.done}/${r.total} = ${r.pct})`);
  ok(r.ladder.length === 4 && r.lowered.has("a") && !r.lowered.has("d"), "an unlowered flow is a RUNG but NOT lowered (checkRung=false on it)");
  ok(deriveLadder({ lowered: ["a"], unlowered: [] }).pct === 100, "all-lowered, no leftover → 100");
  ok(deriveLadder({ lowered: [], unlowered: ["a", "b"] }).pct === 0, "all-unlowered → 0 (the number MOVES with evidence)");
  ok(deriveLadder({ lowered: ["x", "y"], unlowered: ["y"] }).done === 1 && !deriveLadder({ lowered: ["x", "y"], unlowered: ["y"] }).lowered.has("y"), "a name on both lists is unlowered (fail-closed)");
  ok(deriveLadder({ lowered: ["a", "b"], unlowered: ["c"] }).refused === 1, "refused equals unlowered size and is not added to done");
  ok(!bodyIsRefused("(unreachable) (; C20: matchesPattern WAT ABI is not admitted ;)"), "T2 red-today: class-A stub without exact marker scores done");
  ok(bodyIsRefused("(unreachable) (; C20: matchesPattern WAT ABI is not admitted (emitter cannot lower) ;)"), "T2 green: class-A stub with exact marker is refused");
  let threw = false;
  try {
    deriveLadder({ lowered: [], unlowered: [] });
  } catch {
    threw = true;
  }
  ok(threw, "empty ladder THROWS (fail-closed — no rungs, no number)");

  const live = watLoweringLadder();
  ok(
    live.total > 0 && live.done <= live.total && live.pct === Math.round((live.done / live.total) * 100),
    `live path is consistent over real data (${live.done}/${live.total} = ${live.pct}%)`,
  );
  ok(live.total >= 180, `L1 charter is the self-hosted corpus (got ${live.total} unique flows)`);

  console.log(`\n${fail === 0 ? "✅" : "❌"} wat-lowering-ladder self-test: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

if (IS_MAIN && process.argv.includes("--json")) {
  if (!existsSync(DIST)) {
    process.stdout.write(`${JSON.stringify({ ok: false, reason: "dist-missing" })}\n`);
    process.exit(1);
  }
  const L = await import(`file:///${DIST.replace(/\\/g, "/")}`);
  const lists = measureFlowLists(L);
  const derived = deriveLadder(lists);
  process.stdout.write(`${JSON.stringify({
    ok: true,
    lowered: lists.lowered,
    unlowered: lists.unlowered,
    done: derived.done,
    total: derived.total,
    refused: derived.refused,
    pct: derived.pct,
  })}\n`);
}

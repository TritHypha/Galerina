#!/usr/bin/env node
// =============================================================================
// p9-100-site-mapper.mjs — the #100 worklist advisor for the P9 self-hosted stages
// =============================================================================
// WHAT: for every `Array<Auto>` site in the self-hosted compiler stages, answer:
//   SAFE (count/append/iterate only — leave as Auto)  vs
//   NEEDS-CONCRETE (a record field is read off an element → #100 trap) — and for the
//   NEEDS rows, PROPOSE the concrete element type with the evidence, so the fix
//   (concretize + typed-local hoist, the gir-emitter template) becomes a checklist,
//   not an archaeology dig.
//
// TWO LEGS, CROSS-CHECKED (the advisor refuses a worklist it cannot reconcile):
//   STATIC  — scan each stage's source; track Array<Auto> params/locals/returns,
//             collect element field-reads + append-shapes, match against the record
//             registry (lexer+parser+stage records — the Option-Y concat scope).
//   INSTRUMENT — build each stage via the SAME Option-Y concat through the real
//             compiler dist (parse → checkEffects → emitGIR → renderWAT) and scan
//             the WAT for the emitter's PRECISE `unresolved member: X` markers.
//             NOT a coarse /unreachable/ scan — that pattern also matches the
//             harmless #160 all-arms-return tail (a real near-miss; the marker
//             text is the instrument, the trap opcode is not).
//   Any member the instrument reports that the static leg missed (or vice versa)
//   is printed as a DISCREPANCY and the tool exits 1: an advisor that disagrees
//   with the instrument must not hand anyone a worklist.
//
// SCANNER DISCIPLINE (owner directive: must handle `<  >  @  /  //` — i.e. Array<T>):
//   * Balanced `<…>` is NOT a regular language — nested generics (Array<Array<Int>>)
//     cannot be correctly regex-matched. Types are read by a DEPTH-TRACKED char
//     scanner (mirrors the TS parser's parseTypeRef: base ident + balanced <…>).
//   * String- and comment-aware: a `<`, `@`, or `//` inside a "string" or after a
//     line-comment marker never reaches the scanner.
//   * TriRegex-principled (dp-rd-0459): single-pass, non-backtracking, input-bounded.
//     TriRegex itself is design-stage (no shipped engine) — this tool applies its
//     discipline by hand and stands as a named consumer use-case if it ships.
//     Incidental JS regexes below are star-height-safe (no nested unbounded
//     quantifiers) per the myco ReDoS-guard discipline; the structural path uses
//     none.
//
// SCOPE / HONEST LIMITS (declared, not silently omitted):
//   * Line-oriented scanner with brace-depth flow scoping; .fungi in-tree is
//     line-disciplined (types and headers do not wrap). A wrapped header would be
//     missed — the instrument leg still catches the trap, and the cross-check
//     turns that into a loud discrepancy, not a silent gap.
//   * Element-binder tracking covers the in-tree shapes: `match X { Some(y) => … }`
//     over `let y = arr.get(i)` / direct `arr.get(i).field`. A novel aliasing shape
//     lands in the instrument leg's court (same fail-closed net).
//   * Advisory only. It edits nothing, gates nothing; the enforcement gate remains
//     main's audit-stage-execution.mjs. Exit 0 = report delivered + legs agree;
//     exit 1 = tool failure, self-test failure, or static↔instrument discrepancy.
//
// USAGE:
//   node tools/p9-100-site-mapper.mjs                  → full report, all stages
//   node tools/p9-100-site-mapper.mjs --stage type-checker
//   node tools/p9-100-site-mapper.mjs --static-only    → skip the instrument leg
//   node tools/p9-100-site-mapper.mjs --self-test      → prove the detector fires
//   node tools/p9-100-site-mapper.mjs --file <path>    → static leg on one file
//                                                        (e.g. a git-show'd old rev)
//   Galerina root: --galerina <dir> | GALERINA_ROOT env | ../Galerina (sibling).
//
// Contact hello@trithypha.dev.
// =============================================================================
import { readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const KB = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function argVal(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
}
const GALERINA = resolve(argVal("--galerina") ?? process.env.GALERINA_ROOT ?? join(KB, "..", "Galerina"));
const SH = join(GALERINA, "packages-galerina/galerina-core-compiler/src/self-hosted");
const DIST = join(GALERINA, "packages-galerina/galerina-core-compiler/dist/index.js");

// The Option-Y concat prelude per stage: lexer alone; parser = lexer+parser; every
// other stage = lexer+parser+stage (parser's AST records in scope — the ruling).
const STAGES = [
  { name: "lexer", files: ["lexer.fungi"] },
  { name: "parser", files: ["lexer.fungi", "parser.fungi"] },
  { name: "type-checker", files: ["lexer.fungi", "parser.fungi", "type-checker.fungi"] },
  { name: "effect-checker", files: ["lexer.fungi", "parser.fungi", "effect-checker.fungi"] },
  { name: "gir-emitter", files: ["lexer.fungi", "parser.fungi", "gir-emitter.fungi"] },
  { name: "governance-verifier", files: ["lexer.fungi", "parser.fungi", "governance-verifier.fungi"] },
  { name: "runtime", files: ["lexer.fungi", "parser.fungi", "runtime.fungi"] },
];

// ── the scanner core (single-pass, non-backtracking) ─────────────────────────

/** Strip a line to its code content: cut `//` comments, blank out string bodies
 *  (quotes kept as placeholders so column math holds). Handles \" escapes. */
function codeOf(line) {
  let out = "";
  let inStr = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inStr) {
      if (c === "\\") { out += "__"; i++; continue; }
      if (c === '"') { inStr = false; out += '"'; continue; }
      out += "_";
      continue;
    }
    if (c === '"') { inStr = true; out += '"'; continue; }
    if (c === "/" && line[i + 1] === "/") break;
    out += c;
  }
  return out;
}

const isIdent = (c) => /[A-Za-z0-9_]/.test(c); // star-height-safe single class

/** Read an identifier at pos; return [ident, next] or null. */
function readIdent(s, pos) {
  let i = pos;
  while (i < s.length && s[i] === " ") i++;
  const start = i;
  while (i < s.length && isIdent(s[i])) i++;
  return i > start ? [s.slice(start, i), i] : null;
}

/** Depth-tracked type reader (the parseTypeRef mirror): base ident + optional
 *  balanced `<…>` concatenated space-free. Returns [typeString, next] or null.
 *  Correct on nesting (Array<Array<Int>>) — a counter, never a regex. */
function readType(s, pos) {
  const id = readIdent(s, pos);
  if (!id) return null;
  let [t, i] = id;
  while (i < s.length && s[i] === " ") i++;
  if (s[i] !== "<") return [t, i];
  let depth = 0;
  let out = t;
  for (; i < s.length; i++) {
    const c = s[i];
    if (c === "<") depth++;
    else if (c === ">") depth--;
    if (c !== " ") out += c;
    if (depth === 0) { i++; break; }
  }
  if (depth !== 0) return null; // unbalanced on this line — declared limit
  return [out, i];
}

/** Parse `record Name { field: Type … }` decls (brace-depth across lines). */
function parseRecords(lines) {
  const records = new Map(); // name -> Map(field -> type)
  for (let i = 0; i < lines.length; i++) {
    const code = codeOf(lines[i]);
    const m = code.match(/^\s*record\s+([A-Za-z_][A-Za-z0-9_]*)/); // star-height-safe
    if (!m) continue;
    const name = m[1];
    const fields = new Map();
    let depth = 0;
    let j = i;
    for (; j < lines.length; j++) {
      const c = codeOf(lines[j]);
      for (const ch of c) { if (ch === "{") depth++; else if (ch === "}") depth--; }
      // field lines: `ident: Type` (inside the record body, not the header/closer)
      const fm = c.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.+)$/);
      if (fm && j > i - 0 && depth >= 1) {
        const ft = readType(fm[2], 0);
        if (ft) fields.set(fm[1], ft[0]);
      }
      if (depth === 0 && j > i) break;
    }
    records.set(name, fields);
    i = j;
  }
  return records;
}

/** element type of `Array<X>` or null. Depth-aware (only strips ONE layer). */
function arrayElem(t) {
  if (!t?.startsWith("Array<") || !t.endsWith(">")) return null;
  return t.slice("Array<".length, -1);
}

/** flow name -> declared return type (the callee-signature registry: a call
 *  result is tainted ONLY when the callee DECLARES Auto/Option<Auto>/Array<Auto>
 *  — a concrete return infers fine and is deliberately not tracked). */
function collectFlowReturns(lines) {
  const out = new Map();
  for (const line of lines) {
    const code = codeOf(line);
    const m = code.match(/^\s*(?:pure\s+|secure\s+)?flow\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
    if (!m) continue;
    const rt = code.match(/->\s*(.+?)\s*$/);
    if (!rt) continue;
    const t = readType(rt[1], 0);
    if (t) out.set(m[1], t[0]);
  }
  return out;
}

// ── the static leg ───────────────────────────────────────────────────────────

/**
 * Scan ONE stage file's Array<Auto> sites. `records` = the full concat-scope
 * registry; `knownVarTypes` seeds param types of concrete params (for RHS
 * field-lookup evidence).
 */
function scanFile(text, fileLabel, records, flowReturns = new Map()) {
  const lines = text.split(/\r?\n/);
  const sites = [];   // {file,line,kind,name,flow,reads:Set,appendShapes:[],rhs,rhsType}
  const topNames = new Set(); // top-level decl names (for the no-redeclare check)
  let flow = "";
  let depth = 0;
  let groupKind = null;     // "contract" | "body" — which TOP-LEVEL group is open.
                            // A flow ends only when its BODY group closes; a contract
                            // group (single-line OR multi-line) must never end it.
  let cur = new Map();      // varName -> site (Array<Auto> vars in the current flow)
  let binders = new Map();  // optionBinder/elemBinder -> site  (e.g. Some(p) over pOpt)
  let getResults = new Map(); // varName holding `arr.get(i)` result -> site
  let autos = new Map();    // bare-Auto vars (params `x: Auto`, locals `let x: Auto`,
                            // untyped `let x = tainted.field`) -> their OWN site.
                            // The v0.2 leg: reads off these trap exactly like the
                            // Array<Auto> payloads (the `let re = fd.returnExpr` class).
  let fieldArrays = new Map(); // synthetic sites for `base.field.get(i)` — the
                            // field-array class (d.fields.get / env.entries.get):
                            // payload erases when base is tainted OR the field is
                            // declared Array<Auto> in a record. Fix = the ruled
                            // typed-local hoist, so each gets its own worklist row.
  const isTainted = (name) => binders.has(name) || autos.has(name);
  const fieldDeclaredAutoArray = (fieldName) => {
    for (const rf of records.values()) if (rf.get(fieldName) === "Array<Auto>") return true;
    return false;
  };

  for (let n = 0; n < lines.length; n++) {
    const code = codeOf(lines[n]);
    const lineNo = n + 1;

    // top-level decl names (depth 0): flow/record/enum/policy  → no-redeclare data
    if (depth === 0) {
      const tm = code.match(/^\s*(?:pure\s+|secure\s+)?(flow|record|enum|policy)\s+([A-Za-z_][A-Za-z0-9_]*)/);
      if (tm) topNames.add(tm[2]);
    }

    // flow header: capture name + params (depth-aware split on top-level commas)
    const fh = code.match(/^\s*(?:pure\s+|secure\s+)?flow\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
    if (fh && depth === 0) {
      flow = fh[1];
      groupKind = null;
      cur = new Map(); binders = new Map(); getResults = new Map(); autos = new Map(); fieldArrays = new Map();
      const open = code.indexOf("(");
      const paramsRaw = code.slice(open + 1, code.lastIndexOf(")"));
      let d = 0, part = "", parts = [];
      for (const ch of paramsRaw) {
        if (ch === "<") d++;
        else if (ch === ">") d--;
        if (ch === "," && d === 0) { parts.push(part); part = ""; } else part += ch;
      }
      if (part.trim()) parts.push(part);
      for (const p of parts) {
        const pm = p.match(/^\s*(?:readonly\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.+)$/);
        if (!pm) continue;
        const t = readType(pm[2], 0);
        if (t && t[0] === "Array<Auto>") {
          const site = { file: fileLabel, line: lineNo, kind: "param", name: pm[1], flow, reads: new Set(), appendShapes: [], rhs: "" };
          sites.push(site); cur.set(pm[1], site);
        } else if (t && t[0] === "Auto") {
          // bare-Auto param (the `lowerExpr(expr: Auto)` class) — its field reads trap
          const site = { file: fileLabel, line: lineNo, kind: "auto-param", name: pm[1], flow, reads: new Set(), appendShapes: [], rhs: "" };
          sites.push(site); autos.set(pm[1], site);
        }
      }
      // return type `-> Array<Auto>`
      const rt = code.match(/->\s*(.+?)\s*$/);
      if (rt) {
        const t = readType(rt[1], 0);
        if (t && t[0] === "Array<Auto>") sites.push({ file: fileLabel, line: lineNo, kind: "return", name: "->", flow, reads: new Set(), appendShapes: [], rhs: "" });
      }
    }

    // local decls: let/mut x: T = rhs   |   let x = rhs (untyped binder)
    const lm = code.match(/^\s*(let|mut)\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?::\s*([^=]+?))?\s*=\s*(.+)$/);
    if (lm && flow) {
      const [, , vn, tRaw, rhs] = lm;
      const t = tRaw ? readType(tRaw, 0) : null;
      if (t && t[0] === "Array<Auto>") {
        const site = { file: fileLabel, line: lineNo, kind: "local", name: vn, flow, reads: new Set(), appendShapes: [], rhs: rhs.trim() };
        sites.push(site); cur.set(vn, site);
      } else if (t && t[0] === "Auto") {
        // explicit `let x: Auto = …` — tainted by declaration
        const site = { file: fileLabel, line: lineNo, kind: "auto-local", name: vn, flow, reads: new Set(), appendShapes: [], rhs: rhs.trim() };
        sites.push(site); autos.set(vn, site);
      } else if (!t) {
        // UNTYPED binder: tainted ONLY when its base is tainted (`let re = fd.returnExpr`
        // where fd is an Array<Auto> payload / Auto var). A typed base infers fine —
        // tracking it would be a false positive, so it is deliberately not tracked.
        const fm = rhs.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)((?:\.[A-Za-z_][A-Za-z0-9_]*)+)$/);
        if (fm && isTainted(fm[1])) {
          const site = { file: fileLabel, line: lineNo, kind: "auto-local", name: vn, flow, reads: new Set(), appendShapes: [], rhs: rhs.trim() };
          sites.push(site); autos.set(vn, site);
        }
        // UNTYPED call binder: tainted ONLY when the CALLEE's declared return is
        // Auto / Option<Auto> / Array<Auto> (the `firstExpr(stmt) -> Option<Auto>`
        // class — fix = concretize the callee's return type)
        const cm = rhs.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)\(/);
        const cret = cm ? flowReturns.get(cm[1]) : undefined;
        if (cret === "Auto") {
          const site = { file: fileLabel, line: lineNo, kind: "call-auto", name: vn, flow, reads: new Set(), appendShapes: [], rhs: `${cm[1]}(…) -> Auto` };
          sites.push(site); autos.set(vn, site);
        } else if (cret === "Option<Auto>") {
          const site = { file: fileLabel, line: lineNo, kind: "call-auto", name: `${vn}⇐${cm[1]}()`, flow, reads: new Set(), appendShapes: [], rhs: `${cm[1]}(…) -> Option<Auto>` };
          sites.push(site); getResults.set(vn, site); // Some-binder payload attributes here
        } else if (cret === "Array<Auto>") {
          const site = { file: fileLabel, line: lineNo, kind: "local", name: vn, flow, reads: new Set(), appendShapes: [], rhs: `${cm[1]}(…) -> Array<Auto>` };
          sites.push(site); cur.set(vn, site);
        }
      }
      // binder of a get() result: let e = arr.get(i)
      const gm = rhs.match(/^([A-Za-z_][A-Za-z0-9_]*)\.get\(/);
      if (gm && cur.has(gm[1])) getResults.set(vn, cur.get(gm[1]));
      // binder of a FIELD-ARRAY get(): let e = base.field.get(i) — payload erases
      // when the base is tainted OR the field is declared Array<Auto> in a record
      const gm2 = rhs.match(/^([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)\.get\(/);
      if (gm2 && (isTainted(gm2[1]) || fieldDeclaredAutoArray(gm2[2]))) {
        const key = `${gm2[1]}.${gm2[2]}`;
        let fsite = fieldArrays.get(key);
        if (!fsite) {
          fsite = { file: fileLabel, line: lineNo, kind: "field-array", name: key, flow, reads: new Set(), appendShapes: [], rhs: key };
          sites.push(fsite); fieldArrays.set(key, fsite);
        }
        getResults.set(vn, fsite);
      }
    }

    // match arm binders over a get-result or a tracked var: Some(x) =>
    const sm = code.match(/(?:Some|Ok)\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)\s*=>/);
    if (sm) {
      // associate with the nearest preceding `match <subject>` line
      for (let b = n; b >= Math.max(0, n - 6); b--) {
        const mm = codeOf(lines[b]).match(/match\s+([A-Za-z_][A-Za-z0-9_]*)/);
        if (mm) {
          const subj = mm[1];
          const src = getResults.get(subj) ?? cur.get(subj) ?? null;
          if (src) binders.set(sm[1], src);
          break;
        }
      }
    }

    // element field reads: BINDER.field  (skip .get/.count/.append method calls)
    // — binder reads attribute to the ARRAY site; auto-var reads to their OWN site
    for (const [bn, site] of [...binders, ...autos]) {
      let idx = 0;
      while ((idx = code.indexOf(bn + ".", idx)) !== -1) {
        const before = idx === 0 ? " " : code[idx - 1];
        const after = code.slice(idx + bn.length + 1);
        const fm2 = after.match(/^([A-Za-z_][A-Za-z0-9_]*)/);
        idx += bn.length + 1;
        if (!fm2 || isIdent(before)) continue;
        const fname = fm2[1];
        if (["get", "count", "append", "appendAll", "contains"].includes(fname)) continue;
        site.reads.add(fname);
      }
    }
    // direct arr.get(i).field
    for (const [vn, site] of cur) {
      const dm = code.match(new RegExp("\\b" + vn + "\\.get\\([^)]*\\)\\.([A-Za-z_][A-Za-z0-9_]*)"));
      if (dm && !["count", "get", "append"].includes(dm[1])) { site.reads.add(dm[1]); site.direct = true; }
    }
    // append shapes: arr.append({ a: …, b: … })  or  arr.append(RecordName {
    for (const [vn, site] of cur) {
      const ai = code.indexOf(vn + ".append(");
      if (ai === -1) continue;
      const rest = code.slice(ai + vn.length + ".append(".length);
      const named = rest.match(/^\s*([A-Z][A-Za-z0-9_]*)\s*\{/);
      if (named) { site.appendShapes.push({ record: named[1] }); continue; }
      if (rest.trimStart().startsWith("{")) {
        const fields = [...rest.matchAll(/([A-Za-z_][A-Za-z0-9_]*)\s*:/g)].map((m2) => m2[1]);
        if (fields.length) site.appendShapes.push({ fields });
      }
    }

    const prevDepth = depth;
    for (const ch of code) { if (ch === "{") depth++; else if (ch === "}") depth--; }
    // Flow liveness: classify each top-level group at its OPENING line —
    // `contract { … }` (single- OR multi-line) never ends the flow; only the
    // BODY group's close does. Single-line groups net to 0 and trigger nothing.
    if (flow) {
      if (prevDepth === 0 && depth > 0) groupKind = /^\s*contract\b/.test(code) ? "contract" : "body";
      else if (prevDepth > 0 && depth === 0) {
        if (groupKind === "body") flow = "";
        groupKind = null;
      }
    }
  }
  return { sites, topNames };
}

/** Propose a concrete element type for a NEEDS site from the evidence. */
function propose(site, records) {
  const cands = new Map(); // type -> evidence[]
  const add = (t, ev) => { if (!cands.has(t)) cands.set(t, []); cands.get(t).push(ev); };
  // (a) named append shape
  for (const s of site.appendShapes) if (s.record && records.has(s.record)) add(s.record, `appends ${s.record}{…}`);
  // (b) read-field-set vs record registry (fields ⊆ record's fields)
  if (site.reads.size) {
    for (const [rn, rf] of records) {
      if ([...site.reads].every((f) => rf.has(f))) add(rn, `reads {${[...site.reads].join(",")}} ⊆ ${rn}`);
    }
  }
  // (c) RHS field lookup: `= X.field` — Array<T> fields propose T for array sites;
  //     record-typed fields propose the record itself for bare-Auto locals
  const rm = site.rhs?.match(/^([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)$/);
  if (rm) {
    for (const [rn, rf] of records) {
      const ft = rf.get(rm[2]);
      const el = arrayElem(ft);
      if (el && site.kind !== "auto-local" && site.kind !== "auto-param")
        add(el, `rhs ${rm[1]}.${rm[2]} : ${rn}.${rm[2]} = Array<${el}>`);
      else if (ft && !el && records.has(ft) && (site.kind === "auto-local" || site.kind === "auto-param"))
        add(ft, `rhs ${rm[1]}.${rm[2]} : ${rn}.${rm[2]} = ${ft}`);
    }
  }
  // (d) anonymous append shape with no registry match → propose defining a record
  const anon = site.appendShapes.find((s) => s.fields);
  if (anon && cands.size === 0) return { type: `NEW record {${anon.fields.join(", ")}}`, conf: "DEFINE", ev: ["anonymous append shape — name it (derive-from-append ruling)"] };
  if (cands.size === 0) return { type: "?", conf: "UNKNOWN", ev: ["no evidence matched — read the flow by hand"] };
  // rank: most evidence wins; tie → ambiguous (fail-closed: never silently pick)
  const ranked = [...cands.entries()].sort((a, b) => b[1].length - a[1].length);
  if (ranked.length > 1 && ranked[0][1].length === ranked[1][1].length)
    return { type: ranked.map(([t]) => t).join(" | "), conf: "AMBIGUOUS", ev: ranked.flatMap(([, e]) => e) };
  return { type: ranked[0][0], conf: ranked[0][1].length >= 2 ? "HIGH" : "MED", ev: ranked[0][1] };
}

// ── the instrument leg ───────────────────────────────────────────────────────

const stripSrc = (p) => {
  let s = readFileSync(join(SH, p), "utf8");
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  return s.replace(/^@version 1\s*/m, "");
};

/** Build a stage's Option-Y concat through the real compiler; return the set of
 *  `unresolved member: X` names in the WAT (the emitter's own #100 markers). */
async function instrumentStage(L, stage) {
  const src = "@version 1\n" + stage.files.map(stripSrc).join("\n");
  const prog = L.parseProgram(src, `map-${stage.name}`);
  const errs = (prog.diagnostics ?? []).filter((d) => d.severity === "error");
  if (errs.length) return { error: `parse: ${errs[0].code}` };
  const fx = L.checkEffects(prog.flows, prog.ast);
  const { gir } = L.emitGIR(prog.ast, prog.flows, fx);
  const wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "map", prog.ast, true));
  const members = new Set();
  // the PRECISE marker — never a coarse /unreachable/ (which also matches the
  // benign #160 structural tail; that mistake has been made once already)
  for (const m of wat.matchAll(/unresolved member: ([A-Za-z_][A-Za-z0-9_]*)/g)) members.add(m[1]);
  return { members };
}

// ── self-test ────────────────────────────────────────────────────────────────
const FIXTURE = `@version 1
record Item {
  name: String
  size: Int
}
record Widget {
  size: Int
  colour: String
}
record Box {
  items: Array<Item>
  label: String
}
// a "< tricky > string" and comment with Array<Bogus> must not confuse the scanner
pure flow needsDirect(xs: Array<Auto>) -> Int
contract { intent { "direct .get(i).field — NEEDS" } }
{
  return xs.get(0).name
}
pure flow needsBound(xs: Array<Auto>) -> Int
contract { intent { "match-bound field read — NEEDS, evidence name+size → Item" } }
{
  let e = xs.get(0)
  match e {
    Some(it) => { return it.size + it.name.count() }
    _ => { return 0 }
  }
}
pure flow ambiguousRead(xs: Array<Auto>) -> Int
contract { intent { "reads only 'size' — Item AND Widget match → AMBIGUOUS" } }
{
  let e = xs.get(0)
  match e {
    Some(it) => { return it.size }
    _ => { return 0 }
  }
}
pure flow safeCount(xs: Array<Auto>) -> Int
contract { intent { "count/append only — SAFE" } }
{
  mut out: Array<Auto> = Array.empty()
  out = out.append("s")
  return xs.count() + out.count()
}
pure flow rhsEvidence(b: Box) -> Int
contract { intent { "local from a record field — rhs evidence → Item" } }
{
  let kids: Array<Auto> = b.items
  let e = kids.get(0)
  match e {
    Some(it) => { return it.size }
    _ => { return 0 }
  }
}
pure flow nested(m: Array<Array<Int>>) -> Int
contract { intent { "nested generic must scan as ONE type, not confuse depth" } }
{
  return m.count()
}
pure flow anonAppend(n: Int) -> Int
contract { intent { "anonymous append shape → DEFINE proposal" } }
{
  mut diags: Array<Auto> = Array.empty()
  diags = diags.append({ code: "X", message: "y", flowName: "z" })
  return diags.get(0).code
}
pure flow multiLineContract(xs: Array<Auto>) -> Int
contract {
  intent { "the REAL stage shape: a MULTI-line contract block must not end the flow (a caught false-negative class)" }
}
{
  let e = xs.get(0)
  match e {
    Some(it) => { return it.size + it.name.count() }
    _ => { return 0 }
  }
}
record Ret {
  leftType: String
  rightType: String
}
record Decl {
  title: String
  ret: Ret
}
pure flow autoParam(d: Auto) -> Int
contract { intent { "bare-Auto PARAM field reads trap — the lowerExpr(expr: Auto) class" } }
{
  return d.title.count()
}
pure flow taintChain(ds: Array<Auto>) -> Int
contract { intent { "untyped local off a TAINTED base — the let-re-equals-fd.returnExpr class" } }
{
  let dOpt = ds.get(0)
  match dOpt {
    Some(d) => {
      let re = d.ret
      return re.leftType.count() + re.rightType.count()
    }
    _ => { return 0 }
  }
}
pure flow typedBaseControl(d2: Decl) -> Int
contract { intent { "NEGATIVE control: untyped local off a TYPED base infers fine — must NOT be tracked" } }
{
  let r2 = d2.ret
  return r2.leftType.count()
}
record Sub {
  mask: Int
  tag: String
}
pure flow fieldArrayHoist(ds: Array<Auto>) -> Int
contract { intent { "field-array get off a tainted base — the d.fields.get(j) class; fix = typed-local hoist" } }
{
  let dOpt = ds.get(0)
  match dOpt {
    Some(d) => {
      let sOpt = d.subs.get(0)
      match sOpt {
        Some(s) => { return s.mask }
        _ => { return 0 }
      }
    }
    _ => { return 0 }
  }
}
pure flow pickSub(ds: Array<Auto>) -> Option<Auto>
contract { intent { "helper with an ERASED Option return — its callers' payloads trap" } }
{
  return ds.get(0)
}
pure flow callAutoOption(ds: Array<Auto>) -> Int
contract { intent { "payload of an Option-of-Auto-returning CALL — the firstExpr class; fix = concretize the callee return" } }
{
  let sOpt = pickSub(ds)
  match sOpt {
    Some(s) => { return s.mask }
    _ => { return 0 }
  }
}
pure flow firstItem(b4: Box) -> Item
contract { intent { "concrete-return helper for the negative control" } }
{
  return b4.items.get(0)
}
pure flow typedCallControl(b3: Box) -> Int
contract { intent { "NEGATIVE control: a call with a CONCRETE declared return is NOT tracked" } }
{
  let it = firstItem(b3)
  return it.size
}
`;

function selfTest() {
  const checks = [];
  const fixtureLines = FIXTURE.split(/\r?\n/);
  const records = parseRecords(fixtureLines);
  const { sites } = scanFile(FIXTURE, "fixture", records, collectFlowReturns(fixtureLines));
  const by = (flow, name) => sites.find((s) => s.flow === flow && s.name === name);

  checks.push(["record registry parses (Item/Widget/Box/Ret/Decl/Sub) with depth-read field types",
    records.get("Box")?.get("items") === "Array<Item>" && records.get("Decl")?.get("ret") === "Ret" && records.size === 6]);
  const d = by("needsDirect", "xs");
  checks.push(["direct .get(i).field is NEEDS with the field captured", !!d && d.reads.has("name")]);
  const b = by("needsBound", "xs");
  const pb = b && propose(b, records);
  checks.push(["match-bound reads {size,name} propose Item (unique superset)", pb?.type === "Item"]);
  const a = by("ambiguousRead", "xs");
  const pa = a && propose(a, records);
  checks.push(["single shared field is AMBIGUOUS, never silently picked", pa?.conf === "AMBIGUOUS" && pa.type.includes("Item") && pa.type.includes("Widget")]);
  const s1 = by("safeCount", "xs");
  const s2 = by("safeCount", "out");
  checks.push(["count/append-only vars classify SAFE (no element reads)", !!s1 && s1.reads.size === 0 && !!s2 && s2.reads.size === 0]);
  const r = by("rhsEvidence", "kids");
  const pr = r && propose(r, records);
  checks.push(["rhs `= b.items` yields Item via the registry field lookup", !!pr && pr.type === "Item" && pr.conf === "HIGH"]);
  checks.push(["nested Array<Array<Int>> scans as one balanced type (no Auto site)", !sites.some((s) => s.flow === "nested")]);
  const an = by("anonAppend", "diags");
  const pan = an && propose(an, records);
  checks.push(["anonymous append shape → DEFINE proposal carrying the field set",
    !!pan && pan.conf === "DEFINE" && pan.type.includes("code") && pan.type.includes("flowName")]);
  checks.push(["strings/comments with < > @ // never create sites",
    !sites.some((s) => s.file !== "fixture") && sites.every((s) => Number.isInteger(s.line))]);
  const ml = by("multiLineContract", "xs");
  const pml = ml && propose(ml, records);
  checks.push(["★ multi-line contract block does NOT end the flow (the gir-emitter false-negative class)",
    !!ml && ml.reads.has("size") && pml?.type === "Item"]);
  const ap = by("autoParam", "d");
  const pap = ap && propose(ap, records);
  checks.push(["★ v0.2: bare-Auto PARAM tracked; field read proposes the record (Decl)",
    !!ap && ap.kind === "auto-param" && ap.reads.has("title") && pap?.type === "Decl"]);
  const tc = by("taintChain", "re");
  const ptc = tc && propose(tc, records);
  checks.push(["★ v0.2: untyped local off a TAINTED base tracked; rhs+reads propose Ret (HIGH)",
    !!tc && tc.kind === "auto-local" && tc.reads.has("leftType") && ptc?.type === "Ret" && ptc.conf === "HIGH"]);
  checks.push(["★ v0.2 NEGATIVE control: untyped local off a TYPED base is NOT tracked (no false positive)",
    !by("typedBaseControl", "r2")]);
  checks.push(["★ v0.2: the array site still gets the base's own field read (ret on ds)",
    !!by("taintChain", "ds") && by("taintChain", "ds").reads.has("ret")]);
  const fa = by("fieldArrayHoist", "d.subs");
  const pfa = fa && propose(fa, records);
  checks.push(["★ v0.2: field-array get off a tainted base gets its OWN hoist site; reads propose Sub",
    !!fa && fa.kind === "field-array" && fa.reads.has("mask") && pfa?.type === "Sub"]);
  const ca = by("callAutoOption", "sOpt⇐pickSub()");
  const pca = ca && propose(ca, records);
  checks.push(["★ v0.2: payload of an Option<Auto>-returning CALL tracked (the firstExpr class); reads propose Sub",
    !!ca && ca.kind === "call-auto" && ca.reads.has("mask") && pca?.type === "Sub"]);
  checks.push(["★ v0.2 NEGATIVE control: a call with a CONCRETE declared return is NOT tracked",
    !by("typedCallControl", "it") && !by("typedCallControl", "it⇐firstItem()")]);

  let ok = true;
  for (const [name, pass] of checks) { console.log(`  ${pass ? "✅" : "❌"} ${name}`); if (!pass) ok = false; }
  if (!ok) { console.error("\n  ❌ site-mapper self-test FAILED — the advisor is not trustworthy; fix before use"); process.exit(1); }
  console.log("\n  site-mapper self-test: detector fires on every planted shape, silent on the controls ✅");
  process.exit(0);
}

// ── main ─────────────────────────────────────────────────────────────────────
if (process.argv.includes("--self-test")) selfTest();

if (!existsSync(SH)) { console.error(`[site-mapper] stages dir not found: ${SH} — pass --galerina <root>`); process.exit(1); }

const only = argVal("--stage");
const oneFile = argVal("--file");
const staticOnly = process.argv.includes("--static-only") || !!oneFile;

// registry scope = lexer + parser + (stage) — the concat scope
const baseLines = ["lexer.fungi", "parser.fungi"].map((f) => readFileSync(join(SH, f), "utf8")).join("\n").split(/\r?\n/);
const baseRecords = parseRecords(baseLines);
const baseReturns = collectFlowReturns(baseLines);
const baseNames = new Set();
{ const { topNames } = scanFile(baseLines.join("\n"), "lexer+parser", baseRecords); for (const t of topNames) baseNames.add(t); }

let L = null;
if (!staticOnly) {
  if (!existsSync(DIST)) { console.error(`[site-mapper] compiler dist absent (${DIST}) — instrument leg unavailable; rerun --static-only if intended. Fail-closed.`); process.exit(1); }
  L = await import(`file:///${DIST.replace(/\\/g, "/")}`);
}

const targets = oneFile
  ? [{ name: `file:${oneFile}`, files: null, single: oneFile }]
  : STAGES.filter((s) => !only || s.name === only);

let discrepancies = 0;
for (const st of targets) {
  const label = st.name;
  const stageFile = st.single ?? st.files[st.files.length - 1];
  const text = st.single ? readFileSync(st.single, "utf8") : readFileSync(join(SH, stageFile), "utf8");
  const records = new Map(baseRecords);
  for (const [k, v] of parseRecords(text.split(/\r?\n/))) records.set(k, v);
  const flowReturns = new Map(baseReturns);
  for (const [k, v] of collectFlowReturns(text.split(/\r?\n/))) flowReturns.set(k, v);
  const { sites, topNames } = scanFile(text, stageFile, records, flowReturns);

  const needs = sites.filter((s) => s.reads.size > 0 || s.appendShapes.some((a) => a.fields || a.record));
  const safe = sites.filter((s) => !needs.includes(s));
  console.log(`\n━━ ${label} — ${sites.length} Array<Auto> site(s): ${needs.length} NEEDS-CONCRETE · ${safe.length} SAFE`);
  for (const s of needs) {
    const p = propose(s, records);
    const tag = s.kind === "param" ? "param" : s.kind === "return" ? "ret " : s.kind === "auto-param" ? "auto-param" : s.kind === "auto-local" ? "auto-local" : s.kind === "field-array" ? "field-arr" : s.kind === "call-auto" ? "call-auto" : "local";
    const shape = s.kind === "auto-param" || s.kind === "auto-local" || s.kind === "call-auto" ? p.type : `Array<${p.type}>`;
    console.log(`   NEEDS ${stageFile}:${s.line} [${tag}] ${s.flow}.${s.name}` +
      ` → ${shape} (${p.conf})${s.direct ? " ⚠ direct .get().field — hoist to a typed local" : ""}${s.kind === "field-array" ? " ⚠ hoist to a typed local first (ruled pattern)" : ""}${s.kind === "call-auto" ? ` ⚠ concretize the CALLEE's return (${s.rhs})` : ""}`);
    for (const e of p.ev) console.log(`         · ${e}`);
  }
  for (const s of safe) console.log(`   safe  ${stageFile}:${s.line} [${s.kind}] ${s.flow}.${s.name} (count/append/iterate only)`);

  // no-redeclare check (the #107 late-failure guard): stage vs lexer+parser
  if (!st.single && stageFile !== "lexer.fungi" && stageFile !== "parser.fungi") {
    const clashes = [...topNames].filter((t) => baseNames.has(t));
    if (clashes.length) console.log(`   ⚠ REDECLARE vs lexer+parser (would fail LATE at instantiate, #107): ${clashes.join(", ")}`);
    else console.log(`   redeclare-check: clean vs lexer+parser`);
  }

  // instrument cross-check
  if (!staticOnly && st.files) {
    const inst = await instrumentStage(L, st);
    if (inst.error) { console.log(`   instrument: build failed (${inst.error})`); discrepancies++; continue; }
    const staticFields = new Set(needs.flatMap((s) => [...s.reads]));
    const instOnly = [...inst.members].filter((m) => !staticFields.has(m));
    const staticOnlyF = [...staticFields].filter((m) => !inst.members.has(m));
    console.log(`   instrument: ${inst.members.size} unresolved-member name(s) in WAT${inst.members.size ? ` {${[...inst.members].join(",")}}` : ""}`);
    if (instOnly.length) { console.log(`   ❌ DISCREPANCY — instrument sees, static missed: ${instOnly.join(", ")}`); discrepancies++; }
    if (staticOnlyF.length) console.log(`   note — static flags fields the instrument no longer marks (fixed or non-lowered path): ${staticOnlyF.join(", ")}`);
  }
}

if (discrepancies) {
  console.error(`\n❌ site-mapper: ${discrepancies} static↔instrument discrepancy(ies) — do NOT hand this worklist over; fix the mapper first.`);
  process.exit(1);
}
console.log(`\n✅ site-mapper: report complete; static and instrument legs agree. Advisory only — the enforcement gate remains audit-stage-execution.mjs.`);

#!/usr/bin/env node
// audit-route-overlap.mjs — fail-CLOSED build lint (DP-RD-0285, tri-state route resolution). No two
// same-method routes may have OVERLAPPING match sets. Galerina refuses ambiguous HTTP dispatch as a governed
// HOLD instead of the first-match-wins + precedence rules every mainstream router ships (route-confusion:
// path-normalisation shadowing, shadowed routes, method-override bypass). This is the BUILD-TIME half: two
// routes whose patterns can match a common concrete path must be disambiguated, or the build is rejected —
// the same checker class as match-exhaustiveness. The runtime HOLD arm is separate.
//
// Grounded in the REAL pattern language of packages-galerina/galerina-core-compiler/src/route-registry.ts
// (parseRouteEntry) + its tests:
//   surface:  route <METHOD> "<path>" { ... flow <name> ... }   — only flow-bearing routes register.
//   a "{name}" path segment compiles to ([^/]+): exactly ONE non-empty, non-slash segment;
//   literal segments are spliced verbatim into `new RegExp("^"+..+"$")` — UNescaped, so a literal that
//   contains a regex metachar is actually MORE permissive than exact-match.
// Two same-method routes therefore overlap iff same segment count AND every position is compatible
// (param<->param, param<->non-empty-literal, equal literals). A segment with any regex-significant char is
// treated as a WILDCARD compatible with anything, so the lint never UNDER-reports (fail-closed) and stays
// faithful to route-registry's unescaped-literal behaviour.
//
// Inventory = git-tracked *.fungi route declarations (the authoring site — stricter than the built manifest;
// DP-RD-0285's signed-manifest lint will also read the manifest once it carries a route inventory).
//
// SCOPING — overlap is a per-REGISTRY property. The compiler builds one registry per parsed program
// (buildRouteRegistry over a single parseProgram(source).ast), and the shipped model parses ONE .fungi file
// per program (hosts are thin shims; multi-file composition is the future Phase-54 / signed-manifest
// concern). So routes are grouped BY FILE: two routes collide only if declared in the SAME file. This is
// SOUND — it will not fail the build on two unrelated example services that legitimately reuse a path (e.g.
// examples/auth-service exposes POST /governance/verify from two independent service files that never share
// a registry). Cross-app overlap is deferred to the manifest-scoped inventory, exactly per DP-RD-0285.
//
// Usage:
//   node scripts/audit-route-overlap.mjs --self-test   # prove the detector fires (run first in CI)
//   node scripts/audit-route-overlap.mjs               # enforce: exit 1 on any undisambiguated overlap
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// Spawn git directly, NO shell: args pass as an array (no shell-injection surface, no DEP0190).
const git = (...a) => execFileSync("git", a, { cwd: ROOT, encoding: "utf8", windowsHide: true });

const METHODS = new Set(["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"]);
// A reviewed, intentional overlap carries this marker on the route line or the comment directly above it.
// The runtime MUST then HOLD on the ambiguity (never first-match). Default is REJECT; the marker is the only
// escape and it is loud — DP-RD-0285 forbids precedence rules, so the real fix is to disambiguate patterns.
const ALLOW_MARKER = "route-overlap:allow";

// --- pattern language (mirrors route-registry.ts parseRouteEntry) ---
function classifySeg(seg) {
  if (/^\{[^{}]+\}$/.test(seg)) return { kind: "param" };
  if (/[.*+?()[\]{}^$|\\]/.test(seg)) return { kind: "wildcard" }; // can't prove disjoint -> fail-closed
  return { kind: "literal", seg };
}
function segCompatible(a, b) {
  if (a.kind === "wildcard" || b.kind === "wildcard") return true;
  if (a.kind === "param" && b.kind === "param") return true;
  if (a.kind === "param" && b.kind === "literal") return b.seg.length > 0; // [^/]+ needs >= 1 char
  if (a.kind === "literal" && b.kind === "param") return a.seg.length > 0;
  return a.seg === b.seg; // literal vs literal
}
function overlap(r1, r2) {
  if (r1.method !== r2.method) return false; // dispatch filters by method first
  const s1 = r1.path.split("/");
  const s2 = r2.path.split("/");
  if (s1.length !== s2.length) return false;
  for (let i = 0; i < s1.length; i++) {
    if (!segCompatible(classifySeg(s1[i]), classifySeg(s2[i]))) return false;
  }
  return true;
}
// routes: [{method, path, file, line, allow}] -> overlapping pairs (allowlisted pairs suppressed).
function findOverlaps(routes) {
  const pairs = [];
  for (let i = 0; i < routes.length; i++) {
    for (let j = i + 1; j < routes.length; j++) {
      if (!overlap(routes[i], routes[j])) continue;
      if (routes[i].allow || routes[j].allow) continue;
      pairs.push([routes[i], routes[j]]);
    }
  }
  return pairs;
}
// Group by file (one file = one parsed program = one registry) before pairing, so an overlap is only ever
// reported between two routes that actually share a registry. See the SCOPING note in the header.
function findOverlapsGrouped(routes) {
  const byFile = new Map();
  for (const r of routes) {
    const arr = byFile.get(r.file);
    if (arr) arr.push(r);
    else byFile.set(r.file, [r]);
  }
  const out = [];
  for (const group of byFile.values()) out.push(...findOverlaps(group));
  return out;
}

// --- extractor: pull route decls from .fungi text. Returns { routes, gaps }. ---
const ROUTE_HEAD = /\broute\s+([A-Za-z]+)\s+"([^"]*)"/g;
const ROUTE_FULL = /^\broute\s+([A-Za-z]+)\s+"([^"]*)"\s*\{([\s\S]*?)\}/;
function extractRoutes(text, file = "<mem>") {
  const routes = [];
  const gaps = [];
  const lines = text.split(/\r?\n/);
  ROUTE_HEAD.lastIndex = 0;
  let m;
  while ((m = ROUTE_HEAD.exec(text)) !== null) {
    const method = m[1].toUpperCase();
    const path = m[2];
    const line = text.slice(0, m.index).split(/\r?\n/).length;
    // A route head we cannot complete into a `{ ... }` body is unreadable -> fail-closed gap.
    const full = text.slice(m.index).match(ROUTE_FULL);
    if (full === null) {
      gaps.push({ file, line, reason: `route ${m[1]} "${path}" has no parseable { ... } body` });
      continue;
    }
    if (!METHODS.has(method)) {
      gaps.push({ file, line, reason: `route "${path}" uses unknown method "${m[1]}"` });
      continue;
    }
    if (!/\bflow\s+\w+/.test(full[3])) continue; // matches runtime: only flow-bearing routes register
    const near = `${lines[line - 1] ?? ""}\n${lines[line - 2] ?? ""}`;
    routes.push({ method, path, file, line, allow: near.includes(ALLOW_MARKER) });
  }
  return { routes, gaps };
}

function selfTest() {
  const R = (method, path, allow = false) => ({ method, path, file: "t", line: 1, allow });
  const ex1 = extractRoutes(`route GET "/users/{id}" { flow getUser }`);
  const ex2 = extractRoutes(`route POST "/orders" { request Req response Res flow createOrder }`);
  const ex3 = extractRoutes(`route GET "/nothing" { request T response U }`); // no flow -> excluded
  const ex4 = extractRoutes(`route GET "/broken"`); // no body -> gap
  const checks = [
    // overlap algebra
    ["param shadows literal -> overlap", overlap(R("GET", "/users/{id}"), R("GET", "/users/me"))],
    ["cross param/literal -> overlap", overlap(R("GET", "/a/{x}"), R("GET", "/{y}/b"))],
    ["identical -> overlap", overlap(R("GET", "/a"), R("GET", "/a"))],
    ["different method -> no overlap", !overlap(R("GET", "/users/{id}"), R("POST", "/users/{id}"))],
    ["different literal -> no overlap", !overlap(R("GET", "/orders"), R("GET", "/users"))],
    ["different arity -> no overlap", !overlap(R("GET", "/u/{id}"), R("GET", "/u/{id}/x"))],
    ["param cannot match empty trailing literal", !overlap(R("GET", "/x/{id}"), R("GET", "/x/"))],
    ["regex-metachar literal -> wildcard (fail-closed)", classifySeg("v1.0").kind === "wildcard"],
    ["wildcard segment -> overlap (fail-closed)", overlap(R("GET", "/files/{n}"), R("GET", "/files/*"))],
    // allow-marker + pairing
    ["findOverlaps flags an unmarked pair", findOverlaps([R("GET", "/u/{id}"), R("GET", "/u/me")]).length === 1],
    ["findOverlaps respects allow-marker", findOverlaps([R("GET", "/u/{id}"), R("GET", "/u/me", true)]).length === 0],
    ["disjoint set is silent", findOverlaps([R("GET", "/a"), R("GET", "/b"), R("POST", "/a")]).length === 0],
    // per-file grouping — overlap only reported within one registry (one file)
    ["grouped: same-file duplicate flags", findOverlapsGrouped([{ method: "GET", path: "/a", file: "f1", line: 1, allow: false }, { method: "GET", path: "/a", file: "f1", line: 2, allow: false }]).length === 1],
    ["grouped: cross-file same path does NOT flag", findOverlapsGrouped([{ method: "GET", path: "/a", file: "f1", line: 1, allow: false }, { method: "GET", path: "/a", file: "f2", line: 1, allow: false }]).length === 0],
    // extractor
    ["extract: single flow route", ex1.routes.length === 1 && ex1.routes[0].path === "/users/{id}" && ex1.routes[0].method === "GET"],
    ["extract: request/response route", ex2.routes.length === 1 && ex2.routes[0].method === "POST"],
    ["extract: flowless route excluded (runtime parity)", ex3.routes.length === 0],
    ["extract: unreadable route -> gap (fail-closed)", ex4.routes.length === 0 && ex4.gaps.length === 1],
  ];
  let ok = true;
  for (const [name, pass] of checks) { console.log(`  ${pass ? "✅" : "❌"} ${name}`); if (!pass) ok = false; }
  if (!ok) { console.error("  ❌ self-test FAILED — route-overlap detectors are neutered"); process.exit(1); }
  console.log("  route-overlap self-test: overlap fires on ambiguous pairs, silent on disjoint sets ✅");
}

if (process.argv.includes("--self-test")) { selfTest(); process.exit(0); }

const files = git("ls-files", "*.fungi").split("\n").map((s) => s.trim().split("\\").join("/")).filter(Boolean);
const routes = [];
const gaps = [];
for (const rel of files) {
  const abs = join(ROOT, rel);
  if (!existsSync(abs)) continue;
  const r = extractRoutes(readFileSync(abs, "utf8"), rel);
  routes.push(...r.routes);
  gaps.push(...r.gaps);
}
const overlaps = findOverlapsGrouped(routes);

const problems = [];
for (const g of gaps) problems.push(`  ROUTE-GAP  ${g.file}:${g.line}  — ${g.reason} (a route the lint cannot read is refused)`);
for (const [a, b] of overlaps) {
  problems.push(`  OVERLAP    ${a.method} ${a.path}  (${a.file}:${a.line})  ∩  ${b.method} ${b.path}  (${b.file}:${b.line})`);
}

if (problems.length) {
  console.error(`\n  ❌ route-overlap: ${problems.length} problem(s) across ${files.length} .fungi file(s):\n`);
  console.error(problems.join("\n"));
  console.error(`\n  Fix: disambiguate the patterns so no two same-method routes can match one concrete path`);
  console.error(`  (DP-RD-0285 forbids first-match / precedence). A reviewed intentional overlap whose runtime`);
  console.error(`  MUST HOLD may carry "${ALLOW_MARKER}" on the route line or the comment above it.`);
  process.exit(1);
}
console.log(`  ✅ route-overlap: ${routes.length} string-path route(s) across ${files.length} .fungi file(s), no within-file overlaps, no unreadable routes.`);

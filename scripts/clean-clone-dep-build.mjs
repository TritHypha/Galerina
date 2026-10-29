#!/usr/bin/env node
// clean-clone-dep-build.mjs: build the @galerina package dependency closure inside a
// clean, non-shared clone, so compiler-backed suites (galerina.mjs run/invoke) can be
// re-run there without borrowing another work tree's dist or node_modules.
//
// Offline by design: no npm install, no network.
//   - @galerina deps are linked with RELATIVE symlinks that stay inside the clone.
//   - Third-party deps (typescript, @types/node, @noble/*, argon2, ...) are COPIED
//     (dereferenced) from one or more --vendor-from trees, never linked, so nothing
//     this tool does can write into a vendor tree.
//   - Each package is then emitted in dependency order with `tsc -p tsconfig.json
//     --noCheck` (the recorded recipe; type checking is the job of the package suites).
// Fails closed (exit 2, typed code) on: a cycle, an unknown @galerina dep, a file: spec
// that points at a different package, any write path that resolves outside the clone
// (including through a symlinked parent such as a node_modules link into another tree),
// a vendor tree that overlaps the clone, a root that is not the git top level, a
// conflicting existing link, and a typescript version outside --expect-typescript.
// Build failures (tsc rc != 0 or the package main missing afterwards) exit 1.
//
// Usage:
//   node scripts/clean-clone-dep-build.mjs [--root <clone>] [--target @galerina/x ...]
//        [--vendor-from <tree> ...] [--plan] [--json <report>] [--no-tsc]
//        [--expect-typescript <prefix>] [--timeout-ms <n>]
// Defaults: --root = cwd, --target @galerina/core-compiler.

import {
  readFileSync, readdirSync, existsSync, mkdirSync, symlinkSync, lstatSync,
  readlinkSync, realpathSync, cpSync, writeFileSync,
} from "node:fs";
import { join, resolve, relative, dirname, isAbsolute, basename } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const SCOPE = "@galerina/";
export const DEFAULT_TARGET = "@galerina/core-compiler";

export class DepBuildError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.code = code;
  }
}

export function parseArgs(argv) {
  const out = {
    root: null, targets: [], vendorFrom: [], plan: false, json: null,
    tsc: true, expectTypescript: null, timeoutMs: 600000,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined || v.startsWith("--")) throw new DepBuildError("ARG", `${a} needs a value`);
      return v;
    };
    if (a === "--root") out.root = next();
    else if (a === "--target") out.targets.push(next());
    else if (a === "--vendor-from") out.vendorFrom.push(next());
    else if (a === "--plan") out.plan = true;
    else if (a === "--json") out.json = next();
    else if (a === "--no-tsc") out.tsc = false;
    else if (a === "--expect-typescript") out.expectTypescript = next();
    else if (a === "--timeout-ms") {
      const n = Number(next());
      if (!Number.isSafeInteger(n) || n <= 0) throw new DepBuildError("ARG", "--timeout-ms must be a positive integer");
      out.timeoutMs = n;
    } else throw new DepBuildError("ARG", `unknown argument ${a}`);
  }
  if (out.targets.length === 0) out.targets.push(DEFAULT_TARGET);
  for (const t of out.targets) {
    if (!t.startsWith(SCOPE) || t.length === SCOPE.length) throw new DepBuildError("ARG", `target ${t} is not an ${SCOPE} package`);
  }
  return out;
}

export function isInside(parent, child) {
  const rel = relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function lexists(p) {
  try { lstatSync(p); return true; } catch { return false; }
}

// Real path of the nearest existing ancestor, joined with the not-yet-existing rest.
// A symlinked parent therefore resolves to where a write would really land.
export function realTarget(p) {
  let cur = resolve(p);
  const rest = [];
  while (!lexists(cur)) {
    rest.unshift(basename(cur));
    const up = dirname(cur);
    if (up === cur) break;
    cur = up;
  }
  return join(realpathSync(cur), ...rest);
}

export function assertWritable(root, p, what) {
  const real = realTarget(p);
  if (!isInside(root, real)) throw new DepBuildError("OUTSIDE_ROOT", `${what} ${p} resolves to ${real}, outside ${root}`);
  return real;
}

// mkdir -p that refuses to pass through any symlinked component below root.
export function ensureDirInside(root, dir) {
  const rel = relative(root, resolve(dir));
  if (rel.startsWith("..") || isAbsolute(rel)) throw new DepBuildError("OUTSIDE_ROOT", `${dir} is outside ${root}`);
  let cur = root;
  for (const part of rel.split(/[\\/]/).filter(Boolean)) {
    cur = join(cur, part);
    if (lexists(cur)) {
      if (lstatSync(cur).isSymbolicLink()) throw new DepBuildError("SYMLINK_PARENT", `${cur} is a symlink; refusing to write through it`);
    } else {
      mkdirSync(cur);
    }
  }
}

export function discoverPackages(root) {
  const base = join(root, "packages-ts");
  if (!existsSync(base)) throw new DepBuildError("NO_PACKAGES", `${base} missing`);
  const byName = new Map();
  for (const d of readdirSync(base).sort()) {
    const pjPath = join(base, d, "package.json");
    if (!existsSync(pjPath)) continue;
    const pj = JSON.parse(readFileSync(pjPath, "utf8"));
    if (typeof pj.name !== "string" || !pj.name.startsWith(SCOPE)) continue;
    if (byName.has(pj.name)) throw new DepBuildError("DUPLICATE", `${pj.name} in ${byName.get(pj.name).short} and ${d}`);
    const all = { ...(pj.peerDependencies || {}), ...(pj.devDependencies || {}), ...(pj.dependencies || {}) };
    const internal = [];
    const external = [];
    for (const n of Object.keys(all).sort()) (n.startsWith(SCOPE) ? internal : external).push({ name: n, spec: String(all[n]) });
    byName.set(pj.name, {
      name: pj.name, short: d, dir: join(base, d), internal, external,
      main: typeof pj.main === "string" ? pj.main : null,
      hasTsconfig: existsSync(join(base, d, "tsconfig.json")),
    });
  }
  return byName;
}

// Depth-first closure of the targets; dependencies always come before dependents.
export function buildOrder(pkgs, targets) {
  const state = new Map();
  const order = [];
  const visit = (name, from, path) => {
    const p = pkgs.get(name);
    if (!p) throw new DepBuildError("UNKNOWN_DEP", `${from} needs ${name}, which is not in packages-ts`);
    const s = state.get(name);
    if (s === "done") return;
    if (s === "active") throw new DepBuildError("CYCLE", [...path.slice(path.indexOf(name)), name].join(" -> "));
    state.set(name, "active");
    for (const dep of p.internal) {
      const target = pkgs.get(dep.name);
      if (target && dep.spec.startsWith("file:") && resolve(p.dir, dep.spec.slice(5)) !== resolve(target.dir)) {
        throw new DepBuildError("SPEC_MISMATCH", `${p.name} maps ${dep.name} to ${dep.spec}, but the package lives in ${target.short}`);
      }
      visit(dep.name, p.name, [...path, name]);
    }
    state.set(name, "done");
    order.push(name);
  };
  for (const t of targets) visit(t, "target", []);
  return order;
}

export function findVendorModule(vendorRoots, pkgShort, name) {
  for (const v of vendorRoots) {
    for (const c of [join(v, "packages-ts", pkgShort, "node_modules", name), join(v, "node_modules", name)]) {
      if (existsSync(join(c, "package.json"))) return c;
    }
  }
  return null;
}

function linkInternal(root, p, dep, plan) {
  const dest = join(p.dir, "node_modules", ...dep.name.split("/"));
  const want = relative(dirname(dest), dep.dir);
  if (lexists(dest)) {
    if (!lstatSync(dest).isSymbolicLink()) throw new DepBuildError("LINK_CONFLICT", `${dest} exists and is not a symlink`);
    const have = readlinkSync(dest);
    if (resolve(dirname(dest), have) !== resolve(dep.dir)) throw new DepBuildError("LINK_CONFLICT", `${dest} -> ${have}, expected ${want}`);
    return "kept";
  }
  if (plan) return "would-link";
  ensureDirInside(root, dirname(dest));
  assertWritable(root, dest, "link");
  symlinkSync(want, dest, "dir");
  return "linked";
}

// Copy a vendor module plus the transitive dependencies it declares (flat, first hit wins).
function vendorExternal(root, p, name, vendorRoots, plan, seen, result) {
  if (seen.has(name)) return;
  seen.add(name);
  const dest = join(p.dir, "node_modules", ...name.split("/"));
  let pjDir = null;
  if (existsSync(join(dest, "package.json"))) {
    result.kept.push(name);
    pjDir = dest;
  } else {
    const src = findVendorModule(vendorRoots, p.short, name);
    if (!src) { result.missing.push(name); return; }
    if (plan) { result.wouldCopy.push(name); pjDir = src; } else {
      ensureDirInside(root, dirname(dest));
      assertWritable(root, dest, "vendor copy");
      cpSync(src, dest, { recursive: true, dereference: true, errorOnExist: true, force: false });
      result.copied.push(name);
      pjDir = dest;
    }
  }
  const pj = JSON.parse(readFileSync(join(pjDir, "package.json"), "utf8"));
  for (const d of Object.keys(pj.dependencies || {}).sort()) {
    if (existsSync(join(pjDir, "node_modules", ...d.split("/"), "package.json"))) continue; // nested copy
    vendorExternal(root, p, d, vendorRoots, plan, seen, result);
  }
}

function runTsc(p, opts) {
  if (!p.hasTsconfig) return { status: "no-tsconfig", rc: null };
  const tsDir = join(p.dir, "node_modules", "typescript");
  const tscBin = join(tsDir, "bin", "tsc");
  if (!existsSync(tscBin)) return { status: "no-typescript", rc: null };
  const version = JSON.parse(readFileSync(join(tsDir, "package.json"), "utf8")).version;
  if (opts.expectTypescript && !String(version).startsWith(opts.expectTypescript)) {
    throw new DepBuildError("TS_VERSION", `${p.name} has typescript ${version}, expected ${opts.expectTypescript}*`);
  }
  const r = spawnSync(process.execPath, [tscBin, "-p", "tsconfig.json", "--noCheck"], {
    cwd: p.dir, encoding: "utf8", timeout: opts.timeoutMs,
  });
  const out = ((r.stdout || "") + (r.stderr || "")).trim().split("\n").slice(-5).join("\n");
  return { status: r.status === 0 ? "built" : "failed", rc: r.status, signal: r.signal ?? null, version, tail: out };
}

export function run(opts, log = () => {}) {
  const root = realpathSync(resolve(opts.root ?? process.cwd()));
  const top = spawnSync("git", ["-C", root, "rev-parse", "--show-toplevel"], { encoding: "utf8" });
  if (top.status !== 0 || realpathSync(top.stdout.trim()) !== root) {
    throw new DepBuildError("NOT_CLONE_ROOT", `${root} is not a git top level`);
  }
  const vendorRoots = opts.vendorFrom.map((v) => realpathSync(resolve(v)));
  for (const v of vendorRoots) {
    if (isInside(v, root) || isInside(root, v)) throw new DepBuildError("VENDOR_OVERLAP", `vendor ${v} overlaps clone ${root}`);
  }
  const pkgs = discoverPackages(root);
  const order = buildOrder(pkgs, opts.targets);
  const report = { tool: "clean-clone-dep-build", root, targets: opts.targets, plan: opts.plan, ok: true, packages: [] };
  for (const name of order) {
    const p = pkgs.get(name);
    const entry = { name, dir: relative(root, p.dir), links: [], vendor: { copied: [], kept: [], missing: [], wouldCopy: [] }, tsc: null, main: null };
    for (const dep of p.internal) entry.links.push({ dep: dep.name, action: linkInternal(root, p, pkgs.get(dep.name), opts.plan) });
    const seen = new Set();
    for (const ext of p.external) vendorExternal(root, p, ext.name, vendorRoots, opts.plan, seen, entry.vendor);
    if (!opts.plan && opts.tsc) {
      entry.tsc = runTsc(p, opts);
      if (entry.tsc.status === "failed") report.ok = false;
    }
    if (p.main) {
      entry.main = { path: p.main, present: existsSync(join(p.dir, p.main)) };
      if (!opts.plan && opts.tsc && p.hasTsconfig && !entry.main.present) report.ok = false;
    }
    log(`${name}: links=${entry.links.length} copied=${entry.vendor.copied.length} missing=${entry.vendor.missing.join(",") || "-"} tsc=${entry.tsc ? entry.tsc.status : "skipped"} main=${entry.main ? entry.main.present : "n/a"}`);
    report.packages.push(entry);
  }
  return report;
}

function isMain() {
  try { return process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
}

if (isMain()) {
  let code = 0;
  try {
    const opts = parseArgs(process.argv.slice(2));
    const report = run(opts, (line) => console.log(line));
    if (opts.json) writeFileSync(opts.json, JSON.stringify(report, null, 2) + "\n");
    console.log(report.ok ? "DEP_BUILD_OK" : "DEP_BUILD_FAILED");
    code = report.ok ? 0 : 1;
  } catch (e) {
    console.error(e instanceof DepBuildError ? `DEP_BUILD_REFUSED ${e.message}` : e.stack);
    code = e instanceof DepBuildError ? 2 : 1;
  }
  process.exit(code);
}
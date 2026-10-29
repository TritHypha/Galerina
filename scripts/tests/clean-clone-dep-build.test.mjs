// Synthetic tests for scripts/clean-clone-dep-build.mjs (no network, no real packages).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parseArgs, isInside, buildOrder, discoverPackages, ensureDirInside, assertWritable,
  findVendorModule, DepBuildError, DEFAULT_TARGET,
} from "../clean-clone-dep-build.mjs";

function fakeRepo(pkgs) {
  const root = mkdtempSync(join(tmpdir(), "ccdb-"));
  for (const [dir, pj] of Object.entries(pkgs)) {
    mkdirSync(join(root, "packages-ts", dir), { recursive: true });
    writeFileSync(join(root, "packages-ts", dir, "package.json"), JSON.stringify(pj));
  }
  return root;
}
const codeOf = (fn) => { try { fn(); } catch (e) { return e instanceof DepBuildError ? e.code : "OTHER"; } return "NONE"; };

test("CCDB-01 parseArgs defaults to core-compiler and rejects unscoped targets", () => {
  assert.deepEqual(parseArgs([]).targets, [DEFAULT_TARGET]);
  assert.equal(codeOf(() => parseArgs(["--target", "left-pad"])), "ARG");
  assert.equal(codeOf(() => parseArgs(["--target", "@galerina/"])), "ARG");
  assert.equal(codeOf(() => parseArgs(["--timeout-ms", "0"])), "ARG");
  assert.equal(codeOf(() => parseArgs(["--timeout-ms", "-5"])), "ARG");
  assert.equal(codeOf(() => parseArgs(["--root"])), "ARG");
  assert.equal(codeOf(() => parseArgs(["--bogus"])), "ARG");
});

test("CCDB-02 isInside is lexical and refuses parent escapes", () => {
  assert.equal(isInside("/a/b", "/a/b"), true);
  assert.equal(isInside("/a/b", "/a/b/c"), true);
  assert.equal(isInside("/a/b", "/a/bc"), false);
  assert.equal(isInside("/a/b", "/a"), false);
  assert.equal(isInside("/a/b", "/a/b/../c"), false);
});

test("CCDB-03 buildOrder puts dependencies first and is a closure of the target", () => {
  const root = fakeRepo({
    a: { name: "@galerina/a", dependencies: { "@galerina/b": "file:../b", "@galerina/c": "file:../c" } },
    b: { name: "@galerina/b", dependencies: { "@galerina/c": "file:../c" } },
    c: { name: "@galerina/c" },
    z: { name: "@galerina/z" },
    other: { name: "not-galerina" },
  });
  try {
    const pkgs = discoverPackages(root);
    assert.equal(pkgs.has("not-galerina"), false);
    assert.deepEqual(buildOrder(pkgs, ["@galerina/a"]), ["@galerina/c", "@galerina/b", "@galerina/a"]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("CCDB-04 buildOrder fails closed on cycle, unknown dep and spec mismatch", () => {
  const cyc = fakeRepo({
    a: { name: "@galerina/a", dependencies: { "@galerina/b": "*" } },
    b: { name: "@galerina/b", dependencies: { "@galerina/a": "*" } },
  });
  const unk = fakeRepo({ a: { name: "@galerina/a", dependencies: { "@galerina/ghost": "*" } } });
  const mis = fakeRepo({
    a: { name: "@galerina/a", dependencies: { "@galerina/b": "file:../c" } },
    b: { name: "@galerina/b" },
    c: { name: "@galerina/c" },
  });
  try {
    assert.equal(codeOf(() => buildOrder(discoverPackages(cyc), ["@galerina/a"])), "CYCLE");
    assert.equal(codeOf(() => buildOrder(discoverPackages(unk), ["@galerina/a"])), "UNKNOWN_DEP");
    assert.equal(codeOf(() => buildOrder(discoverPackages(mis), ["@galerina/a"])), "SPEC_MISMATCH");
    assert.equal(codeOf(() => buildOrder(discoverPackages(unk), ["@galerina/missing"])), "UNKNOWN_DEP");
  } finally { for (const r of [cyc, unk, mis]) rmSync(r, { recursive: true, force: true }); }
});

test("CCDB-05 duplicate package names are refused", () => {
  const dup = fakeRepo({ a: { name: "@galerina/a" }, a2: { name: "@galerina/a" } });
  try { assert.equal(codeOf(() => discoverPackages(dup)), "DUPLICATE"); }
  finally { rmSync(dup, { recursive: true, force: true }); }
  const empty = mkdtempSync(join(tmpdir(), "ccdb-empty-"));
  try { assert.equal(codeOf(() => discoverPackages(empty)), "NO_PACKAGES"); }
  finally { rmSync(empty, { recursive: true, force: true }); }
});

test("CCDB-06 writes never pass through a symlinked parent or leave the root", () => {
  const root = mkdtempSync(join(tmpdir(), "ccdb-root-"));
  const outside = mkdtempSync(join(tmpdir(), "ccdb-out-"));
  try {
    symlinkSync(outside, join(root, "escape"), "dir");
    assert.equal(codeOf(() => ensureDirInside(root, join(root, "escape", "node_modules"))), "SYMLINK_PARENT");
    assert.equal(existsSync(join(outside, "node_modules")), false);
    assert.equal(codeOf(() => assertWritable(root, join(root, "escape", "x"), "link")), "OUTSIDE_ROOT");
    assert.equal(codeOf(() => ensureDirInside(root, join(root, "..", "sibling"))), "OUTSIDE_ROOT");
    ensureDirInside(root, join(root, "ok", "deep"));
    assert.equal(existsSync(join(root, "ok", "deep")), true);
    assert.equal(codeOf(() => assertWritable(root, join(root, "ok", "deep", "f"), "copy")), "NONE");
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test("CCDB-07 vendor lookup prefers the package-local copy, then the root", () => {
  const v = mkdtempSync(join(tmpdir(), "ccdb-vendor-"));
  try {
    mkdirSync(join(v, "node_modules", "typescript"), { recursive: true });
    writeFileSync(join(v, "node_modules", "typescript", "package.json"), "{}");
    assert.equal(findVendorModule([v], "pkg", "typescript"), join(v, "node_modules", "typescript"));
    mkdirSync(join(v, "packages-ts", "pkg", "node_modules", "typescript"), { recursive: true });
    writeFileSync(join(v, "packages-ts", "pkg", "node_modules", "typescript", "package.json"), "{}");
    assert.equal(findVendorModule([v], "pkg", "typescript"), join(v, "packages-ts", "pkg", "node_modules", "typescript"));
    assert.equal(findVendorModule([v], "pkg", "absent"), null);
  } finally { rmSync(v, { recursive: true, force: true }); }
});
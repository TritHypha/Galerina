import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildFlatPackageRootLock,
  parseStrictJsonObject,
  resolveFlatPackagePeer,
  verifyFlatPackageRootLock,
} from "../lib/flat-package-root-lock.mjs";

const sha = (digit) => digit.repeat(64);

function packageRecord(identity, directory, dependencies = [], contentDigest = sha("1")) {
  return {
    identity,
    version: "1.0.0",
    directory,
    contentDigest,
    manifestDigests: [{ path: "package.json", digest: sha("2") }],
    dependencies,
  };
}

test("builds one deterministic flat lock and resolves only an exact peer edge", () => {
  const records = [
    packageRecord("@galerina/app", "app", [
      { identity: "@galerina/core", scope: "runtime", specifier: "file:../core" },
      { identity: "typescript", scope: "development", specifier: "^5.5.0" },
    ], sha("3")),
    packageRecord("@galerina/core", "core"),
  ];

  const first = buildFlatPackageRootLock(records);
  const second = buildFlatPackageRootLock([...records].reverse());
  assert.deepEqual(first, second);
  assert.deepEqual(first.topologicalOrder, ["@galerina/core", "@galerina/app"]);
  assert.equal(first.authorityReleased, false);
  assert.equal(first.externalBootstrapDependencies.length, 1);

  const verified = verifyFlatPackageRootLock(first);
  assert.equal(
    resolveFlatPackagePeer(verified, "@galerina/app", "@galerina/core").directory,
    "core",
  );
  assert.throws(
    () => resolveFlatPackagePeer(verified, "@galerina/core", "@galerina/app"),
    /undeclared peer dependency/,
  );
  assert.throws(
    () => resolveFlatPackagePeer(structuredClone(verified), "@galerina/app", "@galerina/core"),
    /verified flat package lock handle/,
  );
});

test("content identity is part of the root identity", () => {
  const before = buildFlatPackageRootLock([packageRecord("@galerina/core", "core")]);
  const after = buildFlatPackageRootLock([
    packageRecord("@galerina/core", "core", [], sha("4")),
  ]);
  assert.notEqual(before.rootDigest, after.rootDigest);
});

test("refuses duplicate, missing, escaping, shadowed and cyclic internal graphs", () => {
  const core = packageRecord("@galerina/core", "core");
  assert.throws(() => buildFlatPackageRootLock([core, core]), /duplicate package identity/);

  assert.throws(
    () => buildFlatPackageRootLock([
      packageRecord("@galerina/app", "app", [
        { identity: "@galerina/missing", scope: "runtime", specifier: "file:../missing" },
      ]),
    ]),
    /missing internal package/,
  );

  assert.throws(
    () => buildFlatPackageRootLock([
      core,
      packageRecord("@galerina/app", "app", [
        { identity: "@galerina/core", scope: "runtime", specifier: "file:../../core" },
      ]),
    ]),
    /canonical direct peer/,
  );

  assert.throws(
    () => buildFlatPackageRootLock([
      packageRecord("@galerina/a", "same"),
      packageRecord("@galerina/b", "same"),
    ]),
    /duplicate package directory/,
  );

  assert.throws(
    () => buildFlatPackageRootLock([
      packageRecord("@galerina/a", "a", [
        { identity: "@galerina/b", scope: "runtime", specifier: "file:../b" },
      ]),
      packageRecord("@galerina/b", "b", [
        { identity: "@galerina/a", scope: "runtime", specifier: "file:../a" },
      ]),
    ]),
    /dependency cycle/,
  );

  assert.throws(
    () => buildFlatPackageRootLock([
      core,
      packageRecord("@galerina/app", "app", [
        { identity: "@galerina/core", scope: "runtime", specifier: "file:../core" },
        { identity: "@galerina/core", scope: "peer", specifier: "file:../core" },
      ]),
    ]),
    /repeats dependency/,
  );
});

test("refuses conflicting runtime bootstrap versions but records development drift", () => {
  assert.throws(
    () => buildFlatPackageRootLock([
      packageRecord("@galerina/a", "a", [
        { identity: "external", scope: "runtime", specifier: "1" },
      ]),
      packageRecord("@galerina/b", "b", [
        { identity: "external", scope: "runtime", specifier: "2" },
      ]),
    ]),
    /conflicting external runtime dependency/,
  );

  const lock = buildFlatPackageRootLock([
    packageRecord("@galerina/a", "a", [
      { identity: "typescript", scope: "development", specifier: "5.5" },
    ]),
    packageRecord("@galerina/b", "b", [
      { identity: "typescript", scope: "development", specifier: "5.9" },
    ]),
  ]);
  assert.deepEqual(lock.developmentVersionDrift, [
    { identity: "typescript", specifiers: ["5.5", "5.9"] },
  ]);
});

test("verification refuses a copied or recomputed-root forged lock", () => {
  const lock = buildFlatPackageRootLock([packageRecord("@galerina/core", "core")]);
  assert.throws(
    () => verifyFlatPackageRootLock({ ...lock, authorityReleased: true }),
    /authority or schema/,
  );
  const verified = verifyFlatPackageRootLock(lock);
  assert.throws(
    () => resolveFlatPackagePeer({ ...verified }, "@galerina/core", "@galerina/core"),
    /verified flat package lock handle/,
  );
});

test("strict JSON intake refuses decoded duplicate keys and a BOM", () => {
  assert.throws(
    () => parseStrictJsonObject('{"name":"first","na\\u006de":"second"}', "manifest"),
    /repeats decoded key/,
  );
  assert.throws(() => parseStrictJsonObject('\uFEFF{"name":"x"}', "manifest"), /canonical UTF-8/);
  assert.deepEqual(parseStrictJsonObject('{"name":"x"}', "manifest"), { name: "x" });
});

// Real collector controls are part of the existing focused gate, not a separate discovery route.
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { collectFlatPackageRecords, deriveCurrentFlatPackageRootLock } from "../flat-package-root-lock.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const recovery = process.env.ROOT_LOCK_TEST_ROOT || join(homedir(), ".galerina-recovery", "root-lock-tests");
assert.ok(isAbsolute(recovery), "durable ROOT_LOCK_TEST_ROOT must be absolute");
assert.ok(!/[/\\](?:AppData|Temp|tmp)[/\\]/i.test(recovery), "no ambient temporary directory");
fs.mkdirSync(recovery, { recursive: true });
const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.toUpperCase().startsWith("GIT_")));
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
function git(root, args, input) {
  const r = spawnSync("git", ["--no-optional-locks", "-C", root, ...args], {
    env: { ...cleanEnv, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null" },
    input, timeout: 10000, maxBuffer: 1048576, windowsHide: true,
  });
  assert.equal(r.error, undefined, r.error?.message);
  assert.equal(r.signal, null);
  assert.equal(r.status, 0, r.stderr?.toString());
  return r.stdout;
}
function put(root, path, bytes) {
  const target = resolve(root, path);
  assert.ok(!relative(root, target).startsWith(".."));
  fs.mkdirSync(dirname(target), { recursive: true });
  fs.writeFileSync(target, bytes);
}
const manifest = '{"name":"@galerina/a","version":"1"}\n';
function fixture() {
  const root = fs.mkdtempSync(join(recovery, "root-lock-"));
  git(root, ["init", "-q"]);
  git(root, ["config", "core.autocrlf", "false"]);
  put(root, ".gitattributes", "* text=auto\n*.bin -text\n");
  put(root, "packages-ts/a/package.json", manifest);
  put(root, "packages-ts/a/a.txt", "abc\ndef\n");
  put(root, "packages-ts/a/Z.txt", "upper\n");
  put(root, "packages-ts/a/B.txt", "first\n");
  put(root, "packages-ts/a/x.bin", Buffer.from([0, 13, 10, 255]));
  git(root, ["add", "--", ".gitattributes", "packages-ts"]);
  return root; // retained fixture evidence, never remove a shared checkout
}
function contentHash(files) {
  // Independent framing, literal fixture contents, no production helpers.
  const chunks = [Buffer.from("galerina.flat-package.content.v1\0")];
  for (const [path, bytes] of files) {
    const name = Buffer.from(path);
    const lengths = Buffer.alloc(12);
    lengths.writeUInt32BE(name.length);
    lengths.writeBigUInt64BE(BigInt(bytes.length), 4);
    chunks.push(lengths.subarray(0, 4), name, lengths.subarray(4), bytes);
  }
  return hash(Buffer.concat(chunks));
}
test("canonical staged blobs and ordinal path order match independent framing", () => {
  const root = fixture();
  const before = collectFlatPackageRecords(root);
  const expected = contentHash([
    ["B.txt", Buffer.from("first\n")], ["Z.txt", Buffer.from("upper\n")],
    ["a.txt", Buffer.from("abc\ndef\n")], ["package.json", Buffer.from(manifest)],
    ["x.bin", Buffer.from([0, 13, 10, 255])],
  ]);
  assert.equal(before[0].contentDigest, expected);
  assert.equal(before[0].manifestDigests[0].digest, hash(manifest));
});
test("LF and whole-CRLF working twins retain one canonical identity", () => {
  const root = fixture();
  const before = collectFlatPackageRecords(root);
  for (const path of ["a.txt", "B.txt", "Z.txt", "package.json"]) {
    const p = join(root, "packages-ts/a", path);
    fs.writeFileSync(p, fs.readFileSync(p, "utf8").replaceAll("\n", "\r\n"));
  }
  assert.deepEqual(collectFlatPackageRecords(root), before);
});
test("dirty same-size same-mtime bytes refuse; staging that intent changes identity", () => {
  const root = fixture(), path = join(root, "packages-ts/a/a.txt");
  const before = deriveCurrentFlatPackageRootLock(root);
  const stat = fs.statSync(path);
  fs.writeFileSync(path, "xyz\ndef\n");
  fs.utimesSync(path, stat.atime, stat.mtime);
  assert.throws(() => collectFlatPackageRecords(root), /REFUSED:.*(?:projection|worktree)/);
  // Deliberately admit the new blob; git add may trust its same-size/mtime
  // stat cache on a fast filesystem, which is precisely not our evidence.
  const oid = git(root, ["hash-object", "-w", "--stdin"], Buffer.from("xyz\ndef\n")).toString().trim();
  git(root, ["update-index", "--cacheinfo", "100644," + oid + ",packages-ts/a/a.txt"]);
  assert.notEqual(deriveCurrentFlatPackageRootLock(root).rootDigest, before.rootDigest);
});
test("mixed EOL, lone CR and binary mutation cannot be normalized into clean", () => {
  const root = fixture(), p = join(root, "packages-ts/a/a.txt");
  for (const bad of ["abc\r\ndef\n", "abc\rdef\n"]) {
    fs.writeFileSync(p, bad);
    assert.throws(() => collectFlatPackageRecords(root), /REFUSED:.*(?:projection|worktree)/);
  }
  fs.writeFileSync(p, "abc\ndef\n");
  fs.writeFileSync(join(root, "packages-ts/a/x.bin"), Buffer.from([0, 10, 255]));
  assert.throws(() => collectFlatPackageRecords(root), /REFUSED:.*(?:projection|worktree)/);
});
for (const attr of ["filter=untrusted", "working-tree-encoding=UTF-16", "ident"]) {
  test("unsupported attribute refuses without invoking conversion: " + attr, () => {
    const root = fixture();
    put(root, ".gitattributes", "* text=auto\n*.bin -text\na.txt " + attr + "\n");
    git(root, ["add", "--", ".gitattributes"]);
    assert.throws(() => collectFlatPackageRecords(root), /REFUSED:.*attribute/);
  });
}
test("unstaged and untracked nested attributes refuse; explicit LF forbids CRLF", () => {
  const root = fixture();
  put(root, "packages-ts/a/.gitattributes", "*.txt text eol=lf\n");
  assert.throws(() => collectFlatPackageRecords(root), /REFUSED:.*attribute/);
  git(root, ["add", "--", "packages-ts/a/.gitattributes"]);
  collectFlatPackageRecords(root);
  put(root, "packages-ts/a/a.txt", "abc\r\ndef\r\n");
  assert.throws(() => collectFlatPackageRecords(root), /REFUSED:.*(?:projection|worktree)/);
});
test("missing file and missing whole peer refuse, rather than dropping coverage", () => {
  const root = fixture();
  fs.unlinkSync(join(root, "packages-ts/a/a.txt"));
  assert.throws(() => collectFlatPackageRecords(root), /REFUSED:|ENOENT/);
  put(root, "packages-ts/a/a.txt", "abc\ndef\n");
  fs.renameSync(join(root, "packages-ts/a"), join(root, "saved-a"));
  assert.throws(() => collectFlatPackageRecords(root), /REFUSED:.*(?:peer|inventory)/);
});
test("a symlinked direct peer is refused, not skipped by Dirent filtering", () => {
  const root = fixture();
  fs.renameSync(join(root, "packages-ts/a"), join(root, "saved-a"));
  fs.symlinkSync(join(root, "saved-a"), join(root, "packages-ts/a"), process.platform === "win32" ? "junction" : "dir");
  assert.throws(() => collectFlatPackageRecords(root), /REFUSED:.*(?:symlink|redirect|peer)/);
});
test("unmerged stages, gitlink and symlink modes are refused before source use", () => {
  for (const kind of ["unmerged", "gitlink", "symlink"]) {
    const root = fixture();
    const oid = git(root, ["rev-parse", ":packages-ts/a/a.txt"]).toString().trim();
    if (kind === "unmerged") {
      git(root, ["update-index", "--index-info"], Buffer.from("0 " + "0".repeat(40) + "\tpackages-ts/a/a.txt\n100644 " + oid + " 1\tpackages-ts/a/a.txt\n"));
    } else {
      git(root, ["update-index", "--cacheinfo", (kind === "gitlink" ? "160000" : "120000") + "," + oid + ",packages-ts/a/a.txt"]);
    }
    assert.throws(() => collectFlatPackageRecords(root), /REFUSED:.*(?:stage|mode|gitlink)/);
  }
});
test("Git path case collisions refuse instead of selecting a filesystem alias", () => {
  const root = fixture();
  const oid = git(root, ["rev-parse", ":packages-ts/a/a.txt"]).toString().trim();
  git(root, ["update-index", "--add", "--cacheinfo", "100644," + oid + ",packages-ts/a/PACKAGE.json"]);
  assert.throws(() => collectFlatPackageRecords(root), /REFUSED:.*(?:collision|path)/);
});
test("invalid portable path, missing blob and non-blob index objects refuse", () => {
  for (const kind of ["path", "missing", "tree"]) {
    const root = fixture();
    let oid = git(root, ["rev-parse", ":packages-ts/a/a.txt"]).toString().trim();
    if (kind === "missing") oid = "1".repeat(40);
    if (kind === "tree") oid = git(root, ["write-tree"]).toString().trim();
    const path = kind === "path" ? "packages-ts/a/bad:stream" : "packages-ts/a/a.txt";
    git(root, ["-c", "core.protectNTFS=false", "update-index", "--add", "--cacheinfo", "100644," + oid + "," + path]);
    assert.throws(() => collectFlatPackageRecords(root), /REFUSED:.*(?:path|blob|Git ls-files)/);
  }
});
test("case-colliding ancestor directories refuse even with distinct leaf names", () => {
  const root = fixture();
  put(root, "packages-ts/a/D/one.txt", "one\n");
  put(root, "packages-ts/a/D/two.txt", "two\n");
  git(root, ["add", "--", "packages-ts/a/D"]);
  const oid = git(root, ["rev-parse", ":packages-ts/a/D/two.txt"]).toString().trim();
  git(root, ["update-index", "--force-remove", "--", "packages-ts/a/D/two.txt"]);
  git(root, ["update-index", "--add", "--cacheinfo", "100644," + oid + ",packages-ts/a/d/two.txt"]);
  assert.throws(() => collectFlatPackageRecords(root), /REFUSED:.*(?:collision|redirect)/);
});
test("inherited Git authority cannot redirect the actual collector", () => {
  const root = fixture(), other = fixture();
  const expected = collectFlatPackageRecords(root);
  const prior = { GIT_DIR: process.env.GIT_DIR, GIT_WORK_TREE: process.env.GIT_WORK_TREE, GIT_INDEX_FILE: process.env.GIT_INDEX_FILE };
  try {
    process.env.GIT_DIR = join(other, ".git");
    process.env.GIT_WORK_TREE = other;
    process.env.GIT_INDEX_FILE = join(other, "missing-index");
    assert.deepEqual(collectFlatPackageRecords(root), expected);
  } finally {
    for (const [key, value] of Object.entries(prior)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
function duringRead(trigger, effect, action) {
  const original = fs.readFileSync;
  let fired = false;
  fs.readFileSync = function(path, ...args) {
    const bytes = original.call(this, path, ...args);
    if (!fired && String(path).replaceAll("\\", "/").endsWith(trigger)) {
      fired = true; effect();
    }
    return bytes;
  };
  syncBuiltinESMExports();
  try { action(); assert.equal(fired, true, "real read boundary reached"); }
  finally { fs.readFileSync = original; syncBuiltinESMExports(); }
}
for (const kind of ["index", "attribute", "inventory", "prior-file"]) {
  test("actual collector detects mid-scan " + kind + " drift", () => {
    const root = fixture();
    duringRead("/packages-ts/a/x.bin", () => {
      if (kind === "index") {
        put(root, "packages-ts/a/new.txt", "new\n");
        git(root, ["add", "--", "packages-ts/a/new.txt"]);
      } else if (kind === "attribute") put(root, ".gitattributes", "* -text\n");
      else if (kind === "inventory") put(root, "packages-ts/new/package.json", '{"name":"@galerina/new","version":"1"}\n');
      else put(root, "packages-ts/a/B.txt", "other\n");
    }, () => assert.throws(() => collectFlatPackageRecords(root), /REFUSED:.*(?:changed|drift|inventory|projection|attribute)/));
  });
}
test("permission fault stays refusal, not an index-only clean result", () => {
  const root = fixture(), original = fs.readFileSync;
  fs.readFileSync = function(path, ...args) {
    if (String(path).replaceAll("\\", "/").endsWith("/packages-ts/a/a.txt")) {
      throw Object.assign(new Error("synthetic OS EACCES"), { code: "EACCES" });
    }
    return original.call(this, path, ...args);
  };
  syncBuiltinESMExports();
  try { assert.throws(() => collectFlatPackageRecords(root), /REFUSED:|EACCES/); }
  finally { fs.readFileSync = original; syncBuiltinESMExports(); }
});
test("local Git configuration drift is not hidden by stable package bytes", () => {
  const root = fixture();
  duringRead("/packages-ts/a/x.bin", () => git(root, ["config", "core.autocrlf", "true"]),
    () => assert.throws(() => collectFlatPackageRecords(root), /REFUSED:.*(?:config|binding)/));
});
test("linked checkout pointer swap to an equivalent index refuses", () => {
  const root = fixture();
  // Two gitdirs, one live worktree, byte-identical index. No live git worktree
  // command or inherited fixture authority is needed to reproduce this race.
  const first = join(root, "first.git"), second = join(root, "second.git");
  fs.renameSync(join(root, ".git"), first);
  fs.cpSync(first, second, { recursive: true });
  put(root, ".git", `gitdir: ${first.replaceAll("\\", "/")}\n`);
  collectFlatPackageRecords(root);
  const indexBefore = hash(fs.readFileSync(join(first, "index")));
  duringRead("/packages-ts/a/x.bin", () => put(root, ".git", `gitdir: ${second.replaceAll("\\", "/")}\n`),
    () => assert.throws(() => collectFlatPackageRecords(root), /REFUSED:.*(?:binding|gitdir)/));
  assert.equal(hash(fs.readFileSync(join(first, "index"))), indexBefore);
});
test("actual CLI checks exact LF output and refuses CRLF without rewriting", () => {
  const root = fixture();
  for (const name of ["flat-package-root-lock.mjs", "lib/flat-package-root-lock.mjs", "lib/cli-help.mjs", "lib/flat-package-root-lock-collector.mjs"]) {
    const source = join(repo, "scripts", name);
    if (fs.existsSync(source)) put(root, "scripts/" + name, fs.readFileSync(source));
  }
  const run = mode => spawnSync(process.execPath, [join(root, "scripts/flat-package-root-lock.mjs"), mode, "--json"], {
    cwd: root, env: cleanEnv, timeout: 20000, maxBuffer: 1048576, windowsHide: true,
  });
  fs.mkdirSync(join(root, "governance"));
  const written = run("--write");
  assert.equal(written.status, 0, written.stderr?.toString());
  assert.equal(run("--check").status, 0);
  const path = join(root, "governance/flat-package-root-lock.json");
  const good = fs.readFileSync(path);
  for (const bad of [Buffer.from(good.toString().replaceAll("\n", "\r\n")),
    Buffer.from(good.toString().replace("\n", "\r\n")),
    Buffer.concat([Buffer.from([239, 187, 191]), good]),
    Buffer.from(JSON.stringify(JSON.parse(good)) + "\n")]) {
    fs.writeFileSync(path, bad);
    const refused = run("--check");
    assert.equal(refused.status, 1);
    assert.match(refused.stderr.toString(), /REFUSED:/);
    assert.deepEqual(fs.readFileSync(path), bad);
  }
  fs.writeFileSync(path, good);
  assert.equal(run("--check").status, 0);
});

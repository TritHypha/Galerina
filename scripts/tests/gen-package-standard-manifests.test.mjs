// R4 generator: determinism, value hygiene (no null/NaN/undefined), hostile-input refusal,
// truthful unpinned dependencies, and the lock-drift guard on --write.
// Requires the audit core build: (cd packages-ts/galerina-devtools-package-graph && npm run build)
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  RefusedError,
  canonicalJson,
  fixtureFiles,
  generateAll,
  main,
  makeFixtureRepo,
  parseStrictInput,
} from "../gen-package-standard-manifests.mjs";

const withRepo = async (files, fn) => {
  const root = makeFixtureRepo(files);
  try {
    return await fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
};

test("two runs over the same index are byte-identical and contain no forbidden tokens", async () => {
  await withRepo(fixtureFiles(), (root) => {
    const a = generateAll(root);
    const b = generateAll(root);
    assert.deepEqual(a.packages.map((p) => p.docs), b.packages.map((p) => p.docs));
    for (const p of a.packages) {
      for (const [file, text] of Object.entries(p.docs)) {
        assert.ok(!/\bnull\b|\bNaN\b|\bundefined\b|Infinity/.test(text), `${p.dir}/${file}`);
        assert.ok(text.endsWith("\n") && !text.includes("\r") && text.charCodeAt(0) !== 0xfeff);
        assert.ok(!/"[A-Za-z]:[\\/]|"\/(home|Users|tmp)\//.test(text), "no absolute paths");
      }
    }
  });
});

test("output does not depend on the working tree (index content only)", async () => {
  await withRepo(fixtureFiles(), (root) => {
    const before = generateAll(root).packages.map((p) => p.docs);
    writeFileSync(join(root, "packages-ts/galerina-alpha/src/index.fungi"), "flow alpha() { 2 }\n");
    assert.deepEqual(generateAll(root).packages.map((p) => p.docs), before);
    execFileSync("git", ["-C", root, "add", "-A"]);
    assert.notDeepEqual(generateAll(root).packages.map((p) => p.docs), before);
  });
});

test("canonical writer refuses null, undefined, NaN, Infinity and non-plain objects", () => {
  for (const bad of [{ a: null }, { a: undefined }, { a: Number.NaN }, { a: Infinity }, { a: new Date(0) }, [() => 1]]) {
    assert.throws(() => canonicalJson(bad), RefusedError);
  }
  assert.equal(canonicalJson({ b: 1, a: [true, "x"] }), '{\n  "a": [\n    true,\n    "x"\n  ],\n  "b": 1\n}\n');
});

test("strict input reader refuses duplicate keys, BOM, malformed JSON and non-objects", () => {
  for (const bad of ['{"a":1,"a":2}', '\ufeff{"a":1}', "{", "[]", "null"]) assert.throws(() => parseStrictInput(bad, "x"), RefusedError);
});

test("hostile inputs stop the run: dangling file: dependency, duplicate lock key, missing version", async () => {
  const cases = [
    (f) => { f["packages-ts/galerina-alpha/package.json"] = JSON.stringify({ name: "@galerina/alpha", version: "1.0.0", dependencies: { "@galerina/ghost": "file:../galerina-ghost" } }); },
    (f) => { f["packages-ts/galerina-alpha/package-lock.json"] = '{"lockfileVersion":3,"packages":{"node_modules/leftpad":{"version":"1.0.2"},"node_modules/leftpad":{"version":"6.6.6"}}}'; },
    (f) => { f["packages-ts/galerina-alpha/package.json"] = JSON.stringify({ name: "@galerina/alpha" }); },
    (f) => { f["packages-ts/galerina-alpha/package-lock.json"] = '{"lockfileVersion":1}'; },
    (f) => { f["galerina.workspace.json"] = JSON.stringify({ packages: ["../escape"] }); },
  ];
  for (const mutate of cases) {
    const files = fixtureFiles();
    mutate(files);
    await withRepo(files, (root) => assert.throws(() => generateAll(root), RefusedError));
  }
});

test("a dependency the lockfile does not pin is written truthfully (range, no hash), not hidden", async () => {
  const files = fixtureFiles();
  delete files["packages-ts/galerina-alpha/package-lock.json"];
  await withRepo(files, (root) => {
    const alpha = generateAll(root).packages.find((p) => p.dir === "galerina-alpha");
    const sbom = JSON.parse(alpha.docs["sbom.json"]);
    const leftpad = sbom.components.find((c) => c.name === "leftpad");
    assert.equal(leftpad.version, "^1.0.0");
    assert.deepEqual(leftpad.hashes, []);
    assert.equal(leftpad.licenses[0].expression, "UNKNOWN");
  });
});

test("--write refuses without --accept-lock-drift; --out refuses inside packages-ts", async () => {
  await withRepo(fixtureFiles(), async (root) => {
    await assert.rejects(main(["--root", root, "--write"]), /flat-package-root-lock/);
    await assert.rejects(main(["--root", root, "--out", join(root, "packages-ts", "x")]), /outside packages-ts/);
    assert.ok(!existsSync(join(root, "packages-ts/galerina-alpha/galerina-package.json")));
  });
});

test("--check is RED (FUNGI-PKGSTD-014) when documents are absent and green after --write", async () => {
  await withRepo(fixtureFiles(), async (root) => {
    const red = await main(["--root", root, "--check", "--json"]);
    assert.equal(red.code, 1);
    assert.ok(JSON.parse(red.text).drift.every((d) => d.startsWith("FUNGI-PKGSTD-014")));
    const dry = await main(["--root", root]);
    assert.equal(dry.code, 0);
    assert.ok(!existsSync(join(root, "packages-ts/galerina-alpha/sbom.json")), "dry-run writes nothing");
    const wrote = await main(["--root", root, "--write", "--accept-lock-drift"]);
    assert.equal(wrote.code, 0);
    execFileSync("git", ["-C", root, "add", "-A"]);
    const green = await main(["--root", root, "--check"]);
    assert.equal(green.code, 0, green.text);
    const manifest = readFileSync(join(root, "packages-ts/galerina-alpha/galerina-package.json"), "utf8");
    assert.match(manifest, /"status": "UNSIGNED"/);
    assert.match(manifest, /"status": "NO_WASM_ARTIFACT"/);
  });
});

test("self-test passes", async () => {
  const r = await main(["--self-test"]);
  assert.equal(r.code, 0);
  assert.match(r.text, /self-test PASS/);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  existsSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { scanPackage, buildGraph, runBoundaryGate } from "../dist/index.js";

const CLI = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const COMPILER_ROOT = join(REPO_ROOT, "packages-ts", "galerina-core-compiler");

// Build a throwaway fixture package on disk.
function makeFixture(files, pkgName = "@galerina/fixture") {
  const root = mkdtempSync(join(tmpdir(), "pkg-graph-"));
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: pkgName }));
  for (const [rel, content] of Object.entries(files)) {
    const full = join(root, rel);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content);
  }
  return root;
}

test("scanner classifies internal / node_core / workspace / thirdparty imports", () => {
  const root = makeFixture({
    "src/index.ts": `import { a } from "./a.js";\nimport { readFileSync } from "node:fs";\nimport { x } from "@galerina/other";\nimport axios from "axios";`,
    "src/a.ts": `export const a = 1;`,
  });
  const scan = scanPackage(root);
  const idx = scan.files.find(f => f.path === "src/index.ts");
  const kinds = idx.imports.map(i => `${i.specifier}:${i.kind}`).sort();
  assert.deepEqual(kinds, [
    "./a.js:internal",
    "@galerina/other:workspace",
    "axios:thirdparty",
    "node:fs:node_core",
  ]);
  rmSync(root, { recursive: true, force: true });
});

test("graph resolves internal edges and external surface", () => {
  const root = makeFixture({
    "src/index.ts": `import { a } from "./a.js";\nimport { readFileSync } from "node:fs";`,
    "src/a.ts": `export const a = 1;`,
  });
  const graph = buildGraph(scanPackage(root));
  assert.equal(graph.stats.fileCount, 2);
  assert.equal(graph.stats.internalEdgeCount, 1); // index -> a
  assert.equal(graph.stats.nodeCoreCount, 1);     // node:fs
  assert.equal(graph.stats.thirdpartyCount, 0);
  rmSync(root, { recursive: true, force: true });
});

test("orphan detection flags unreferenced non-entry files", () => {
  const root = makeFixture({
    "src/index.ts": `export const main = 1;`,
    "src/used.ts": `export const u = 1;`,
    "src/orphan.ts": `export const o = 1;`, // imported by nobody
    "src/consumer.ts": `import { u } from "./used.js";`, // also an orphan (nothing imports it)
  });
  const graph = buildGraph(scanPackage(root));
  // index.ts is an entry point (never orphan). used.ts is imported. orphan.ts + consumer.ts are orphans.
  assert.ok(graph.orphans.includes("src/orphan.ts"));
  assert.ok(graph.orphans.includes("src/consumer.ts"));
  assert.ok(!graph.orphans.includes("src/index.ts"));
  assert.ok(!graph.orphans.includes("src/used.ts"));
  rmSync(root, { recursive: true, force: true });
});

test("boundary gate: an undeclared specifier remains a violation after an exact sibling is allowed", () => {
  const root = makeFixture({
    "src/index.ts": `import { x } from "@galerina/tower-citizen/governance";\n`,
  });
  runBoundaryGate(root, buildGraph(scanPackage(root)), false);
  const policyPath = join(root, ".graph", "boundary-policy.json");
  writeFileSync(policyPath, JSON.stringify({
    packageName: "@galerina/fixture",
    allowedExternal: ["@galerina/tower-citizen/governance"],
  }));
  const admitted = runBoundaryGate(root, buildGraph(scanPackage(root)), true);
  assert.equal(admitted.status, "PASS");

  writeFileSync(join(root, "src", "index.ts"), `import { x } from "@galerina/tower-citizen";\n`);
  const barrel = runBoundaryGate(root, buildGraph(scanPackage(root)), true);
  assert.equal(barrel.status, "FAIL");
  assert.ok(barrel.violations.includes("@galerina/tower-citizen"));
  rmSync(root, { recursive: true, force: true });
});

test("boundary gate: an unexplained orphan is a blocking --check violation", () => {
  const root = makeFixture({
    "src/index.ts": `export const main = 1;`,
    "src/unowned.fungi": `pure flow unowned() -> Int { return 1 }`,
  });
  runBoundaryGate(root, buildGraph(scanPackage(root)), false);

  const result = runBoundaryGate(root, buildGraph(scanPackage(root)), true);

  assert.equal(result.status, "FAIL");
  assert.ok(result.violations.includes("orphan:src/unowned.fungi"));
  rmSync(root, { recursive: true, force: true });
});

test("declared loaded assets are exact owned nodes, not unexplained orphans", () => {
  const root = makeFixture({
    "package.json": JSON.stringify({
      name: "@galerina/fixture",
      packageGraph: { loadedAssets: ["src/self-hosted/stage.fungi"] },
    }),
    "src/index.ts": `export const main = 1;`,
    "src/self-hosted/stage.fungi": `pure flow stage() -> Int { return 1 }`,
  });

  const graph = buildGraph(scanPackage(root));

  assert.deepEqual(graph.loadedAssets, ["src/self-hosted/stage.fungi"]);
  assert.deepEqual(graph.orphans, []);
  rmSync(root, { recursive: true, force: true });
});

test("explicit entry points replace broad main/server/App filename inference", () => {
  const root = makeFixture({
    "package.json": JSON.stringify({
      name: "@galerina/fixture",
      packageGraph: { entryPoints: ["src/worker.ts"] },
    }),
    "src/index.ts": `export const index = 1;`,
    "src/worker.ts": `export const worker = 1;`,
    "src/main.ts": `export const main = 1;`,
    "src/App.fungi": `pure flow app() -> Int { return 1 }`,
  });

  const graph = buildGraph(scanPackage(root));

  assert.deepEqual(graph.entryPoints, ["src/index.ts", "src/worker.ts"]);
  assert.deepEqual(graph.orphans, ["src/App.fungi", "src/main.ts"]);
  rmSync(root, { recursive: true, force: true });
});

test("a named allowOrphans entry suppresses only its exact justified path", () => {
  const root = makeFixture({
    "package.json": JSON.stringify({
      name: "@galerina/fixture",
      packageGraph: {
        allowOrphans: [{
          path: "src/direct-subpath.ts",
          reason: "Compiled public subpath imported directly by a separate consumer.",
        }],
      },
    }),
    "src/index.ts": `export const index = 1;`,
    "src/direct-subpath.ts": `export const direct = 1;`,
    "src/unexplained.ts": `export const unexplained = 1;`,
  });

  const graph = buildGraph(scanPackage(root));

  assert.deepEqual(graph.allowedOrphans, [{
    path: "src/direct-subpath.ts",
    reason: "Compiled public subpath imported directly by a separate consumer.",
  }]);
  assert.deepEqual(graph.orphans, ["src/unexplained.ts"]);
  rmSync(root, { recursive: true, force: true });
});

test("productAssets record foreign fungi products without ../ loadedAssets", () => {
  const workspace = mkdtempSync(join(tmpdir(), "pkg-graph-ws-"));
  writeFileSync(join(workspace, "galerina.workspace.json"), "{}\n");
  const tree = join(workspace, "packages", "fungi", "products", "galerina", "rd-fixture");
  mkdirSync(tree, { recursive: true });
  writeFileSync(join(tree, "stage.fungi"), "pure flow stage() -> Int { return 1 }\n");
  const root = join(workspace, "packages-ts", "fixture");
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "package.json"), JSON.stringify({
    name: "@galerina/fixture",
    packageGraph: {
      productAssets: [{
        tree: "packages/fungi/products/galerina/rd-fixture",
        path: "stage.fungi",
      }],
    },
  }));
  writeFileSync(join(root, "src", "index.ts"), "export const main = 1;\n");
  try {
    const graph = buildGraph(scanPackage(root));
    assert.deepEqual(graph.productAssets, [{
      tree: "packages/fungi/products/galerina/rd-fixture",
      path: "stage.fungi",
    }]);
    assert.deepEqual(graph.loadedAssets, []);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test("productAssets refuse .., missing files, and in-package paths; loadedAssets still refuse ../", () => {
  const workspace = mkdtempSync(join(tmpdir(), "pkg-graph-ws-"));
  writeFileSync(join(workspace, "galerina.workspace.json"), "{}\n");
  const tree = join(workspace, "packages", "fungi", "products", "galerina", "rd-fixture");
  mkdirSync(tree, { recursive: true });
  writeFileSync(join(tree, "stage.fungi"), "pure flow stage() -> Int { return 1 }\n");
  const root = join(workspace, "packages-ts", "fixture");
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src", "index.ts"), "export const main = 1;\n");
  writeFileSync(join(root, "src", "inside.fungi"), "pure flow inside() -> Int { return 1 }\n");
  const writePkg = (packageGraph) => {
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "@galerina/fixture", packageGraph }));
  };
  try {
    writePkg({ loadedAssets: ["../outside.fungi"] });
    assert.throws(() => scanPackage(root), /loadedAssets.*inside the package/i);

    writePkg({ productAssets: [{ tree: "../escape", path: "stage.fungi" }] });
    assert.throws(() => scanPackage(root), /productAssets\[0\]\.tree/i);

    writePkg({ productAssets: [{ tree: "packages/fungi/products/galerina/rd-fixture", path: "missing.fungi" }] });
    assert.throws(() => scanPackage(root), /does not exist/i);

    writePkg({ productAssets: [{ tree: "packages-ts/fixture/src", path: "inside.fungi" }] });
    assert.throws(() => scanPackage(root), /outside the declaring package/i);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test("declared ownership paths refuse missing, escaping, non-canonical, duplicate, and malformed entries", () => {
  const cases = [
    {
      name: "missing loaded asset",
      packageGraph: { loadedAssets: ["src/missing.fungi"] },
      match: /loadedAssets.*does not exist/i,
    },
    {
      name: "escaping entry point",
      packageGraph: { entryPoints: ["../outside.ts"] },
      match: /entryPoints.*inside the package/i,
    },
    {
      name: "non-canonical loaded asset",
      packageGraph: { loadedAssets: ["src/./stage.fungi"] },
      match: /loadedAssets.*canonical/i,
    },
    {
      name: "duplicate ownership",
      packageGraph: {
        entryPoints: ["src/stage.fungi"],
        loadedAssets: ["src/stage.fungi"],
      },
      match: /declared more than once/i,
    },
    {
      name: "blank allowOrphans reason",
      packageGraph: {
        allowOrphans: [{ path: "src/stage.fungi", reason: "" }],
      },
      match: /allowOrphans.*reason/i,
    },
  ];

  for (const fixture of cases) {
    const root = makeFixture({
      "package.json": JSON.stringify({
        name: "@galerina/fixture",
        packageGraph: fixture.packageGraph,
      }),
      "src/index.ts": `export const index = 1;`,
      "src/stage.fungi": `pure flow stage() -> Int { return 1 }`,
    });
    try {
      assert.throws(
        () => buildGraph(scanPackage(root)),
        fixture.match,
        fixture.name,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("declared ownership must be inside the scanned node set", () => {
  const root = makeFixture({
    "package.json": JSON.stringify({
      name: "@galerina/fixture",
      packageGraph: {
        roots: ["src"],
        extensions: [".ts"],
        loadedAssets: ["src/stage.fungi"],
      },
    }),
    "src/index.ts": `export const index = 1;`,
    "src/stage.fungi": `pure flow stage() -> Int { return 1 }`,
  });

  assert.throws(
    () => buildGraph(scanPackage(root)),
    /loadedAssets.*scanned node set/i,
  );
  rmSync(root, { recursive: true, force: true });
});

test("CLI accepts the documented positional scope and exits one for an unexplained orphan", () => {
  const root = makeFixture({
    "src/index.ts": `export const index = 1;`,
    "src/unexplained.ts": `export const unexplained = 1;`,
  });
  runBoundaryGate(root, buildGraph(scanPackage(root)), false);

  const result = spawnSync(process.execPath, [CLI, root, "--check"], {
    encoding: "utf8",
  });

  assert.equal(result.status, 1);
  assert.match(`${result.stdout}${result.stderr}`, /orphan:src\/unexplained\.ts/);
  rmSync(root, { recursive: true, force: true });
});

test("CLI --check never writes derived graph reports", () => {
  const root = makeFixture({
    "src/index.ts": `export const index = 1;`,
  });
  runBoundaryGate(root, buildGraph(scanPackage(root)), false);
  const jsonPath = join(root, ".graph", "package-graph.json");
  const markdownPath = join(root, ".graph", "BOUNDARY.md");

  const result = spawnSync(process.execPath, [CLI, root, "--check"], {
    encoding: "utf8",
  });

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.equal(existsSync(jsonPath), false);
  assert.equal(existsSync(markdownPath), false);
  assert.match(result.stdout, /Check mode: no files written/);
  rmSync(root, { recursive: true, force: true });
});

test("CLI reports invalid ownership configuration without an internal stack trace", () => {
  const root = makeFixture({
    "package.json": JSON.stringify({
      name: "@galerina/fixture",
      packageGraph: { loadedAssets: ["src/missing.fungi"] },
    }),
    "src/index.ts": `export const index = 1;`,
  });

  const result = spawnSync(process.execPath, [CLI, "--scope", root, "--check"], {
    encoding: "utf8",
  });
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 1);
  assert.match(output, /packageGraph\.loadedAssets.*does not exist/i);
  assert.doesNotMatch(output, /\n\s+at scanPackage/);
  rmSync(root, { recursive: true, force: true });
});

test("compiler package explicitly declares every self-hosted Fungi stage as a loaded asset", () => {
  const pkg = JSON.parse(readFileSync(join(COMPILER_ROOT, "package.json"), "utf8"));
  const actual = readdirSync(join(COMPILER_ROOT, "src", "self-hosted"))
    .filter((name) => name.endsWith(".fungi"))
    .map((name) => `src/self-hosted/${name}`)
    .sort();
  const declared = [...(pkg.packageGraph?.loadedAssets ?? [])].sort();

  assert.deepEqual(declared, actual);
});

test("compiler package has zero unexplained source orphans", () => {
  const graph = buildGraph(scanPackage(COMPILER_ROOT));

  assert.deepEqual(graph.orphans, []);
  assert.ok(graph.allowedOrphans.every((entry) => entry.reason.trim().length > 0));
});

test("comments do not produce phantom imports", () => {
  const root = makeFixture({
    "src/index.ts": `// import axios from "axios";\n/* import lodash from "lodash"; */\nexport const x = 1;`,
  });
  const graph = buildGraph(scanPackage(root));
  assert.equal(graph.stats.thirdpartyCount, 0); // commented-out imports ignored
  rmSync(root, { recursive: true, force: true });
});

test("comment markers inside strings do not hide real imports", () => {
  const root = makeFixture({
    "src/index.ts": `const marker = "//";\nimport "hidden-dep";\nconst block = "/*";\nimport "second-dep";\n`,
  });
  const graph = buildGraph(scanPackage(root));
  const specs = graph.externalDeps.map((d) => d.specifier).sort();
  assert.deepEqual(specs, ["hidden-dep", "second-dep"]);
  rmSync(root, { recursive: true, force: true });
});

test("hostile: a same-line string containing // does not hide the following import", () => {
  const root = makeFixture({
    "src/index.ts": `const s = "foo // bar"; import "same-line-dep";\n`,
  });
  const graph = buildGraph(scanPackage(root));
  const specs = graph.externalDeps.map((d) => d.specifier);
  assert.deepEqual(specs, ["same-line-dep"]);
  rmSync(root, { recursive: true, force: true });
});

test("comment markers inside regex literals do not hide real imports", () => {
  const root = makeFixture({
    "src/index.ts": `const re = /http:\\/\\//;\nimport "regex-hidden-dep";\nexport const x = 1;\n`,
  });
  const graph = buildGraph(scanPackage(root));
  const specs = graph.externalDeps.map((d) => d.specifier).sort();
  assert.deepEqual(specs, ["regex-hidden-dep"]);
  rmSync(root, { recursive: true, force: true });
});

test("code-emitting template literals do not produce phantom imports", () => {
  // A WASM-text / code emitter builds import/export statements as STRINGS. The
  // scanner must not mistake those for the package's own ES import surface.
  const root = makeFixture({
    "src/emitter.ts":
      "export function emit(imp, fn) {\n" +
      "  const lines = [];\n" +
      '  lines.push(`  (import "${imp.module}" "${imp.name}" (func))`);\n' +
      '  lines.push(`  (export "memory" (memory 0))`);\n' +
      '  lines.push(`  (export "${fn.name}" (func $${fn.name}))`);\n' +
      "  return lines.join(String.fromCharCode(10));\n" +
      "}\n" +
      // A genuine side-effect import and dynamic import must still be detected.
      'import "node:fs";\n' +
      'const mod = await import("argon2");\n',
  });
  const graph = buildGraph(scanPackage(root));
  const specs = graph.externalDeps.map((d) => d.specifier).sort();
  // The three WAT-emitter strings (${imp.module}, memory, ${fn.name}) are excluded;
  // the real node:fs side-effect import and dynamic import("argon2") survive.
  assert.deepEqual(specs, ["argon2", "node:fs"]);
  rmSync(root, { recursive: true, force: true });
});

test("boundary gate: generation (no --check) creates a baseline", () => {
  const root = makeFixture({
    "src/index.ts": `import { readFileSync } from "node:fs";`,
  });
  const graph = buildGraph(scanPackage(root));
  const result = runBoundaryGate(root, graph, false); // generation mode establishes the baseline
  assert.equal(result.status, "BASELINE_CREATED");
  assert.ok(existsSync(join(root, ".graph", "boundary-policy.json")));
  rmSync(root, { recursive: true, force: true });
});

test("boundary gate: a MISSING policy under --check FAILS (no delete-to-launder)", () => {
  const root = makeFixture({
    "src/index.ts": `import { readFileSync } from "node:fs";`,
  });
  // Establish the baseline (generation mode).
  runBoundaryGate(root, buildGraph(scanPackage(root)), false);
  // Attacker (or accident) deletes the policy AND adds a forbidden import at the same time.
  rmSync(join(root, ".graph", "boundary-policy.json"), { force: true });
  writeFileSync(join(root, "src", "index.ts"),
    `import { readFileSync } from "node:fs";\nimport axios from "axios";`);
  const result = runBoundaryGate(root, buildGraph(scanPackage(root)), true); // enforce
  // MUST fail — never silently re-baseline a deleted policy (that would re-bless axios green).
  assert.equal(result.status, "FAIL");
  assert.ok(result.violations.some((v) => v.includes("missing")));
  // And it must NOT re-create the policy under --check (no laundering).
  assert.ok(!existsSync(join(root, ".graph", "boundary-policy.json")));
  rmSync(root, { recursive: true, force: true });
});

test("boundary gate: a malformed allowedExternal denies (unknown → deny, not allow-all)", () => {
  const root = makeFixture({
    "src/index.ts": `import { readFileSync } from "node:fs";\nimport axios from "axios";`,
  });
  // Write a policy whose allowedExternal is NOT a string array (corrupt/tampered shape).
  const dir = join(root, ".graph");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "boundary-policy.json"),
    JSON.stringify({ packageName: "@galerina/fixture", allowedExternal: "node:fs,axios" })); // string, not array
  const result = runBoundaryGate(root, buildGraph(scanPackage(root)), true);
  assert.equal(result.status, "FAIL"); // must NOT admit axios via a malformed allowlist
  assert.ok(result.violations.some((v) => v.includes("malformed") || v.includes("allowedExternal")));
  rmSync(root, { recursive: true, force: true });
});

test("boundary gate: new external dep fails --check after baseline", () => {
  const root = makeFixture({
    "src/index.ts": `import { readFileSync } from "node:fs";`,
  });
  // First run — baseline (generation) with only node:fs
  runBoundaryGate(root, buildGraph(scanPackage(root)), false);

  // Now add a forbidden third-party import
  writeFileSync(join(root, "src", "index.ts"),
    `import { readFileSync } from "node:fs";\nimport axios from "axios";`);
  const graph2 = buildGraph(scanPackage(root));
  const result = runBoundaryGate(root, graph2, true);

  assert.equal(result.status, "FAIL");
  assert.ok(result.violations.includes("axios"));
  rmSync(root, { recursive: true, force: true });
});

test("boundary gate: dep already in allowlist passes", () => {
  const root = makeFixture({
    "src/index.ts": `import { readFileSync } from "node:fs";`,
  });
  runBoundaryGate(root, buildGraph(scanPackage(root)), false); // baseline (generation) includes node:fs
  // Re-run --check with the same imports — should PASS
  const result = runBoundaryGate(root, buildGraph(scanPackage(root)), true);
  assert.equal(result.status, "PASS");
  assert.equal(result.violations.length, 0);
  rmSync(root, { recursive: true, force: true });
});

// ── Scope coverage: host/ root + .fungi source (the example-app blind spot) ──────────────

test("scans host/ root AND .fungi source — not just src/*.ts", () => {
  // Mirrors the framework example app: governed flows in src/*.fungi, TS host in host/.
  // Before the fix this scanned to ZERO files (a green border over an unscanned package).
  const root = makeFixture({
    "src/App.fungi": `pure flow main() -> Int\ncontract { intent { "x" } }\n{ return 0 }`,
    "host/server.ts": `import { readFileSync } from "node:fs";\nimport { c } from "./config.js";`,
    "host/config.ts": `export const c = 1;`,
  });
  const graph = buildGraph(scanPackage(root));
  const paths = graph.nodes.slice().sort();
  assert.deepEqual(paths, ["host/config.ts", "host/server.ts", "src/App.fungi"]);
  assert.equal(graph.stats.fileCount, 3);             // .fungi + host/*.ts all counted
  assert.equal(graph.stats.nodeCoreCount, 1);         // node:fs from host/server.ts
  assert.equal(graph.stats.internalEdgeCount, 1);     // host/server.ts -> host/config.ts
  assert.deepEqual(graph.scannedRoots, ["src", "host"]);
  assert.ok(graph.scannedExtensions.includes(".fungi"));
  rmSync(root, { recursive: true, force: true });
});

test(".fungi internal imports resolve as edges; ;;-comments + plugin form handled", () => {
  const root = makeFixture({
    "src/main.fungi":
      `;; import "./commented-out.fungi"   ;; a govComment — must NOT be counted\n` +
      `import "./util.fungi"\n` +
      `import plugin safe "./plugins/pay.fungi" as Pay {\n  contract { intent "pay" }\n}\n` +
      `pure flow main() -> Int\ncontract { intent { "x" } }\n{ return 0 }`,
    "src/util.fungi": `pure flow u() -> Int\ncontract { intent { "x" } }\n{ return 0 }`,
    "src/plugins/pay.fungi": `pure flow p() -> Int\ncontract { intent { "x" } }\n{ return 0 }`,
  });
  const graph = buildGraph(scanPackage(root));
  assert.equal(graph.stats.fileCount, 3);
  assert.equal(graph.stats.externalDepCount, 0);      // all imports are intra-package
  // main.fungi -> util.fungi  AND  main.fungi -> plugins/pay.fungi (the plugin path resolves inside)
  assert.equal(graph.stats.internalEdgeCount, 2);
  const froms = graph.internalEdges.map((e) => `${e.from}->${e.to}`).sort();
  assert.deepEqual(froms, ["src/main.fungi->src/plugins/pay.fungi", "src/main.fungi->src/util.fungi"]);
  // The ;;-commented import never produced a (dangling) edge.
  assert.ok(!froms.some((f) => f.includes("commented-out")));
  rmSync(root, { recursive: true, force: true });
});

test(".mjs internal imports preserve their source extension", () => {
  const root = makeFixture({
    "package.json": JSON.stringify({
      name: "@galerina/fixture",
      packageGraph: { extensions: [".mjs"] },
    }),
    "src/runner.mjs": `import { units } from "./throughput-units.mjs";\nexport { units };`,
    "src/throughput-units.mjs": `export const units = "ops/s";`,
  });

  const graph = buildGraph(scanPackage(root));

  assert.deepEqual(graph.internalEdges, [{
    from: "src/runner.mjs",
    to: "src/throughput-units.mjs",
  }]);
  assert.deepEqual(graph.orphans, ["src/runner.mjs"]);
  rmSync(root, { recursive: true, force: true });
});

// ── Escaping relative imports are a cross-package BORDER edge, not silently dropped ─────

// A mini monorepo: an app package whose host imports siblings by RELATIVE dist path
// (`../../sibling/dist/index.js`) — exactly how the example app reaches the app-kernel.
function makeMonorepo() {
  const parent = mkdtempSync(join(tmpdir(), "pkg-graph-mono-"));
  const mkPkg = (dir, json, files) => {
    mkdirSync(join(parent, dir), { recursive: true });
    writeFileSync(join(parent, dir, "package.json"), JSON.stringify(json));
    for (const [rel, content] of Object.entries(files)) {
      const full = join(parent, dir, rel);
      mkdirSync(join(full, ".."), { recursive: true });
      writeFileSync(full, content);
    }
  };
  mkPkg("sibling", { name: "@galerina/sibling" }, { "dist/index.js": "export const x = 1;" });
  mkPkg("vendor", { name: "vendor-lib" }, { "dist/index.js": "export const v = 1;" });
  mkPkg("nameless", {}, { "dist/index.js": "export const n = 1;" }); // package.json with NO name
  mkPkg("app", { name: "@galerina/app" }, {
    "host/server.ts":
      `import { x } from "../../sibling/dist/index.js";\n` +     // → @galerina/sibling (workspace)
      `import { v } from "../../vendor/dist/index.js";\n` +      // → vendor-lib (thirdparty)
      `import { n } from "../../nameless/dist/index.js";\n` +    // → fail-closed raw specifier (thirdparty)
      `import { c } from "./config.js";\n` +                     // → internal edge
      `import { readFileSync } from "node:fs";`,                 // → node_core
    "host/config.ts": `export const c = 1;`,
  });
  return { parent, app: join(parent, "app") };
}

test("escaping relative import → cross-package border edge (workspace / thirdparty / fail-closed)", () => {
  const { parent, app } = makeMonorepo();
  const graph = buildGraph(scanPackage(app));

  const byKind = (k) => graph.externalDeps.filter((d) => d.kind === k).map((d) => d.specifier).sort();
  // The escaping sibling import is attributed to the OWNING package name (stable, not a path).
  assert.ok(byKind("workspace").includes("@galerina/sibling"), "sibling attributed to @galerina package name");
  // A non-@galerina sibling is thirdparty, keyed by its package name.
  assert.ok(byKind("thirdparty").includes("vendor-lib"), "non-@galerina sibling → thirdparty by name");
  // A sibling whose package.json has no name → cannot attribute → fail-closed: raw specifier surfaced.
  assert.ok(byKind("thirdparty").includes("../../nameless/dist/index.js"), "nameless → raw specifier, never dropped");
  // node:fs still classified; ./config.js stays a genuine internal edge.
  assert.equal(graph.stats.nodeCoreCount, 1);
  assert.equal(graph.stats.internalEdgeCount, 1); // host/server.ts -> host/config.ts
  rmSync(parent, { recursive: true, force: true });
});

// ── Configurable roots/extensions + scope visibility ───────────────────────────────────

test("packageGraph config overrides scanned roots/extensions", () => {
  const root = makeFixture({
    "package.json": JSON.stringify({ name: "@galerina/cfg", packageGraph: { roots: ["lib"], extensions: [".ts"] } }),
    "lib/index.ts": `import axios from "axios";`,   // scanned (configured root)
    "src/ignored.ts": `import lodash from "lodash";`, // NOT scanned (src excluded by config)
  });
  const graph = buildGraph(scanPackage(root));
  const specs = graph.externalDeps.map((d) => d.specifier);
  assert.ok(specs.includes("axios"), "configured root lib/ is scanned");
  assert.ok(!specs.includes("lodash"), "default src/ is excluded when config overrides roots");
  assert.deepEqual(graph.scannedRoots, ["lib"]);
  rmSync(root, { recursive: true, force: true });
});

test("configured JSON scans exclude generated .myco metadata from the source node set", () => {
  const root = makeFixture({
    "package.json": JSON.stringify({
      name: "@galerina/json-assets",
      packageGraph: { roots: ["src", "contracts"], extensions: [".mjs", ".json"] },
    }),
    "src/index.mjs": "export const ready = true;\n",
    "src/.myco/index.json": "{}\n",
    "contracts/admission.json": "{}\n",
  });
  const graph = buildGraph(scanPackage(root));
  assert.ok(graph.nodes.includes("contracts/admission.json"));
  assert.ok(!graph.nodes.some((node) => node.includes("/.myco/") || node.startsWith(".myco/")));
  rmSync(root, { recursive: true, force: true });
});

test("scanned scope is reported even when zero files match (no silent empty border)", () => {
  const root = makeFixture({
    "package.json": JSON.stringify({ name: "@galerina/empty" }),
  });
  const graph = buildGraph(scanPackage(root));
  assert.equal(graph.stats.fileCount, 0);
  assert.deepEqual(graph.scannedRoots, ["src"]);
  assert.ok(graph.scannedExtensions.length > 0);
  rmSync(root, { recursive: true, force: true });
});

test("omitting src while it holds code fails the boundary gate", () => {
  const root = makeFixture({
    "package.json": JSON.stringify({
      name: "@galerina/narrow",
      packageGraph: { roots: ["docs"], extensions: [".ts"] },
    }),
    "src/index.ts": `import x from "hidden-dep";\nexport const y = x;\n`,
    "docs/index.ts": "export const n = 1;\n",
    ".graph/boundary-policy.json": JSON.stringify({
      packageName: "@galerina/narrow",
      allowedExternal: [],
    }),
  });
  const graph = buildGraph(scanPackage(root));
  const gate = runBoundaryGate(root, graph, true);
  assert.equal(gate.status, "FAIL");
  assert.ok(gate.violations.some((v) => /vacuous/i.test(String(v))));
  rmSync(root, { recursive: true, force: true });
});

test("explicit missing or escaping scan roots are refused", () => {
  const missing = makeFixture({
    "package.json": JSON.stringify({ name: "@galerina/missing-root", packageGraph: { roots: ["does-not-exist"] } }),
  });
  assert.throws(() => scanPackage(missing), /does not exist/);
  rmSync(missing, { recursive: true, force: true });

  const escaping = makeFixture({
    "package.json": JSON.stringify({ name: "@galerina/escape-root", packageGraph: { roots: ["../victim"] } }),
  });
  assert.throws(() => scanPackage(escaping), /canonical|inside the package|\.\./);
  rmSync(escaping, { recursive: true, force: true });
});

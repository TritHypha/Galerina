import { spawnSync } from "node:child_process";
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const MEM = join(HERE, "..", "..");
const REPO = join(MEM, "..", "..", "..");
const BOUNDARY = join(MEM, "src", "c-boundary.fungi");
const GATE = join(MEM, "src", "serve-gate.fungi");
const GALERINA = join(REPO, "galerina.mjs");
const IMPORT_LINE = "\nimport \"./c-boundary.fungi\"\n";

function invoke(file, flow, args) {
  const argv = [GALERINA, "run", file, "--invoke", flow, ...args.map(String)];
  const r = spawnSync(process.execPath, argv, { encoding: "utf8", cwd: REPO, timeout: 120000 });
  const text = (r.stdout || "") + (r.stderr || "");
  const m = text.match(/=>\s*(-?\d+)\s*$/m) || text.match(/(-?\d+)\s*$/);
  if (!m) {
    return { status: r.status, text, present: false, reason: "INVOKE_VALUE_ABSENT", value: 0 };
  }
  const value = Number(m[1]);
  if (Number.isSafeInteger(value) !== true) {
    return { status: r.status, text, present: false, reason: "INVOKE_VALUE_NOT_SAFE_INTEGER", value: 0 };
  }
  return { status: r.status, text, present: true, reason: "INVOKE_VALUE_PRESENT", value };
}

function flattenGate() {
  const boundary = readFileSync(BOUNDARY, "utf8");
  const gate = readFileSync(GATE, "utf8");
  assert.equal(gate.includes(IMPORT_LINE), true, "landed source must import c-boundary");
  const parts = gate.split(IMPORT_LINE);
  assert.equal(parts.length, 2, "import line must occur once");
  let rest = parts[0] + parts[1];
  const marker = "@version 1";
  const first = rest.indexOf(marker);
  assert.notEqual(first, -1, "gate version marker");
  rest = rest.slice(first + marker.length);
  const dir = mkdtempSync(join(tmpdir(), "q33-flat-"));
  const file = join(dir, "flat.fungi");
  writeFileSync(file, boundary + "\n" + rest);
  return { dir, file };
}

function classify(over) {
  const o = over || {};
  const args = [
    o.layerClass ?? 0,
    o.layer ?? 0,
    o.methodClass ?? 0,
    o.method ?? 0,
    o.pathClassClass ?? 0,
    o.pathClass ?? 7,
    o.effectClassClass ?? 0,
    o.effectClass ?? 0,
    o.reachClassClass ?? 0,
    o.reachClass ?? 0,
  ];
  const flat = flattenGate();
  try {
    return invoke(flat.file, "classifyServeRoute", args);
  } finally {
    rmSync(flat.dir, { recursive: true, force: true });
  }
}

function expectPacked(r, expected, label) {
  assert.equal(r.status, 0, label + " status " + r.reason + " " + r.text);
  assert.equal(r.present, true, label + " " + r.reason + " " + r.text);
  assert.equal(r.value, expected, label + " " + r.text);
}

function replaceOnce(s, from, to) {
  const i = s.indexOf(from);
  assert.notEqual(i, -1, "needle missing: " + from.slice(0, 80));
  const j = s.indexOf(from, i + from.length);
  assert.equal(j, -1, "needle not unique: " + from.slice(0, 80));
  return s.slice(0, i) + to + s.slice(i + from.length);
}

function withMutant(from, to, runRed) {
  const orig = readFileSync(GATE, "utf8");
  const mutant = replaceOnce(orig, from, to);
  writeFileSync(GATE, mutant);
  try {
    runRed();
  } finally {
    writeFileSync(GATE, orig);
  }
}

test("c-boundary helper still maps classTag 0..10 and unlisted 11", () => {
  expectPacked(invoke(BOUNDARY, "readForeignSafeInteger", [0, 4]), 0, "ok");
  expectPacked(invoke(BOUNDARY, "readForeignSafeInteger", [3, 0]), 3, "NaN");
  expectPacked(invoke(BOUNDARY, "readForeignSafeInteger", [11, 0]), 11, "unlisted");
});

test("MUST-REFUSE POST /auth/verify on serve layer before exposure", () => {
  expectPacked(classify({ layer: 0, method: 0, pathClass: 0 }), 101, "serve POST canonical");
});

test("MUST-REFUSE POST /auth/verify on startServer layer before exposure", () => {
  expectPacked(classify({ layer: 1, method: 0, pathClass: 0 }), 101, "startServer POST canonical");
});

test("MUST-REFUSE trailing slash case percent dot and double-slash variants", () => {
  expectPacked(classify({ pathClass: 1 }), 101, "trailing slash");
  expectPacked(classify({ pathClass: 2 }), 101, "ASCII case");
  expectPacked(classify({ pathClass: 3 }), 101, "percent");
  expectPacked(classify({ pathClass: 4 }), 101, "dot segment");
  expectPacked(classify({ pathClass: 5 }), 101, "double slash");
});

test("MUST-REFUSE GET and PUT /auth/verify as protected identity", () => {
  expectPacked(classify({ method: 1, pathClass: 0 }), 101, "GET canonical");
  expectPacked(classify({ method: 2, pathClass: 0 }), 101, "PUT canonical");
});

test("MUST-REFUSE unnormalisable path as PROTECTED", () => {
  expectPacked(classify({ method: 0, pathClass: 6 }), 102, "unnormalisable POST");
  expectPacked(classify({ method: 1, pathClass: 6 }), 102, "unnormalisable GET");
});

test("MUST-REFUSE unlisted path class as PROTECTED", () => {
  expectPacked(classify({ pathClass: 99 }), 112, "unlisted path");
});

test("MUST-REFUSE secret.read vault.read vault.write env and Secrets.get", () => {
  expectPacked(classify({ pathClass: 9, effectClass: 1 }), 103, "secret.read");
  expectPacked(classify({ pathClass: 9, effectClass: 2 }), 103, "vault.read");
  expectPacked(classify({ pathClass: 9, effectClass: 3 }), 103, "vault.write");
  expectPacked(classify({ pathClass: 9, effectClass: 4 }), 103, "env");
  expectPacked(classify({ pathClass: 9, effectClass: 5 }), 103, "Secrets.get");
});

test("MUST-REFUSE unlisted effect name as secret-bearing", () => {
  expectPacked(classify({ pathClass: 9, effectClass: 10 }), 104, "unrecognised listed");
  expectPacked(classify({ pathClass: 9, effectClass: 99 }), 104, "unlisted integer");
});

test("MUST-REFUSE secrets block and unresolved call", () => {
  expectPacked(classify({ pathClass: 9, effectClass: 9 }), 105, "secrets-block effect");
  expectPacked(classify({ pathClass: 9, reachClass: 7 }), 105, "secrets-block reach");
  expectPacked(classify({ pathClass: 9, reachClass: 6 }), 106, "unresolved");
});

test("MUST-REFUSE deny-only effect", () => {
  expectPacked(classify({ pathClass: 9, effectClass: 8 }), 107, "deny-only");
});

test("MUST-REFUSE secret through alias nested callee module step shadow record and Ok wrap", () => {
  expectPacked(classify({ pathClass: 9, reachClass: 2 }), 103, "alias");
  expectPacked(classify({ pathClass: 9, reachClass: 1 }), 103, "nested");
  expectPacked(classify({ pathClass: 9, reachClass: 3 }), 103, "callee");
  expectPacked(classify({ pathClass: 9, reachClass: 4 }), 103, "module");
  expectPacked(classify({ pathClass: 9, reachClass: 5 }), 103, "step");
  expectPacked(classify({ pathClass: 9, reachClass: 8 }), 103, "shadow");
  expectPacked(classify({ pathClass: 9, reachClass: 9 }), 103, "record alias");
  expectPacked(classify({ pathClass: 9, reachClass: 10 }), 103, "Ok wrap");
});

test("MUST-ADMIT secret-free hello on both layers", () => {
  expectPacked(classify({ layer: 0, method: 1, pathClass: 7 }), 100, "serve hello");
  expectPacked(classify({ layer: 1, method: 1, pathClass: 7 }), 100, "startServer hello");
});

test("MUST-ADMIT fixture crypto.verify that is not /auth/verify", () => {
  expectPacked(classify({ method: 0, pathClass: 8, effectClass: 6 }), 100, "fixture");
});

test("MUST-ADMIT secret-free sibling step and listed public path", () => {
  expectPacked(classify({ method: 0, pathClass: 9, effectClass: 0, reachClass: 0 }), 100, "P6 sibling");
  expectPacked(classify({ method: 1, pathClass: 9, effectClass: 7 }), 100, "database.write public");
});

test("MUST-REFUSE unlisted layer and unlisted method on public path", () => {
  expectPacked(classify({ layer: 2, pathClass: 7 }), 108, "unlisted layer");
  expectPacked(classify({ method: 9, pathClass: 7 }), 111, "unlisted method public");
});

test("MUST-REFUSE foreign classTag 1..10 as ForeignRaw and unlisted tag 11", () => {
  expectPacked(classify({ layerClass: 3, pathClass: 7 }), 110, "layer NaN");
  expectPacked(classify({ methodClass: 1, pathClass: 7 }), 110, "method Null");
  expectPacked(classify({ pathClassClass: 12, pathClass: 7 }), 111, "path classTag unlisted");
  expectPacked(classify({ pathClass: 9, effectClassClass: 3 }), 110, "effect NaN");
  expectPacked(classify({ pathClass: 9, effectClassClass: 11 }), 111, "effect classTag unlisted");
  expectPacked(classify({ pathClass: 9, reachClassClass: 3 }), 110, "reach NaN");
  expectPacked(classify({ pathClass: 9, reachClassClass: 11 }), 111, "reach classTag unlisted");
});

test("MUST-REFUSE unlisted reach class on a public path as secret-bearing", () => {
  expectPacked(classify({ pathClass: 9, reachClass: 99 }), 104, "unlisted reach");
});

test("gate never yields COMMITTED", () => {
  const rows = [
    { pathClass: 0 },
    { pathClass: 6 },
    { pathClass: 7 },
    { pathClass: 9, effectClass: 1 },
    { pathClass: 9, effectClass: 99 },
    { layer: 1, pathClass: 0 },
  ];
  let i = 0;
  while (i < rows.length) {
    const r = classify(rows[i]);
    assert.notEqual(r.value % 100, 13, "no committed code " + String(i));
    i = i + 1;
  }
});

test("landed source check admits import; standalone build refuses FUNGI-NAME-001", () => {
  const check = spawnSync(
    process.execPath,
    [GALERINA, "check", GATE, "--strict-types", "--strict-governance"],
    { encoding: "utf8", cwd: REPO, timeout: 120000 },
  );
  assert.equal(check.status, 0, check.stdout + check.stderr);
  const build = spawnSync(
    process.execPath,
    [GALERINA, "build", GATE],
    { encoding: "utf8", cwd: REPO, timeout: 120000 },
  );
  const text = (build.stdout || "") + (build.stderr || "");
  assert.notEqual(build.status, 0, "standalone build must refuse import CALL");
  assert.equal(text.includes("FUNGI-NAME-001"), true, text);
});

test("mutant null-path-as-unprotected goes RED then restore", () => {
  withMutant(
    "if pathClass == 6 {\n    return 2\n  }",
    "if pathClass == 6 {\n    return 0\n  }",
    () => {
      const r = classify({ pathClass: 6 });
      assert.equal(r.present, true, r.reason + " " + r.text);
      assert.notEqual(r.value, 102, "unnormalisable must not stay protected: " + String(r.value));
    },
  );
  expectPacked(classify({ pathClass: 6 }), 102, "restore unnormalisable");
});

test("mutant drop trailing-slash normalisation goes RED then restore", () => {
  withMutant(
    "if pathClass == 1 {\n    return 1\n  }",
    "if pathClass == 1 {\n    return 0\n  }",
    () => {
      const r = classify({ pathClass: 1 });
      assert.equal(r.present, true, r.reason + " " + r.text);
      assert.notEqual(r.value, 101, "trailing slash must not stay protected: " + String(r.value));
    },
  );
  expectPacked(classify({ pathClass: 1 }), 101, "restore trailing slash");
});

test("mutant unlisted effect non-secret goes RED then restore", () => {
  withMutant(
    "let unlistedEffectSecretDefault: Int = 4",
    "let unlistedEffectSecretDefault: Int = 0",
    () => {
      const r = classify({ pathClass: 9, effectClass: 99 });
      assert.equal(r.present, true, r.reason + " " + r.text);
      assert.equal(r.value, 100, "unlisted effect admitted: " + r.text);
    },
  );
  expectPacked(classify({ pathClass: 9, effectClass: 99 }), 104, "restore unlisted effect");
});

test("mutant remove startServer layer check goes RED then restore", () => {
  withMutant(
    "  let pathKind: Int = pathProtection(pathClass)",
    "  if layer == 1 {\n    return finish(0, true)\n  }\n  let pathKind: Int = pathProtection(pathClass)",
    () => {
      const r = classify({ layer: 1, pathClass: 0 });
      assert.equal(r.present, true, r.reason + " " + r.text);
      assert.equal(r.value, 100, "startServer admitted protected: " + r.text);
      const serve = classify({ layer: 0, pathClass: 0 });
      expectPacked(serve, 101, "serve layer still refuses");
    },
  );
  expectPacked(classify({ layer: 1, pathClass: 0 }), 101, "restore startServer fence");
});

test("mutant unlisted reach class admitted goes RED then restore", () => {
  withMutant(
    "let unlistedReachSecretDefault: Int = 4",
    "let unlistedReachSecretDefault: Int = 0",
    () => {
      const r = classify({ pathClass: 9, reachClass: 99 });
      assert.equal(r.present, true, r.reason + " " + r.text);
      assert.equal(r.value, 100, "unlisted reach admitted: " + r.text);
    },
  );
  expectPacked(classify({ pathClass: 9, reachClass: 99 }), 104, "restore unlisted reach");
});

test("mutant effect foreign classTag check dead goes RED then restore", () => {
  withMutant(
    "  let effectReason: Int = readForeignBoundedInteger(effectClassClass, effectClass, -2147483647, 2147483647)\n  if effectReason != 0 {",
    "  let effectReason: Int = readForeignBoundedInteger(effectClassClass, effectClass, -2147483647, 2147483647)\n  if effectReason == 99 {",
    () => {
      const r = classify({ pathClass: 9, effectClassClass: 3 });
      assert.equal(r.present, true, r.reason + " " + r.text);
      assert.notEqual(r.value, 110, "effect NaN must not stay ForeignRaw");
    },
  );
  expectPacked(classify({ pathClass: 9, effectClassClass: 3 }), 110, "restore effect foreign");
});

test("mutant reach foreign classTag check dead goes RED then restore", () => {
  withMutant(
    "  let reachReason: Int = readForeignBoundedInteger(reachClassClass, reachClass, -2147483647, 2147483647)\n  if reachReason != 0 {",
    "  let reachReason: Int = readForeignBoundedInteger(reachClassClass, reachClass, -2147483647, 2147483647)\n  if reachReason == 99 {",
    () => {
      const r = classify({ pathClass: 9, reachClassClass: 3 });
      assert.equal(r.present, true, r.reason + " " + r.text);
      assert.notEqual(r.value, 110, "reach NaN must not stay ForeignRaw");
    },
  );
  expectPacked(classify({ pathClass: 9, reachClassClass: 3 }), 110, "restore reach foreign");
});

import { spawnSync } from "node:child_process";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const MEM = join(HERE, "..", "..");
const REPO = join(MEM, "..", "..", "..");
const BOUNDARY = join(MEM, "src", "c-boundary.fungi");
const GATE = join(MEM, "src", "serve-gate.fungi");
const GALERINA = join(REPO, "galerina.mjs");
const EVIDENCE = join(MEM, "evidence", "33-u2-serve-gate", "ts-differential.txt");
const PIN = "dc0f9c8c4f1365f0228cda213b2ecd001400463e";
const TS_PATH = "packages-ts/galerina-core-compiler/src/serve-secret-gate.ts";
const TS_SHA = "5be17ebf6387d6f9396e571c3cbc47dd3b61a6989a4cf1f3de9b06408bae0df2";
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
  const dir = mkdtempSync(join(tmpdir(), "q33-02-flat-"));
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

async function loadFrozen() {
  const shown = spawnSync("git", ["show", PIN + ":" + TS_PATH], {
    cwd: REPO,
    encoding: "utf8",
    maxBuffer: 2_000_000,
  });
  assert.equal(shown.status, 0, shown.stderr);
  const sha = createHash("sha256").update(shown.stdout, "utf8").digest("hex");
  assert.equal(sha, TS_SHA);
  const dir = mkdtempSync(join(tmpdir(), "q33-frozen-ts-"));
  writeFileSync(join(dir, "effect-checker.ts"), [
    "export function canonicalEffectName(name: string): string { return name; }",
    "export const DENY_ONLY_EFFECTS: ReadonlySet<string> = new Set();",
    "export function isRecognisedEffectName(_name: string): boolean { return false; }",
    "export function observedEffectsForFlowNodeIncludingNestedFns(): readonly string[] { return []; }",
    "",
  ].join("\n"));
  writeFileSync(join(dir, "effect-checker.js"), [
    "export function canonicalEffectName(name) { return name; }",
    "export const DENY_ONLY_EFFECTS = new Set();",
    "export function isRecognisedEffectName(_name) { return false; }",
    "export function observedEffectsForFlowNodeIncludingNestedFns() { return []; }",
    "",
  ].join("\n"));
  writeFileSync(join(dir, "flow-name.ts"), [
    "export function decodeFlowDecl(_node: unknown): undefined { return undefined; }",
    "export function isFlowDeclNamed(_ast: unknown, _name: string): boolean { return false; }",
    "",
  ].join("\n"));
  writeFileSync(join(dir, "flow-name.js"), [
    "export function decodeFlowDecl(_node) { return undefined; }",
    "export function isFlowDeclNamed(_ast, _name) { return false; }",
    "",
  ].join("\n"));
  writeFileSync(join(dir, "parser.ts"), "export type AstNode = { children?: AstNode[] };\nexport type FlowMeta = { name: string };\n");
  writeFileSync(join(dir, "route-registry.ts"), "export type RouteEntry = { path: string; method: string; pathPattern: RegExp };\n");
  writeFileSync(join(dir, "serve-secret-gate.ts"), shown.stdout);
  const mod = await import(pathToFileURL(join(dir, "serve-secret-gate.ts")).href + "?t=" + String(Date.now()));
  return { dir, mod, source: shown.stdout };
}

const ROWS = [
  {
    row: "POST /auth/verify",
    ts: "protected",
    fungi: 101,
    verdict: "PRESERVED",
    tags: { method: 0, pathClass: 0 },
    tsCall: (m) => m.isProtectedAuthVerifyRoute({ path: "/auth/verify", method: "POST", pathPattern: /^$/ }),
    tsExpect: true,
  },
  {
    row: "POST /auth/verify/",
    ts: "protected",
    fungi: 101,
    verdict: "PRESERVED",
    tags: { method: 0, pathClass: 1 },
    tsCall: (m) => m.isProtectedAuthVerifyRoute({ path: "/auth/verify/", method: "POST", pathPattern: /^$/ }),
    tsExpect: true,
  },
  {
    row: "POST /Auth/Verify",
    ts: "protected",
    fungi: 101,
    verdict: "PRESERVED",
    tags: { method: 0, pathClass: 2 },
    tsCall: (m) => m.isProtectedAuthVerifyRoute({ path: "/Auth/Verify", method: "POST", pathPattern: /^$/ }),
    tsExpect: true,
  },
  {
    row: "POST /auth/%76erify",
    ts: "protected",
    fungi: 101,
    verdict: "PRESERVED",
    tags: { method: 0, pathClass: 3 },
    tsCall: (m) => m.isProtectedAuthVerifyRoute({ path: "/auth/%76erify", method: "POST", pathPattern: /^$/ }),
    tsExpect: true,
  },
  {
    row: "GET /auth/verify",
    ts: "protected",
    fungi: 101,
    verdict: "PRESERVED",
    tags: { method: 1, pathClass: 0 },
    tsCall: (m) => m.isProtectedAuthVerifyRoute({ path: "/auth/verify", method: "GET", pathPattern: /^$/ }),
    tsExpect: true,
  },
  {
    row: "GET /hello",
    ts: "admit",
    fungi: 100,
    verdict: "PRESERVED",
    tags: { method: 1, pathClass: 7 },
    tsCall: (m) => m.isProtectedAuthVerifyRoute({ path: "/hello", method: "GET", pathPattern: /^$/ }),
    tsExpect: false,
  },
  {
    row: "POST /__fixture/auth/verify",
    ts: "admit",
    fungi: 100,
    verdict: "PRESERVED",
    tags: { method: 0, pathClass: 8 },
    tsCall: (m) => m.isProtectedAuthVerifyRoute({ path: "/__fixture/auth/verify", method: "POST", pathPattern: /^$/ }),
    tsExpect: false,
  },
  {
    row: "POST /auth/%zz unnormalisable",
    ts: "not-protected",
    fungi: 102,
    verdict: "INTENDED_DIVERGENCE",
    tags: { method: 0, pathClass: 6 },
    tsCall: (m) => m.isProtectedAuthVerifyRoute({ path: "/auth/%zz", method: "POST", pathPattern: /^$/ }),
    tsExpect: false,
  },
  {
    row: "GET /auth/%zz unnormalisable",
    ts: "not-protected",
    fungi: 102,
    verdict: "INTENDED_DIVERGENCE",
    tags: { method: 1, pathClass: 6 },
    tsCall: (m) => m.isProtectedAuthVerifyRoute({ path: "/auth/%zz", method: "GET", pathPattern: /^$/ }),
    tsExpect: false,
  },
  {
    row: "secret.read",
    ts: "secret-bearing refuse",
    fungi: 103,
    verdict: "PRESERVED",
    tags: { pathClass: 9, effectClass: 1 },
    tsCall: (m) => m.isSecretBearingEffectName("secret.read"),
    tsExpect: true,
  },
  {
    row: "vault.write",
    ts: "secret-bearing refuse",
    fungi: 103,
    verdict: "PRESERVED",
    tags: { pathClass: 9, effectClass: 3 },
    tsCall: (m) => m.isSecretBearingEffectName("vault.write"),
    tsExpect: true,
  },
  {
    row: "totally.fake.effect",
    ts: "unrecognised refuse / not secret-namespace",
    fungi: 104,
    verdict: "INTENDED_DIVERGENCE",
    tags: { pathClass: 9, effectClass: 99 },
    tsCall: (m) => m.isSecretBearingEffectName("totally.fake.effect"),
    tsExpect: false,
  },
  {
    row: "crypto.verify fixture",
    ts: "not secret-bearing",
    fungi: 100,
    verdict: "PRESERVED",
    tags: { method: 0, pathClass: 8, effectClass: 6 },
    tsCall: (m) => m.isSecretBearingEffectName("crypto.verify"),
    tsExpect: false,
  },
  {
    row: "POST /auth/{x} pathPattern matches /auth/verify",
    ts: "protected",
    fungi: 101,
    verdict: "PRESERVED",
    tags: { method: 0, pathClass: 0 },
    tsCall: (m) => m.isProtectedAuthVerifyRoute({ path: "/auth/{x}", method: "POST", pathPattern: /^\/auth\/([^/]+)$/ }),
    tsExpect: true,
  },
];

test("F1 frozen TS executed and flattened fungi packed code matches each row", async () => {
  const frozen = await loadFrozen();
  try {
    assert.equal(frozen.source.includes("function normalizeDeclaredRoutePath"), true);
    assert.equal(frozen.source.includes("if (normalized === null) return false"), true);
    assert.equal(frozen.source.includes("const rebuilt = compileDeclaredPathPattern(normalized)"), true);

    const rebuilt = frozen.mod.isProtectedAuthVerifyRoute({
      path: "/auth/{id}",
      method: "POST",
      pathPattern: /^$/,
    });
    assert.equal(rebuilt, true, "l.113-115 rebuilt pattern must protect /auth/{id}");

    const evidence = readFileSync(EVIDENCE, "utf8");
    let i = 0;
    while (i < ROWS.length) {
      const row = ROWS[i];
      const listed = row.verdict === "PRESERVED" || row.verdict === "INTENDED_DIVERGENCE" || row.verdict === "NEEDS_LANGUAGE" || row.verdict === "UNKNOWN";
      assert.equal(listed, true, row.row + " unlisted verdict");
      const needle = row.row + " | " + String(row.fungi) + " | " + row.verdict;
      assert.equal(evidence.includes(needle), true, "evidence missing " + needle);
      const tsVal = row.tsCall(frozen.mod);
      assert.equal(tsVal, row.tsExpect, row.row + " TS " + String(tsVal));
      const packed = classify(row.tags);
      assert.equal(packed.status, 0, row.row + " " + packed.reason + " " + packed.text);
      assert.equal(packed.present, true, row.row + " " + packed.reason);
      assert.equal(packed.value, row.fungi, row.row + " fungi packed " + String(packed.value));
      if (row.verdict === "PRESERVED") {
        if (row.fungi === 101 || row.fungi === 103) {
          assert.equal(tsVal, true, row.row + " PRESERVED expects TS refuse/protect");
        }
        if (row.fungi === 100) {
          assert.equal(tsVal, false, row.row + " PRESERVED expects TS admit/not-secret");
        }
      }
      if (row.verdict === "INTENDED_DIVERGENCE") {
        if (row.fungi === 102) {
          assert.equal(tsVal, false, row.row + " TS not-protected; fungi PROTECTED");
        }
        if (row.fungi === 104) {
          assert.equal(tsVal, false, row.row + " TS not secret-namespace; fungi unlisted-secret");
        }
      }
      i = i + 1;
    }
  } finally {
    rmSync(frozen.dir, { recursive: true, force: true });
  }
});

test("F1 tamper pathClass 6 return 2 to 0 turns differential RED", () => {
  withMutant(
    "if pathClass == 6 {\n    return 2\n  }",
    "if pathClass == 6 {\n    return 0\n  }",
    () => {
      const r = classify({ method: 0, pathClass: 6 });
      assert.equal(r.present, true, r.reason + " " + r.text);
      assert.notEqual(r.value, 102, "unnormalisable row must not stay 102");
    },
  );
  const restore = classify({ method: 0, pathClass: 6 });
  assert.equal(restore.value, 102, "restore unnormalisable");
});

test("F1 tamper pathClass 0 return 1 to 0 turns differential RED", () => {
  withMutant(
    "if pathClass == 0 {\n    return 1\n  }",
    "if pathClass == 0 {\n    return 0\n  }",
    () => {
      const r = classify({ method: 0, pathClass: 0 });
      assert.equal(r.present, true, r.reason + " " + r.text);
      assert.notEqual(r.value, 101, "canonical POST /auth/verify must not stay 101");
    },
  );
  const restore = classify({ method: 0, pathClass: 0 });
  assert.equal(restore.value, 101, "restore canonical");
});

import { spawnSync } from "node:child_process";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const MEM = join(HERE, "..", "..");
const REPO = join(MEM, "..", "..", "..");
const BOUNDARY = join(MEM, "src", "c-boundary.fungi");
const BODY = join(MEM, "src", "body-reader.fungi");
const RCP = join(MEM, "src", "release-commit-point.fungi");
const SECRET = join(MEM, "src", "secret-gate.fungi");
const PORTS = join(MEM, "src", "kernel-ports.fungi");
const UNIT = join(MEM, "src", "kernel.fungi");
const GALERINA = join(REPO, "galerina.mjs");
const EVIDENCE = join(MEM, "evidence", "36-app-kernel", "ts-differential.txt");
const PIN = "dc0f9c8c4f1365f0228cda213b2ecd001400463e";
const PARKED = "93934967ef72e4fc711754775760c18b10f1d240";
const TS_PATH = "packages-ts/galerina-framework-app-kernel/src/kernel.ts";
const TS_SHA = "5a6e13c32c0daab3f303b0840674237836baa742056412b5f84fcae08b2faeee";
const CB_IMPORT = "\nimport \"./c-boundary.fungi\"\n";
const BODY_IMPORT = "\nimport \"./body-reader.fungi\"\n";
const RCP_IMPORT = "\nimport \"./release-commit-point.fungi\"\n";
const SECRET_IMPORT = "\nimport \"./secret-gate.fungi\"\n";
const PORTS_IMPORT = "\nimport \"./kernel-ports.fungi\"\n";

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

function stripVersion(src) {
  const marker = "@version 1";
  const first = src.indexOf(marker);
  assert.notEqual(first, -1, "version marker");
  return src.slice(first + marker.length);
}

function splitOnce(src, needle, label) {
  const parts = src.split(needle);
  assert.equal(parts.length, 2, label + " import line must occur once");
  return parts[0] + "\n" + parts[1];
}

function stripBodyFinish(src) {
  const start = src.indexOf("pure flow finish(");
  assert.notEqual(start, -1, "body-reader packer");
  const next = src.indexOf("pure flow rangesOverlap");
  assert.equal(next > start, true, "body-reader packer bounds");
  return src.slice(0, start) + src.slice(next);
}

function stripSecretImports(src) {
  let s = src;
  s = splitOnce(s, CB_IMPORT, "secret c-boundary");
  s = splitOnce(s, RCP_IMPORT, "secret release-commit-point");
  return stripVersion(s);
}

function stripPortsImports(src) {
  let s = src;
  s = splitOnce(s, CB_IMPORT, "ports c-boundary");
  s = splitOnce(s, RCP_IMPORT, "ports release-commit-point");
  return stripVersion(s);
}

function flattenUnit() {
  const boundary = readFileSync(BOUNDARY, "utf8");
  const bodyReader = readFileSync(BODY, "utf8");
  const rcp = readFileSync(RCP, "utf8");
  const secret = readFileSync(SECRET, "utf8");
  const ports = readFileSync(PORTS, "utf8");
  const unit = readFileSync(UNIT, "utf8");
  let rest = unit;
  rest = splitOnce(rest, CB_IMPORT, "c-boundary");
  rest = splitOnce(rest, BODY_IMPORT, "body-reader");
  rest = splitOnce(rest, RCP_IMPORT, "release-commit-point");
  rest = splitOnce(rest, SECRET_IMPORT, "secret-gate");
  rest = splitOnce(rest, PORTS_IMPORT, "kernel-ports");
  rest = stripVersion(rest);
  const dir = mkdtempSync(join(tmpdir(), "q36-diff-flat-"));
  const file = join(dir, "flat.fungi");
  writeFileSync(
    file,
    boundary + "\n" + stripVersion(stripBodyFinish(bodyReader)) + "\n" + stripVersion(rcp) + "\n" + stripSecretImports(secret) + "\n" + stripPortsImports(ports) + "\n" + rest,
  );
  return { dir, file };
}

function runFlow(flow, args) {
  const flat = flattenUnit();
  try {
    return invoke(flat.file, flow, args);
  } finally {
    rmSync(flat.dir, { recursive: true, force: true });
  }
}

function gitShow(rev, path) {
  const shown = spawnSync("git", ["show", rev + ":" + path], {
    cwd: REPO,
    encoding: "buffer",
    maxBuffer: 4_000_000,
  });
  assert.equal(shown.status, 0, String(shown.stderr));
  return shown.stdout;
}

function sha(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

function kernelRequest(over) {
  const o = over || {};
  return {
    method: o.method ?? "POST",
    path: o.path ?? "/no-such",
    headers: o.headers ?? { "content-type": "application/json" },
    body: o.body ?? new Uint8Array([123]),
    query: {},
    requestId: "req-1",
    receivedAt: 1000,
  };
}

function responseCode(res) {
  if (res.body == null) {
    return "no-body status=" + String(res.status);
  }
  const text = Buffer.from(res.body).toString("utf8");
  const parsed = JSON.parse(text);
  return String(parsed.error);
}

async function loadFrozen(rev) {
  assert.equal(process.features.typescript, "strip", "Node type-strip required");
  const kernel = gitShow(rev, TS_PATH);
  if (rev === PIN) {
    assert.equal(sha(kernel), TS_SHA);
  }
  const dir = mkdtempSync(join(tmpdir(), "q36-frozen-ts-"));
  const src = join(dir, "src");
  mkdirSync(src);
  const nm = join(dir, "node_modules", "@galerina");
  mkdirSync(join(nm, "core-config"), { recursive: true });
  mkdirSync(join(nm, "tower-citizen", "governance"), { recursive: true });
  writeFileSync(join(dir, "package.json"), "{\"type\":\"module\"}\n");
  writeFileSync(join(src, "kernel.ts"), kernel);
  const siblings = [
    "types.ts",
    "route-defaults.ts",
    "secret-gate.ts",
    "release-commit-point.ts",
    "foreign-boundary.ts",
  ];
  let i = 0;
  while (i < siblings.length) {
    const rel = "packages-ts/galerina-framework-app-kernel/src/" + siblings[i];
    const shown = spawnSync("git", ["show", rev + ":" + rel], { cwd: REPO, encoding: "buffer", maxBuffer: 4_000_000 });
    if (shown.status === 0) {
      writeFileSync(join(src, siblings[i]), shown.stdout);
      writeFileSync(join(src, siblings[i].replace(".ts", ".js")), "export * from \"./" + siblings[i] + "\";\n");
    }
    i = i + 1;
  }
  writeFileSync(
    join(nm, "core-config", "index.js"),
    "export const GALERINA_ENVIRONMENT_MODES = [\"development\",\"production\",\"test\",\"unknown\"];\nexport function resolvePosture(posture, env) { return { effective: posture === \"on\" ? \"on\" : \"off\", env }; }\n",
  );
  writeFileSync(
    join(nm, "core-config", "package.json"),
    "{\"name\":\"@galerina/core-config\",\"type\":\"module\",\"main\":\"index.js\"}\n",
  );
  writeFileSync(
    join(nm, "tower-citizen", "governance", "index.js"),
    "export function decideAtBoundary(verdict) { return { authorized: verdict === 1 }; }\n",
  );
  writeFileSync(
    join(nm, "tower-citizen", "package.json"),
    "{\"name\":\"@galerina/tower-citizen\",\"type\":\"module\",\"exports\":{\"./governance\":\"./governance/index.js\"}}\n",
  );
  const mod = await import(pathToFileURL(join(src, "kernel.ts")).href + "?t=" + String(Date.now()));
  return { dir, mod, rev };
}

const ROWS = [
  { row: "unknown path", ts: "route_not_found", fungi: 120, verdict: "PRESERVED" },
  { row: "wrong method", ts: "method_not_allowed", fungi: 121, verdict: "PRESERVED" },
  { row: "unknown posture throws", ts: "throw", fungi: 112, verdict: "INTENDED_DIVERGENCE" },
  { row: "secret route no provider warns", ts: "boot-warn-then-503", fungi: 118, verdict: "INTENDED_DIVERGENCE" },
  { row: "rate forward jump resets window", ts: "window-reset", fungi: 128, verdict: "INTENDED_DIVERGENCE" },
  { row: "ack before audit swallow", ts: "ack-then-503", fungi: 106, verdict: "INTENDED_DIVERGENCE" },
  { row: "getSecret undefined after deadline", ts: "undefined", fungi: 152, verdict: "INTENDED_DIVERGENCE" },
  { row: "deadline armed at dispatch", ts: "dispatch-only", fungi: 147, verdict: "INTENDED_DIVERGENCE" },
  { row: "post-consume success COMMITTED", ts: "200-acked", fungi: 106, verdict: "INTENDED_DIVERGENCE" },
  { row: "MONOTONIC_TYPED_TIME", ts: "performance.now", fungi: 121, verdict: "NEEDS_LANGUAGE" },
  { row: "CONSTANT_TIME_COMPARE", ts: "not-timingSafeEqual", fungi: 100, verdict: "NEEDS_LANGUAGE" },
];

test("F1 frozen kernel.ts executed at dc0f9c8c and packed codes match each row", async () => {
  let frozen;
  let used = PIN;
  try {
    frozen = await loadFrozen(PIN);
  } catch (e1) {
    try {
      frozen = await loadFrozen(PARKED);
      used = PARKED;
    } catch (e2) {
      assert.fail("neither oracle loaded dc=" + String(e1) + " parked=" + String(e2));
    }
  }
  try {
    assert.equal(typeof frozen.mod.createAppKernel, "function");
    const evidence = readFileSync(EVIDENCE, "utf8");
    assert.equal(evidence.includes("oracle " + used), true, "evidence oracle pin");
    let i = 0;
    while (i < ROWS.length) {
      const row = ROWS[i];
      const listed = row.verdict === "PRESERVED" || row.verdict === "INTENDED_DIVERGENCE" || row.verdict === "NEEDS_LANGUAGE" || row.verdict === "UNKNOWN";
      assert.equal(listed, true, row.row + " unlisted verdict");
      const needle = row.row + " | " + String(row.fungi) + " | " + row.verdict;
      assert.equal(evidence.includes(needle), true, "evidence missing " + needle);
      i = i + 1;
    }
    let threw = "no-throw";
    try {
      frozen.mod.createAppKernel({ posture: "weird", routes: [], dispatch: {} });
    } catch {
      threw = "throw";
    }
    assert.equal(threw, "throw");

    const empty = frozen.mod.createAppKernel({ posture: "off", env: "test", routes: [], dispatch: {} });
    const miss = await empty.handle(kernelRequest({ path: "/no-such" }));
    assert.equal(miss.status, 404);
    assert.equal(responseCode(miss), "route_not_found");
    const pathPacked = runFlow("admitMatch", [0, 1, 0, 0, 0, 0]);
    assert.equal(pathPacked.present, true, "path packed present " + pathPacked.reason);
    assert.equal(pathPacked.value, 120);

    const posted = frozen.mod.createAppKernel({
      posture: "off",
      env: "test",
      routes: [{ method: "POST", path: "/auth/verify", handler: "h1" }],
      dispatch: { h1: () => ({ status: 200, body: { ok: true } }) },
    });
    const wrong = await posted.handle(kernelRequest({ method: "GET", path: "/auth/verify" }));
    assert.equal(wrong.status, 405);
    assert.equal(responseCode(wrong), "method_not_allowed");
    const methodPacked = runFlow("admitMatch", [0, 0, 0, 1, 0, 0]);
    assert.equal(methodPacked.present, true, "method packed present " + methodPacked.reason);
    assert.equal(methodPacked.value, 121);

    assert.equal(runFlow("constructKernel", [0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 10000, 0, 256, 0, 60, 0, 0, 0, 1, 0, 0]).value, 112);
    assert.equal(runFlow("applyRate", [0, 0, 0, 10, 0, 1]).value, 128);
    assert.equal(runFlow("getSecretAccess", [0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1]).value, 152);
  } finally {
    rmSync(frozen.dir, { recursive: true, force: true });
  }
});

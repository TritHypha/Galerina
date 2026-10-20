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
  {
    "row": "unknown path",
    "ts": "route_not_found",
    "fungi": 120,
    "verdict": "PRESERVED",
    "exec": "handle",
    "flow": "admitMatch",
    "args": [
      0,
      1,
      0,
      0,
      0,
      0
    ]
  },
  {
    "row": "wrong method",
    "ts": "method_not_allowed",
    "fungi": 121,
    "verdict": "PRESERVED",
    "exec": "handle",
    "flow": "admitMatch",
    "args": [
      0,
      0,
      0,
      1,
      0,
      0
    ]
  },
  {
    "row": "unknown posture throws",
    "ts": "throw",
    "fungi": 112,
    "verdict": "INTENDED_DIVERGENCE",
    "exec": "handle",
    "flow": "constructKernel",
    "args": [
      0,
      3,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      10000,
      0,
      256,
      0,
      60,
      0,
      0,
      0,
      1,
      0,
      0
    ]
  },
  {
    "row": "secret route no provider warns",
    "ts": "boot-warn-then-503",
    "fungi": 118,
    "verdict": "INTENDED_DIVERGENCE",
    "exec": "fungi",
    "flow": "constructKernel",
    "args": [
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      10000,
      0,
      256,
      0,
      60,
      0,
      1,
      0,
      0,
      0,
      0
    ],
    "unknownReason": "TS_BOOT_WARN"
  },
  {
    "row": "rate forward jump resets window",
    "ts": "window-reset",
    "fungi": 128,
    "verdict": "INTENDED_DIVERGENCE",
    "exec": "fungi",
    "flow": "applyRate",
    "args": [
      0,
      0,
      0,
      10,
      0,
      1
    ],
    "unknownReason": "MONOTONIC_TYPED_TIME"
  },
  {
    "row": "ack before audit swallow",
    "ts": "ack-then-503",
    "fungi": 144,
    "verdict": "INTENDED_DIVERGENCE",
    "exec": "fungi",
    "flow": "applyFinalize",
    "args": [
      0,
      1,
      0,
      100,
      0,
      100,
      0,
      106,
      0,
      1,
      0,
      1,
      0,
      1,
      0,
      1,
      0,
      1
    ],
    "unknownReason": "TS_ACK_THEN_AUDIT"
  },
  {
    "row": "getSecret undefined after deadline",
    "ts": "undefined",
    "fungi": 152,
    "verdict": "INTENDED_DIVERGENCE",
    "exec": "fungi",
    "flow": "getSecretAccess",
    "args": [
      0,
      1,
      0,
      1,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      1
    ],
    "unknownReason": "NO_NULL_NAN"
  },
  {
    "row": "deadline armed at dispatch",
    "ts": "dispatch-only",
    "fungi": 147,
    "verdict": "INTENDED_DIVERGENCE",
    "exec": "fungi",
    "flow": "applyClock",
    "args": [
      0,
      7000,
      0,
      1,
      0,
      1000,
      0,
      5000,
      0,
      1,
      0,
      1
    ],
    "unknownReason": "TS_DEADLINE_ARMS_AT_DISPATCH"
  },
  {
    "row": "post-consume success COMMITTED",
    "ts": "200-acked",
    "fungi": 106,
    "verdict": "INTENDED_DIVERGENCE",
    "exec": "fungi",
    "flow": "applyFinalize",
    "args": [
      0,
      1,
      0,
      100,
      0,
      100,
      0,
      100,
      0,
      1,
      0,
      1,
      0,
      1,
      0,
      1,
      0,
      1
    ],
    "unknownReason": "TS_POST_CONSUME_200"
  },
  {
    "row": "MONOTONIC_TYPED_TIME",
    "ts": "performance.now",
    "fungi": 121,
    "verdict": "NEEDS_LANGUAGE",
    "exec": "fungi",
    "flow": "applyClock",
    "args": [
      0,
      1000,
      0,
      0,
      0,
      1000,
      0,
      5000,
      0,
      1,
      0,
      1
    ],
    "unknownReason": "MONOTONIC_TYPED_TIME"
  },
  {
    "row": "CONSTANT_TIME_COMPARE",
    "ts": "not-timingSafeEqual",
    "fungi": 100,
    "verdict": "NEEDS_LANGUAGE",
    "exec": "fungi",
    "flow": "applyDispatch",
    "args": [
      0,
      0
    ],
    "unknownReason": "CONSTANT_TIME_COMPARE"
  },
  {
    "row": "unknown env",
    "ts": "throw",
    "fungi": 113,
    "verdict": "INTENDED_DIVERGENCE",
    "exec": "fungi",
    "flow": "constructKernel",
    "args": [
      0,
      0,
      0,
      2,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      10000,
      0,
      256,
      0,
      60,
      0,
      0,
      0,
      1,
      0,
      0
    ],
    "unknownReason": "TS_ENV_THROW"
  },
  {
    "row": "missing validator",
    "ts": "missing-validator",
    "fungi": 114,
    "verdict": "PRESERVED",
    "exec": "fungi",
    "flow": "constructKernel",
    "args": [
      0,
      0,
      0,
      0,
      0,
      1,
      0,
      1,
      0,
      0,
      0,
      0,
      0,
      10000,
      0,
      256,
      0,
      60,
      0,
      0,
      0,
      1,
      0,
      0
    ],
    "unknownReason": "TS_CONSTRUCTION_FULL"
  },
  {
    "row": "duplicate route",
    "ts": "duplicate",
    "fungi": 115,
    "verdict": "PRESERVED",
    "exec": "fungi",
    "flow": "constructKernel",
    "args": [
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      1,
      0,
      0,
      0,
      10000,
      0,
      256,
      0,
      60,
      0,
      0,
      0,
      1,
      0,
      0
    ],
    "unknownReason": "TS_CONSTRUCTION_FULL"
  },
  {
    "row": "bad rate",
    "ts": "bad-rate",
    "fungi": 116,
    "verdict": "PRESERVED",
    "exec": "fungi",
    "flow": "constructKernel",
    "args": [
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      1,
      0,
      10000,
      0,
      256,
      0,
      60,
      0,
      0,
      0,
      1,
      0,
      0
    ],
    "unknownReason": "TS_CONSTRUCTION_FULL"
  },
  {
    "row": "non-positive capacity",
    "ts": "capacity-0",
    "fungi": 117,
    "verdict": "PRESERVED",
    "exec": "fungi",
    "flow": "constructKernel",
    "args": [
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      256,
      0,
      60,
      0,
      0,
      0,
      1,
      0,
      0
    ],
    "unknownReason": "TS_CONSTRUCTION_FULL"
  },
  {
    "row": "missing intrinsic",
    "ts": "throw",
    "fungi": 119,
    "verdict": "INTENDED_DIVERGENCE",
    "exec": "fungi",
    "flow": "constructKernel",
    "args": [
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      10000,
      0,
      256,
      0,
      60,
      0,
      0,
      0,
      1,
      0,
      1
    ],
    "unknownReason": "TS_INTRINSIC_THROW"
  },
  {
    "row": "policy absent",
    "ts": "no-policy-tag",
    "fungi": 122,
    "verdict": "INTENDED_DIVERGENCE",
    "exec": "fungi",
    "flow": "admitMatch",
    "args": [
      0,
      0,
      0,
      0,
      0,
      1
    ],
    "unknownReason": "TS_NO_POLICY_ABSENT_TAG"
  },
  {
    "row": "body over cap",
    "ts": "payload_too_large",
    "fungi": 123,
    "verdict": "PRESERVED",
    "exec": "fungi",
    "flow": "admitBody",
    "args": [
      0,
      105,
      0,
      0,
      0,
      1
    ],
    "unknownReason": "TS_NEEDS_BODY_STREAM_FIXTURE"
  },
  {
    "row": "content-type mismatch",
    "ts": "unsupported_media_type",
    "fungi": 124,
    "verdict": "PRESERVED",
    "exec": "fungi",
    "flow": "admitBody",
    "args": [
      0,
      100,
      0,
      1,
      0,
      1
    ],
    "unknownReason": "TS_NEEDS_CONTENT_TYPE_FIXTURE"
  },
  {
    "row": "body throw UNKNOWN",
    "ts": "unknown_outcome",
    "fungi": 106,
    "verdict": "INTENDED_DIVERGENCE",
    "exec": "fungi",
    "flow": "admitBody",
    "args": [
      0,
      110,
      0,
      0,
      0,
      1
    ],
    "unknownReason": "TS_NEEDS_BODY_STREAM_FIXTURE"
  },
  {
    "row": "channel deny",
    "ts": "unauthorized",
    "fungi": 125,
    "verdict": "PRESERVED",
    "exec": "fungi",
    "flow": "admitAuth",
    "args": [
      0,
      1,
      0,
      0,
      0,
      0,
      0,
      0
    ],
    "unknownReason": "TS_AUTH_GATE_LIVE_HANDLE"
  },
  {
    "row": "missing scope",
    "ts": "forbidden",
    "fungi": 126,
    "verdict": "PRESERVED",
    "exec": "fungi",
    "flow": "admitAuth",
    "args": [
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      1
    ],
    "unknownReason": "TS_AUTH_GATE_LIVE_HANDLE"
  },
  {
    "row": "rate over",
    "ts": "too_many_requests",
    "fungi": 127,
    "verdict": "PRESERVED",
    "exec": "fungi",
    "flow": "applyRate",
    "args": [
      0,
      10,
      0,
      10,
      0,
      0
    ],
    "unknownReason": "TS_RATE_WINDOW_DATE_NOW"
  },
  {
    "row": "malformed JSON",
    "ts": "malformed_input",
    "fungi": 129,
    "verdict": "PRESERVED",
    "exec": "fungi",
    "flow": "applyDecode",
    "args": [
      0,
      1,
      0,
      1,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0
    ],
    "unknownReason": "TS_DECODE_FULL_HANDLE"
  },
  {
    "row": "JSON null",
    "ts": "malformed_input",
    "fungi": 130,
    "verdict": "PRESERVED",
    "exec": "fungi",
    "flow": "applyDecode",
    "args": [
      0,
      1,
      0,
      0,
      0,
      1,
      0,
      0,
      0,
      0,
      0,
      0
    ],
    "unknownReason": "NO_NULL_NAN"
  },
  {
    "row": "duplicate JSON keys",
    "ts": "malformed_input",
    "fungi": 131,
    "verdict": "PRESERVED",
    "exec": "fungi",
    "flow": "applyDecode",
    "args": [
      0,
      1,
      0,
      0,
      0,
      0,
      0,
      1,
      0,
      0,
      0,
      0
    ],
    "unknownReason": "TS_DECODE_FULL_HANDLE"
  },
  {
    "row": "unknown field",
    "ts": "malformed_input",
    "fungi": 132,
    "verdict": "PRESERVED",
    "exec": "fungi",
    "flow": "applyDecode",
    "args": [
      0,
      1,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      1,
      0,
      0
    ],
    "unknownReason": "TS_DECODE_FULL_HANDLE"
  },
  {
    "row": "memory budget",
    "ts": "service_unavailable",
    "fungi": 133,
    "verdict": "PRESERVED",
    "exec": "fungi",
    "flow": "applyBudget",
    "args": [
      0,
      16385,
      0,
      16384
    ],
    "unknownReason": "TS_MEMORY_BUDGET_FULL_HANDLE"
  },
  {
    "row": "concurrency over",
    "ts": "too_many_requests",
    "fungi": 134,
    "verdict": "PRESERVED",
    "exec": "fungi",
    "flow": "applyConcurrency",
    "args": [
      0,
      4,
      0,
      4,
      0,
      1,
      0,
      0
    ],
    "unknownReason": "TS_CONCURRENCY_FULL_HANDLE"
  },
  {
    "row": "slot not released",
    "ts": "held-slot",
    "fungi": 159,
    "verdict": "INTENDED_DIVERGENCE",
    "exec": "fungi",
    "flow": "applyConcurrency",
    "args": [
      0,
      0,
      0,
      4,
      0,
      0,
      0,
      0
    ],
    "unknownReason": "LINEAR_SECRET"
  },
  {
    "row": "deadline handler still running is held-slot",
    "ts": "keeps-slot",
    "fungi": 159,
    "verdict": "INTENDED_DIVERGENCE",
    "exec": "fungi",
    "flow": "applyConcurrency",
    "args": [
      0,
      0,
      0,
      4,
      0,
      0,
      0,
      1
    ],
    "unknownReason": "LINEAR_SECRET"
  },
  {
    "row": "clock missing",
    "ts": "unknown_outcome",
    "fungi": 121,
    "verdict": "INTENDED_DIVERGENCE",
    "exec": "fungi",
    "flow": "applyClock",
    "args": [
      0,
      1000,
      0,
      0,
      0,
      1000,
      0,
      5000,
      0,
      1,
      0,
      1
    ],
    "unknownReason": "MONOTONIC_TYPED_TIME"
  },
  {
    "row": "clock backwards",
    "ts": "unknown_outcome",
    "fungi": 122,
    "verdict": "INTENDED_DIVERGENCE",
    "exec": "fungi",
    "flow": "applyClock",
    "args": [
      0,
      999,
      0,
      1,
      0,
      1000,
      0,
      5000,
      0,
      1,
      0,
      1
    ],
    "unknownReason": "MONOTONIC_TYPED_TIME"
  },
  {
    "row": "clock epoch mismatch",
    "ts": "unknown_outcome",
    "fungi": 123,
    "verdict": "INTENDED_DIVERGENCE",
    "exec": "fungi",
    "flow": "applyClock",
    "args": [
      0,
      1000,
      0,
      1,
      0,
      1000,
      0,
      5000,
      0,
      1,
      0,
      2
    ],
    "unknownReason": "MONOTONIC_TYPED_TIME"
  },
  {
    "row": "armedAt+budget overflow",
    "ts": "unknown_outcome",
    "fungi": 151,
    "verdict": "INTENDED_DIVERGENCE",
    "exec": "fungi",
    "flow": "applyClock",
    "args": [
      0,
      2147483647,
      0,
      1,
      0,
      2147483647,
      0,
      1,
      0,
      1,
      0,
      1
    ],
    "unknownReason": "BOUNDED_INPUT"
  },
  {
    "row": "caller mint",
    "ts": "predictable-mint-ok",
    "fungi": 137,
    "verdict": "INTENDED_DIVERGENCE",
    "exec": "fungi",
    "flow": "mintOperation",
    "args": [
      0,
      1,
      0,
      1,
      0,
      1,
      0,
      1,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      1,
      0,
      0
    ],
    "unknownReason": "TS_EMPTY_STRING_MINT"
  },
  {
    "row": "mint capability absent",
    "ts": "mint-ok",
    "fungi": 136,
    "verdict": "INTENDED_DIVERGENCE",
    "exec": "fungi",
    "flow": "mintOperation",
    "args": [
      0,
      0,
      0,
      0,
      0,
      1,
      0,
      1,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      1,
      0,
      0
    ],
    "unknownReason": "UNFORGEABLE_CAPABILITY"
  },
  {
    "row": "secret unavailable",
    "ts": "secret_unavailable",
    "fungi": 135,
    "verdict": "PRESERVED",
    "exec": "fungi",
    "flow": "applySecrets",
    "args": [
      0,
      1,
      0,
      0,
      0,
      1,
      0,
      1,
      0,
      1,
      0,
      1,
      0,
      1,
      0,
      1,
      0,
      1
    ],
    "unknownReason": "TS_SECRET_ADMIT_NOT_HAS"
  },
  {
    "row": "mintedOp bind mismatch",
    "ts": "bind-ok",
    "fungi": 135,
    "verdict": "INTENDED_DIVERGENCE",
    "exec": "fungi",
    "flow": "applySecrets",
    "args": [
      0,
      1,
      0,
      1,
      0,
      0,
      0,
      1,
      0,
      1,
      0,
      1,
      0,
      2,
      0,
      1,
      0,
      1
    ],
    "unknownReason": "UNFORGEABLE_CAPABILITY"
  },
  {
    "row": "idempotency missing key",
    "ts": "conflict",
    "fungi": 138,
    "verdict": "PRESERVED",
    "exec": "fungi",
    "flow": "applyIdempotency",
    "args": [
      0,
      1,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      60,
      0,
      1
    ],
    "unknownReason": "TS_IDEMP_FULL_HANDLE"
  },
  {
    "row": "duplicate key",
    "ts": "conflict",
    "fungi": 139,
    "verdict": "PRESERVED",
    "exec": "fungi",
    "flow": "applyIdempotency",
    "args": [
      0,
      1,
      0,
      2,
      0,
      0,
      0,
      1,
      0,
      60,
      0,
      0
    ],
    "unknownReason": "TS_IDEMP_FULL_HANDLE"
  },
  {
    "row": "store full",
    "ts": "conflict",
    "fungi": 140,
    "verdict": "PRESERVED",
    "exec": "fungi",
    "flow": "applyIdempotency",
    "args": [
      0,
      1,
      0,
      3,
      0,
      0,
      0,
      1,
      0,
      60,
      0,
      0
    ],
    "unknownReason": "TS_IDEMP_FULL_HANDLE"
  },
  {
    "row": "store throw",
    "ts": "unknown_outcome",
    "fungi": 106,
    "verdict": "INTENDED_DIVERGENCE",
    "exec": "fungi",
    "flow": "applyIdempotency",
    "args": [
      0,
      1,
      0,
      4,
      0,
      0,
      0,
      1,
      0,
      60,
      0,
      0
    ],
    "unknownReason": "TOTAL_EFFECT_OUTCOME"
  },
  {
    "row": "retry after dispatch",
    "ts": "replay",
    "fungi": 106,
    "verdict": "INTENDED_DIVERGENCE",
    "exec": "fungi",
    "flow": "applyIdempotency",
    "args": [
      0,
      1,
      0,
      1,
      0,
      1,
      0,
      1,
      0,
      60,
      0,
      0
    ],
    "unknownReason": "TOTAL_EFFECT_OUTCOME"
  },
  {
    "row": "post-dispatch cancel",
    "ts": "deleted",
    "fungi": 143,
    "verdict": "INTENDED_DIVERGENCE",
    "exec": "fungi",
    "flow": "applyIdempotency",
    "args": [
      0,
      1,
      0,
      1,
      0,
      0,
      0,
      1,
      0,
      60,
      0,
      1
    ],
    "unknownReason": "TOTAL_EFFECT_OUTCOME"
  },
  {
    "row": "handler throw",
    "ts": "unknown_outcome",
    "fungi": 106,
    "verdict": "INTENDED_DIVERGENCE",
    "exec": "fungi",
    "flow": "applyDispatch",
    "args": [
      0,
      1
    ],
    "unknownReason": "TOTAL_EFFECT_OUTCOME"
  },
  {
    "row": "handler never settles",
    "ts": "deadline_exceeded",
    "fungi": 147,
    "verdict": "PRESERVED",
    "exec": "fungi",
    "flow": "applyDispatch",
    "args": [
      0,
      2
    ],
    "unknownReason": "DEADLINE_COVERS_ALL"
  },
  {
    "row": "unlisted handler shape",
    "ts": "no-shape-tag",
    "fungi": 111,
    "verdict": "INTENDED_DIVERGENCE",
    "exec": "fungi",
    "flow": "applyDispatch",
    "args": [
      0,
      3
    ],
    "unknownReason": "EXHAUSTIVE_FAIL_CLOSED"
  },
  {
    "row": "revoke first",
    "ts": "revoke-before-release",
    "fungi": 102,
    "verdict": "PRESERVED",
    "exec": "fungi",
    "flow": "applyConsume",
    "args": [
      0,
      1,
      0,
      1,
      0,
      1,
      0,
      0,
      0,
      1,
      0,
      1,
      0,
      1,
      0,
      1,
      0,
      0,
      0,
      1,
      0,
      1
    ],
    "unknownReason": "P24-R1"
  },
  {
    "row": "unspent listed dispatch after audit",
    "ts": "200",
    "fungi": 100,
    "verdict": "INTENDED_DIVERGENCE",
    "exec": "fungi",
    "flow": "applyFinalize",
    "args": [
      0,
      0,
      0,
      100,
      0,
      0,
      0,
      100,
      0,
      1,
      0,
      1,
      0,
      1,
      0,
      1,
      0,
      1
    ],
    "unknownReason": "TS_UNSPENT_UNCHECKED"
  },
  {
    "row": "audit failed ack not recorded",
    "ts": "ack-then-503",
    "fungi": 144,
    "verdict": "INTENDED_DIVERGENCE",
    "exec": "fungi",
    "flow": "applyFinalize",
    "args": [
      0,
      1,
      0,
      100,
      0,
      100,
      0,
      106,
      0,
      1,
      0,
      1,
      0,
      1,
      0,
      1,
      0,
      1
    ],
    "unknownReason": "TS_ACK_THEN_AUDIT"
  },
  {
    "row": "recovery unlisted",
    "ts": "no-unlisted-recovery",
    "fungi": 138,
    "verdict": "INTENDED_DIVERGENCE",
    "exec": "fungi",
    "flow": "recoverLease",
    "args": [
      0,
      1,
      0,
      0,
      0,
      0,
      0,
      9
    ],
    "unknownReason": "EXHAUSTIVE_FAIL_CLOSED"
  },
  {
    "row": "HTTP default 503",
    "ts": "undefined-map",
    "fungi": 503,
    "verdict": "PRESERVED",
    "exec": "fungi",
    "flow": "httpStatusFor",
    "args": [
      0,
      999
    ],
    "unknownReason": "TS_HTTP_MAP_ON_STRING_CODE"
  },
  {
    "row": "HTTP 144",
    "ts": "503",
    "fungi": 503,
    "verdict": "PRESERVED",
    "exec": "fungi",
    "flow": "httpStatusFor",
    "args": [
      0,
      144
    ],
    "unknownReason": "TS_HTTP_MAP_ON_STRING_CODE"
  },
  {
    "row": "HTTP 159",
    "ts": "503",
    "fungi": 503,
    "verdict": "PRESERVED",
    "exec": "fungi",
    "flow": "httpStatusFor",
    "args": [
      0,
      159
    ],
    "unknownReason": "TS_HTTP_MAP_ON_STRING_CODE"
  },
  {
    "row": "composed pre-dispatch path refusal",
    "ts": "route_not_found",
    "fungi": 120,
    "verdict": "PRESERVED",
    "exec": "fungi",
    "flow": "runPreDispatch",
    "args": [
      120,
      100,
      100,
      100,
      100,
      100,
      100,
      100,
      100,
      100,
      0,
      1000,
      0,
      1,
      0,
      1000,
      0,
      5000,
      0,
      1,
      0,
      1,
      0,
      1
    ],
    "unknownReason": "TS_HANDLE_IS_FULL_PIPELINE"
  },
  {
    "row": "composed deadline",
    "ts": "deadline_exceeded",
    "fungi": 147,
    "verdict": "INTENDED_DIVERGENCE",
    "exec": "fungi",
    "flow": "runPreDispatch",
    "args": [
      100,
      100,
      100,
      100,
      100,
      100,
      100,
      100,
      100,
      100,
      0,
      7000,
      0,
      1,
      0,
      1000,
      0,
      5000,
      0,
      1,
      0,
      1,
      0,
      0
    ],
    "unknownReason": "TS_DEADLINE_ARMS_AT_DISPATCH"
  },
  {
    "row": "composed post deadline",
    "ts": "deadline_exceeded",
    "fungi": 147,
    "verdict": "INTENDED_DIVERGENCE",
    "exec": "fungi",
    "flow": "runPostDispatch",
    "args": [
      0,
      7000,
      0,
      1,
      0,
      1000,
      0,
      5000,
      0,
      1,
      0,
      1,
      0,
      1,
      0,
      100,
      0,
      100,
      0,
      100,
      0,
      1,
      0,
      1,
      0,
      1,
      0,
      1,
      0,
      1,
      0,
      0,
      0,
      4,
      0,
      1,
      0,
      0
    ],
    "unknownReason": "TS_DEADLINE_ARMS_AT_DISPATCH"
  },
  {
    "row": "PQ hybrid AND",
    "ts": "classical",
    "fungi": 106,
    "verdict": "NEEDS_LANGUAGE",
    "exec": "fungi",
    "flow": "applyFinalize",
    "args": [
      0,
      1,
      0,
      100,
      0,
      100,
      0,
      100,
      0,
      1,
      0,
      1,
      0,
      1,
      0,
      1,
      0,
      1
    ],
    "unknownReason": "hybrid AND"
  },
  {
    "row": "HOST_ADAPTER_PRESENCE",
    "ts": "classTag",
    "fungi": 110,
    "verdict": "UNKNOWN",
    "exec": "fungi",
    "flow": "admitMatch",
    "args": [
      3,
      0,
      0,
      0,
      0,
      0
    ],
    "unknownReason": "HOST_ADAPTER_PRESENCE"
  },
  {
    "row": "MB-06 listed cleanup",
    "ts": "cleanup-pending",
    "fungi": 106,
    "verdict": "UNKNOWN",
    "exec": "fungi",
    "flow": "applyConsume",
    "args": [
      0,
      1,
      0,
      1,
      0,
      1,
      0,
      0,
      0,
      0,
      0,
      2,
      0,
      1,
      0,
      1,
      0,
      0,
      0,
      1,
      0,
      1
    ],
    "unknownReason": "MB-06 CARRIED_UNKNOWN"
  },
  {
    "row": "skip-one-wipe",
    "ts": "wipe-outside",
    "fungi": 100,
    "verdict": "UNKNOWN",
    "exec": "fungi",
    "flow": "applyDispatch",
    "args": [
      0,
      0
    ],
    "unknownReason": "WIPE_OUTSIDE_UNIT"
  },
  {
    "row": "Addendum D OPEN ordering",
    "ts": "open-items",
    "fungi": 106,
    "verdict": "UNKNOWN",
    "exec": "fungi",
    "flow": "applyFinalize",
    "args": [
      0,
      1,
      0,
      100,
      0,
      100,
      0,
      100,
      0,
      1,
      0,
      1,
      0,
      1,
      0,
      1,
      0,
      1
    ],
    "unknownReason": "TOTAL_EFFECT_OUTCOME"
  },
  {
    "row": "captured JS intrinsics",
    "ts": "host-adapter",
    "fungi": 119,
    "verdict": "UNKNOWN",
    "exec": "fungi",
    "flow": "constructKernel",
    "args": [
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      10000,
      0,
      256,
      0,
      60,
      0,
      0,
      0,
      1,
      0,
      1
    ],
    "unknownReason": "SEALED_INTRINSICS"
  }
];

test("F5 frozen TS and flattened fungi executed for every parity row or UNKNOWN with typed reason", async () => {
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
  const flat = flattenUnit();
  try {
    assert.equal(typeof frozen.mod.createAppKernel, "function");
    const evidence = readFileSync(EVIDENCE, "utf8");
    assert.equal(evidence.includes("oracle " + used), true, "evidence oracle pin");
    const parity = readFileSync(join(MEM, "evidence", "36-app-kernel", "parity.md"), "utf8");
    assert.equal(parity.includes("## Frozen TS 20 createAppKernel files"), true, "20-file map");
    assert.equal(parity.includes("## Frozen TS 242 cases"), true, "242-case map");
    const caseBlock = parity.slice(parity.indexOf("## Frozen TS 242 cases"));
    const caseRows = caseBlock.split("\n").filter((l) => /^\| [0-9]/.test(l));
    assert.equal(caseRows.length, 242, "242-case table rows " + String(caseRows.length));
    const fileBlock = parity.slice(parity.indexOf("## Frozen TS 20 createAppKernel files"), parity.indexOf("## Frozen TS 242 cases"));
    const fileRows = fileBlock.split("\n").filter((l) => /^\| [0-9]/.test(l));
    assert.equal(fileRows.length, 20, "20-file table rows " + String(fileRows.length));
    const listed = spawnSync("git", ["ls-tree", "-r", "--name-only", PIN], { cwd: REPO, encoding: "utf8" }).stdout.split("\n");
    const kernelTests = listed.filter((p) => p.startsWith("packages-ts/galerina-framework-app-kernel/tests/") && p.endsWith(".test.mjs"));
    let createHits = 0;
    let ki = 0;
    while (ki < kernelTests.length) {
      const shown = spawnSync("git", ["show", PIN + ":" + kernelTests[ki]], { cwd: REPO, encoding: "utf8", maxBuffer: 2_000_000 });
      if (shown.stdout.includes("createAppKernel") === true) {
        createHits = createHits + 1;
      }
      ki = ki + 1;
    }
    assert.equal(createHits, 20, "createAppKernel file count " + String(createHits));

    let i = 0;
    while (i < ROWS.length) {
      const row = ROWS[i];
      const listedVerdict = row.verdict === "PRESERVED" || row.verdict === "INTENDED_DIVERGENCE" || row.verdict === "NEEDS_LANGUAGE" || row.verdict === "UNKNOWN";
      assert.equal(listedVerdict, true, row.row + " unlisted verdict");
      const needle = row.row + " | " + String(row.fungi) + " | " + row.verdict;
      assert.equal(evidence.includes(needle), true, "evidence missing " + needle);
      if (row.exec === "handle") {
        assert.equal(row.unknownReason === undefined, true, row.row + " live TS row must not carry unknownReason");
      } else {
        assert.equal(typeof row.unknownReason, "string", row.row + " needs typed reason");
        assert.equal(row.unknownReason.length > 0, true, row.row + " empty reason");
        assert.equal(evidence.includes(row.unknownReason), true, "evidence missing reason " + row.unknownReason);
      }
      const fungi = invoke(flat.file, row.flow, row.args);
      assert.equal(fungi.status, 0, row.row + " fungi status " + (fungi.text || "").slice(-200));
      assert.equal(fungi.present, true, row.row + " fungi absent " + fungi.reason);
      assert.equal(fungi.value, row.fungi, row.row + " fungi packed");
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

    const posted = frozen.mod.createAppKernel({
      posture: "off",
      env: "test",
      routes: [{ method: "POST", path: "/auth/verify", handler: "h1" }],
      dispatch: { h1: () => ({ status: 200, body: { ok: true } }) },
    });
    const wrong = await posted.handle(kernelRequest({ method: "GET", path: "/auth/verify" }));
    assert.equal(wrong.status, 405);
    assert.equal(responseCode(wrong), "method_not_allowed");
  } finally {
    rmSync(flat.dir, { recursive: true, force: true });
    rmSync(frozen.dir, { recursive: true, force: true });
  }
});

test("F5 parity.md maps 20 createAppKernel files and 242 cases", () => {
  const parity = readFileSync(join(MEM, "evidence", "36-app-kernel", "parity.md"), "utf8");
  const fileBlock = parity.slice(parity.indexOf("## Frozen TS 20 createAppKernel files"), parity.indexOf("## Frozen TS 242 cases"));
  const fileRows = fileBlock.split("\n").filter((l) => /^\| [0-9]/.test(l));
  assert.equal(fileRows.length, 20, "20-file table rows " + String(fileRows.length));
  const caseBlock = parity.slice(parity.indexOf("## Frozen TS 242 cases"));
  const caseRows = caseBlock.split("\n").filter((l) => /^\| [0-9]/.test(l));
  assert.equal(caseRows.length, 242, "242-case table rows " + String(caseRows.length));
  assert.equal(parity.includes("rd1415-ack-after-publication-audit"), true, "ack-after-publication listed");
  assert.equal(parity.includes("rd1415-ack-downgrade"), true, "ack-downgrade listed");
  assert.equal(parity.includes("rd1415-ack-throw-fail-closed"), true, "ack-throw listed");
});

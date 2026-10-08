import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { QUEUE_JOB_CONTRACT_SCHEMA } from "../dist/queue-job-contract.js";
import { RUNTIME_AUDIT_REPORT_FORMAT_SCHEMA } from "../dist/runtime-audit-report-format.js";
import { STRUCTURED_AWAIT_POLICY_SCHEMA } from "../dist/structured-await-policy.js";
import {
  CORE_RUNTIME_ALLOWED_EFFECTS,
  CORE_RUNTIME_EFFECT_POLICY_FIELDS,
  CORE_RUNTIME_EXECUTOR_BINDINGS,
  CORE_RUNTIME_HANDOFF_FIELDS,
  CORE_RUNTIME_HANDOFF_SCHEMA,
  CORE_RUNTIME_OMITTED_SEAM_FIELDS,
  CORE_RUNTIME_SEAM_VERSION,
  FUNGI_APPK_CRH_001,
  FUNGI_APPK_CRH_002,
  FUNGI_APPK_CRH_003,
  FUNGI_APPK_CRH_004,
  FUNGI_APPK_CRH_005,
  checkCoreRuntimeHandoff,
  createCoreRuntimeHandoff,
  readCoreRuntimeHandoff,
} from "../dist/core-runtime-handoff-contract.js";

function effects(overrides = {}) {
  return {
    allowedEffects: ["clock", "random"],
    denyProcessEffects: true,
    requireExplicitNetworkPermission: true,
    ...overrides,
  };
}

function baseHandoff(overrides = {}) {
  return {
    schema: CORE_RUNTIME_HANDOFF_SCHEMA,
    name: "KernelRuntimeHandoff",
    seamVersion: CORE_RUNTIME_SEAM_VERSION,
    executorBinding: "deny_all",
    effectPolicy: effects(),
    structuredAwait: STRUCTURED_AWAIT_POLICY_SCHEMA,
    queueJob: QUEUE_JOB_CONTRACT_SCHEMA,
    audit: RUNTIME_AUDIT_REPORT_FORMAT_SCHEMA,
    ...overrides,
  };
}

function codes(r) {
  if ("diagnostics" in r && Array.isArray(r.diagnostics)) return r.diagnostics.map((d) => d.code);
  return [];
}

describe("core-runtime handoff contract - pinned to shipped siblings", () => {
  it("mirrors GOVERNED_RUNTIME_SEAM_VERSION from core-runtime source without a package import", () => {
    const runtime = readFileSync(new URL("../../galerina-core-runtime/src/index.ts", import.meta.url), "utf8");
    const m = runtime.match(/export const GOVERNED_RUNTIME_SEAM_VERSION = "([^"]+)";/);
    assert.ok(m, "core-runtime declares GOVERNED_RUNTIME_SEAM_VERSION");
    assert.equal(m[1], CORE_RUNTIME_SEAM_VERSION);
    assert.equal(CORE_RUNTIME_SEAM_VERSION, "galerina.runtime.seam.v1");
  });

  it("mirrors DEFAULT_RUNTIME_EFFECT_POLICY from core-runtime source", () => {
    const runtime = readFileSync(new URL("../../galerina-core-runtime/src/index.ts", import.meta.url), "utf8");
    const start = runtime.indexOf("export const DEFAULT_RUNTIME_EFFECT_POLICY");
    assert.ok(start >= 0);
    const block = runtime.slice(start, runtime.indexOf("};", start) + 2);
    assert.match(block, /allowedEffects:\s*\[\s*"clock"\s*,\s*"random"\s*\]/);
    assert.match(block, /denyProcessEffects:\s*true/);
    assert.match(block, /requireExplicitNetworkPermission:\s*true/);
    assert.deepEqual([...CORE_RUNTIME_ALLOWED_EFFECTS], ["clock", "random"]);
  });

  it("omits GovernedRuntimeRequest / RuntimeContext fields that exist on the producer seam", () => {
    const runtime = readFileSync(new URL("../../galerina-core-runtime/src/index.ts", import.meta.url), "utf8");
    assert.match(runtime, /export interface GovernedRuntimeRequest/);
    assert.match(runtime, /readonly artifactSha256:/);
    assert.match(runtime, /readonly attestation:/);
    assert.match(runtime, /readonly exportName:/);
    assert.match(runtime, /readonly args:/);
    assert.match(runtime, /export interface RuntimeContext/);
    const handoff = new Set(CORE_RUNTIME_HANDOFF_FIELDS);
    for (const field of CORE_RUNTIME_OMITTED_SEAM_FIELDS) {
      assert.equal(handoff.has(field), false, field);
      assert.match(runtime, new RegExp(field));
    }
  });

  it("app-kernel package.json has no core-runtime dependency", () => {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    assert.equal(Object.hasOwn(pkg.dependencies ?? {}, "@galerina/core-runtime"), false);
    assert.equal(Object.hasOwn(pkg.devDependencies ?? {}, "@galerina/core-runtime"), false);
    assert.deepEqual(Object.keys(pkg.dependencies), ["@galerina/core-config", "@galerina/tower-citizen"]);
  });

  it("kernel.ts does not import or name the governed-runtime seam", () => {
    const kernel = readFileSync(new URL("../src/kernel.ts", import.meta.url), "utf8");
    assert.equal(/core-runtime|bindGovernedRuntime|GOVERNED_RUNTIME|GovernedRuntimeRequest/.test(kernel), false);
    const start = kernel.indexOf("export interface CreateAppKernelOptions");
    assert.ok(start >= 0);
    const block = kernel.slice(start, kernel.indexOf("\n}", start));
    assert.equal(/executor|seamVersion|artifactSha256/.test(block), false);
  });

  it("effect-policy field list is closed", () => {
    assert.deepEqual([...CORE_RUNTIME_EFFECT_POLICY_FIELDS], [
      "allowedEffects",
      "denyProcessEffects",
      "requireExplicitNetworkPermission",
    ]);
    assert.deepEqual([...CORE_RUNTIME_EXECUTOR_BINDINGS], ["deny_all"]);
  });
});

describe("createCoreRuntimeHandoff / readCoreRuntimeHandoff / checkCoreRuntimeHandoff", () => {
  it("admits a closed deny-all handoff that references SAW / QJC / RAR", () => {
    const result = readCoreRuntimeHandoff(baseHandoff({ diagnostics: [] }));
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.value.schema, CORE_RUNTIME_HANDOFF_SCHEMA);
    assert.equal(result.value.name, "KernelRuntimeHandoff");
    assert.equal(result.value.seamVersion, CORE_RUNTIME_SEAM_VERSION);
    assert.equal(result.value.executorBinding, "deny_all");
    assert.deepEqual([...result.value.effectPolicy.allowedEffects], ["clock", "random"]);
    assert.equal(result.value.effectPolicy.denyProcessEffects, true);
    assert.equal(result.value.effectPolicy.requireExplicitNetworkPermission, true);
    assert.equal(result.value.structuredAwait, STRUCTURED_AWAIT_POLICY_SCHEMA);
    assert.equal(result.value.queueJob, QUEUE_JOB_CONTRACT_SCHEMA);
    assert.equal(result.value.audit, RUNTIME_AUDIT_REPORT_FORMAT_SCHEMA);
    assert.equal(result.value.diagnostics.length, 0);
    assert.equal(Object.isFrozen(result.value), true);
    assert.equal(Object.isFrozen(result.value.effectPolicy), true);
    assert.deepEqual(checkCoreRuntimeHandoff(baseHandoff()), { ok: true, schema: CORE_RUNTIME_HANDOFF_SCHEMA });
  });

  it("is a data check, not an admission", () => {
    const r = checkCoreRuntimeHandoff(baseHandoff());
    assert.equal(r.ok, true);
    assert.equal("admit" in r || "allow" in r, false);
  });

  it("refuses getters, proxies, symbols, custom prototypes and unknown keys without echo", () => {
    const hostile = baseHandoff();
    let ran = false;
    Object.defineProperty(hostile, "secret", {
      get() {
        ran = true;
        throw new Error("getter-ran");
      },
      enumerable: true,
    });
    const fromGetter = createCoreRuntimeHandoff(hostile);
    assert.equal(ran, false);
    assert.equal(fromGetter.diagnostics[0]?.code, FUNGI_APPK_CRH_001);
    assert.equal(fromGetter.diagnostics.some((d) => /getter|secret/i.test(d.message)), false);

    assert.equal(createCoreRuntimeHandoff(new Proxy(baseHandoff(), {})).diagnostics[0]?.code, FUNGI_APPK_CRH_001);

    const withSymbol = { ...baseHandoff(), [Symbol("x")]: 1 };
    assert.equal(createCoreRuntimeHandoff(withSymbol).diagnostics[0]?.code, FUNGI_APPK_CRH_001);

    const proto = Object.assign(Object.create({ inherited: true }), baseHandoff());
    assert.equal(createCoreRuntimeHandoff(proto).diagnostics[0]?.code, FUNGI_APPK_CRH_001);

    const unknownKey = createCoreRuntimeHandoff({ ...baseHandoff(), extra: "nope" });
    assert.equal(unknownKey.diagnostics[0]?.code, FUNGI_APPK_CRH_001);
    assert.equal(unknownKey.diagnostics.some((d) => d.message.includes("extra")), false);

    const nestedUnknown = createCoreRuntimeHandoff(baseHandoff({ effectPolicy: { ...effects(), unlimited: true } }));
    assert.equal(nestedUnknown.diagnostics[0]?.code, FUNGI_APPK_CRH_004);
    assert.equal(nestedUnknown.diagnostics.some((d) => d.message.includes("unlimited")), false);

    for (const bad of [null, undefined, 42, "handoff", [baseHandoff()]]) {
      assert.equal(createCoreRuntimeHandoff(bad).diagnostics[0]?.code, FUNGI_APPK_CRH_001);
    }
  });

  it("refuses relaxed schema / seam / executor / name tokens without echo", () => {
    const schema = createCoreRuntimeHandoff(baseHandoff({ schema: "galerina.app-kernel.core-runtime-handoff/v2" }));
    assert.equal(schema.diagnostics[0]?.code, FUNGI_APPK_CRH_002);
    assert.equal(schema.diagnostics[0]?.message.includes("v2"), false);

    const seam = createCoreRuntimeHandoff(baseHandoff({ seamVersion: "galerina.runtime.seam.v0" }));
    assert.equal(seam.diagnostics[0]?.code, FUNGI_APPK_CRH_002);
    assert.equal(seam.diagnostics[0]?.message.includes("v0"), false);

    const live = createCoreRuntimeHandoff(baseHandoff({ executorBinding: "live" }));
    assert.equal(live.diagnostics[0]?.code, FUNGI_APPK_CRH_002);
    assert.equal(live.diagnostics[0]?.message.includes("live"), false);

    const name = createCoreRuntimeHandoff(baseHandoff({ name: "../etc/passwd" }));
    assert.equal(name.diagnostics[0]?.code, FUNGI_APPK_CRH_002);
    assert.equal(name.diagnostics.some((d) => d.message.includes("passwd")), false);
  });

  it("refuses widened effect policy without echo", () => {
    const fs = createCoreRuntimeHandoff(
      baseHandoff({ effectPolicy: effects({ allowedEffects: ["clock", "filesystem"] }) }),
    );
    assert.equal(fs.diagnostics[0]?.code, FUNGI_APPK_CRH_002);
    assert.equal(fs.diagnostics.some((d) => d.message.includes("filesystem")), false);

    const unsorted = createCoreRuntimeHandoff(
      baseHandoff({ effectPolicy: effects({ allowedEffects: ["random", "clock"] }) }),
    );
    assert.equal(unsorted.diagnostics[0]?.code, FUNGI_APPK_CRH_002);

    const short = createCoreRuntimeHandoff(baseHandoff({ effectPolicy: effects({ allowedEffects: ["clock"] }) }));
    assert.equal(short.diagnostics[0]?.code, FUNGI_APPK_CRH_003);

    const long = createCoreRuntimeHandoff(
      baseHandoff({ effectPolicy: effects({ allowedEffects: ["clock", "random", "network"] }) }),
    );
    assert.equal(long.diagnostics[0]?.code, FUNGI_APPK_CRH_004);

    const process = createCoreRuntimeHandoff(baseHandoff({ effectPolicy: effects({ denyProcessEffects: false }) }));
    assert.equal(process.diagnostics[0]?.code, FUNGI_APPK_CRH_002);
    assert.equal(process.diagnostics[0]?.field, "denyProcessEffects");

    const net = createCoreRuntimeHandoff(
      baseHandoff({ effectPolicy: effects({ requireExplicitNetworkPermission: false }) }),
    );
    assert.equal(net.diagnostics[0]?.code, FUNGI_APPK_CRH_002);

    assert.equal(createCoreRuntimeHandoff(baseHandoff({ effectPolicy: [] })).diagnostics[0]?.code, FUNGI_APPK_CRH_004);
  });

  it("refuses nested copies of SAW / QJC / RAR instead of schema-token references", () => {
    const nestedSaw = createCoreRuntimeHandoff(baseHandoff({ structuredAwait: { schema: STRUCTURED_AWAIT_POLICY_SCHEMA } }));
    assert.equal(nestedSaw.diagnostics[0]?.code, FUNGI_APPK_CRH_002);
    assert.equal(nestedSaw.diagnostics[0]?.field, "structuredAwait");

    const wrongQjc = createCoreRuntimeHandoff(baseHandoff({ queueJob: "galerina.app-kernel.queue-job-contract/v2" }));
    assert.equal(wrongQjc.diagnostics[0]?.code, FUNGI_APPK_CRH_002);

    const wrongAudit = createCoreRuntimeHandoff(baseHandoff({ audit: "galerina.app-kernel.runtime-audit-report-format/v2" }));
    assert.equal(wrongAudit.diagnostics[0]?.code, FUNGI_APPK_CRH_002);
  });

  it("refuses non-empty input diagnostics and missing required fields", () => {
    const nonempty = createCoreRuntimeHandoff(
      baseHandoff({
        diagnostics: [{ code: FUNGI_APPK_CRH_001, severity: "error", message: "preloaded", field: "record" }],
      }),
    );
    assert.equal(nonempty.diagnostics[0]?.code, FUNGI_APPK_CRH_005);

    const { name: _drop, ...missing } = baseHandoff();
    assert.equal(createCoreRuntimeHandoff(missing).diagnostics[0]?.code, FUNGI_APPK_CRH_001);

    const check = checkCoreRuntimeHandoff(missing);
    assert.equal(check.ok, false);
    assert.equal(check.schema, CORE_RUNTIME_HANDOFF_SCHEMA);
    assert.deepEqual(codes(check), [FUNGI_APPK_CRH_001]);
  });
});

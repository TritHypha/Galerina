import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  FUNGI_APPK_QJC_001,
  FUNGI_APPK_QJC_002,
  FUNGI_APPK_QJC_003,
  FUNGI_APPK_QJC_004,
  FUNGI_APPK_QJC_005,
  QUEUE_JOB_CONTRACT_SCHEMA,
  createQueueJobContract,
  readQueueJobContract,
} from "../dist/queue-job-contract.js";

function retry(overrides = {}) {
  return {
    maxAttempts: 3,
    backoff: "exponential",
    initialDelayMs: 1000,
    maxDelayMs: 60000,
    ...overrides,
  };
}

function job(overrides = {}) {
  return {
    id: "transcode-video",
    queue: "media",
    payloadType: "VideoJob",
    maxPayloadBytes: 4096,
    timeoutMs: 120000,
    retry: retry(),
    audit: "required",
    ...overrides,
  };
}

function baseContract(overrides = {}) {
  return {
    schema: QUEUE_JOB_CONTRACT_SCHEMA,
    name: "MediaJobs",
    defaultDecision: "deny",
    admittedQueues: ["email", "media"],
    jobs: [
      job({ id: "send-receipt", queue: "email", payloadType: "ReceiptEmail", retry: retry({ backoff: "fixed", maxDelayMs: 1000 }) }),
      job(),
    ],
    ...overrides,
  };
}

function hasNoHoles(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(hasNoHoles);
  if (typeof value === "object") return Object.values(value).every(hasNoHoles);
  return true;
}

describe("app-kernel queue/job contract", () => {
  it("admits a closed queue/job contract", () => {
    const result = readQueueJobContract(baseContract({ diagnostics: [] }));
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.value.schema, QUEUE_JOB_CONTRACT_SCHEMA);
    assert.equal(result.value.name, "MediaJobs");
    assert.equal(result.value.defaultDecision, "deny");
    assert.deepEqual([...result.value.admittedQueues], ["email", "media"]);
    assert.deepEqual(result.value.jobs.map((j) => j.id), ["send-receipt", "transcode-video"]);
    assert.equal(result.value.jobs[0].retry.backoff, "fixed");
    assert.equal(result.value.jobs[1].retry.maxAttempts, 3);
    assert.equal(result.value.jobs[1].audit, "required");
    assert.equal(result.value.diagnostics.length, 0);
    assert.equal(Object.isFrozen(result.value), true);
    assert.equal(Object.isFrozen(result.value.jobs), true);
    assert.equal(Object.isFrozen(result.value.jobs[1]), true);
    assert.equal(Object.isFrozen(result.value.jobs[1].retry), true);
    assert.equal(hasNoHoles(result.value), true);
  });

  it("refuses getters, symbols, custom prototypes and unknown keys without echo", () => {
    const hostile = baseContract();
    let ran = false;
    Object.defineProperty(hostile, "secret", {
      get() {
        ran = true;
        throw new Error("getter-ran");
      },
      enumerable: true,
    });
    const fromGetter = createQueueJobContract(hostile);
    assert.equal(ran, false);
    assert.equal(fromGetter.diagnostics[0]?.code, FUNGI_APPK_QJC_001);
    assert.equal(fromGetter.diagnostics.some((d) => /getter|secret/i.test(d.message)), false);

    const withSymbol = { ...baseContract(), [Symbol("x")]: 1 };
    assert.equal(createQueueJobContract(withSymbol).diagnostics[0]?.code, FUNGI_APPK_QJC_001);

    const proto = Object.assign(Object.create({ inherited: true }), baseContract());
    assert.equal(createQueueJobContract(proto).diagnostics[0]?.code, FUNGI_APPK_QJC_001);

    const unknownKey = createQueueJobContract({ ...baseContract(), extra: "nope" });
    assert.equal(unknownKey.diagnostics[0]?.code, FUNGI_APPK_QJC_001);
    assert.equal(unknownKey.diagnostics.some((d) => d.message.includes("extra")), false);

    const jobUnknown = createQueueJobContract(baseContract({ jobs: [job({ priority: "high" })] }));
    assert.equal(jobUnknown.diagnostics[0]?.code, FUNGI_APPK_QJC_001);
    assert.equal(jobUnknown.diagnostics.some((d) => d.message.includes("priority")), false);

    const retryUnknown = createQueueJobContract(baseContract({ jobs: [job({ retry: { ...retry(), jitter: true } })] }));
    assert.equal(retryUnknown.diagnostics[0]?.code, FUNGI_APPK_QJC_004);

    const jobGetter = job();
    Object.defineProperty(jobGetter, "timeoutMs", { get: () => 1, enumerable: true });
    assert.equal(createQueueJobContract(baseContract({ jobs: [jobGetter] })).diagnostics[0]?.code, FUNGI_APPK_QJC_004);

    for (const bad of [null, undefined, 42, "contract", [baseContract()]]) {
      assert.equal(createQueueJobContract(bad).diagnostics[0]?.code, FUNGI_APPK_QJC_001);
    }
  });

  it("refuses relaxed default decision / audit / backoff, untyped payloads and reserved idempotency without echo", () => {
    for (const token of ["allow", "bypass"]) {
      const refused = createQueueJobContract(baseContract({ defaultDecision: token }));
      assert.equal(refused.diagnostics.length, 1);
      assert.equal(refused.diagnostics[0]?.code, FUNGI_APPK_QJC_002);
      assert.equal(refused.diagnostics[0]?.field, "defaultDecision");
      assert.equal(refused.diagnostics[0]?.message.includes(token), false);
    }
    for (const [field, token] of [
      ["audit", "optional"],
      ["audit", "none"],
      ["payloadType", "Any"],
      ["payloadType", "Json"],
      ["payloadType", "Unknown"],
      ["payloadType", "Object"],
      ["payloadType", "videoJob"],
      ["id", "../etc/passwd"],
      ["queue", "*"],
    ]) {
      const refused = createQueueJobContract(baseContract({ jobs: [job({ [field]: token })] }));
      assert.equal(refused.diagnostics.length, 1, `${field}=${token}`);
      assert.equal(refused.diagnostics[0]?.code, FUNGI_APPK_QJC_002, `${field}=${token}`);
      assert.equal(refused.diagnostics[0]?.field, field);
      assert.equal(refused.diagnostics[0]?.message.includes(token), false);
    }
    for (const token of ["linear", "none", "immediate"]) {
      const refused = createQueueJobContract(baseContract({ jobs: [job({ retry: retry({ backoff: token }) })] }));
      assert.equal(refused.diagnostics[0]?.code, FUNGI_APPK_QJC_002);
      assert.equal(refused.diagnostics[0]?.field, "backoff");
      assert.equal(refused.diagnostics[0]?.message.includes(token), false);
    }
    const idem = createQueueJobContract(baseContract({ jobs: [job({ idempotency: "key-sk_live_123" })] }));
    assert.equal(idem.diagnostics.length, 1);
    assert.equal(idem.diagnostics[0]?.code, FUNGI_APPK_QJC_002);
    assert.equal(idem.diagnostics[0]?.field, "idempotency");
    assert.equal(idem.diagnostics.some((d) => d.message.includes("sk_live")), false);

    const schema = createQueueJobContract(baseContract({ schema: "galerina.app-kernel.queue-job-contract/v2" }));
    assert.equal(schema.diagnostics[0]?.code, FUNGI_APPK_QJC_002);
    const name = createQueueJobContract(baseContract({ name: "../etc/passwd" }));
    assert.equal(name.diagnostics[0]?.code, FUNGI_APPK_QJC_002);
    assert.equal(name.diagnostics.some((d) => d.message.includes("passwd")), false);
  });

  it("refuses NaN / Infinity / zero / unsafe ceilings and inconsistent retry delays", () => {
    for (const [field, value] of [
      ["maxPayloadBytes", Number.NaN],
      ["maxPayloadBytes", 0],
      ["maxPayloadBytes", 16 * 1024 * 1024 + 1],
      ["timeoutMs", Number.POSITIVE_INFINITY],
      ["timeoutMs", -1],
      ["timeoutMs", "120000"],
    ]) {
      const refused = createQueueJobContract(baseContract({ jobs: [job({ [field]: value })] }));
      assert.equal(refused.diagnostics[0]?.code, FUNGI_APPK_QJC_002, `${field}`);
      assert.equal(refused.diagnostics[0]?.field, field);
      assert.equal(refused.diagnostics.some((d) => /NaN|Infinity/i.test(d.message)), false);
    }
    for (const [field, value] of [
      ["maxAttempts", 0],
      ["maxAttempts", 101],
      ["maxAttempts", 1.5],
      ["initialDelayMs", Number.NaN],
      ["maxDelayMs", Number.MAX_SAFE_INTEGER + 2],
    ]) {
      const refused = createQueueJobContract(baseContract({ jobs: [job({ retry: retry({ [field]: value }) })] }));
      assert.equal(refused.diagnostics[0]?.code, FUNGI_APPK_QJC_002, `${field}`);
      assert.equal(refused.diagnostics[0]?.field, field);
    }
    const order = createQueueJobContract(
      baseContract({ jobs: [job({ retry: retry({ initialDelayMs: 5000, maxDelayMs: 4000 }) })] }),
    );
    assert.equal(order.diagnostics[0]?.code, FUNGI_APPK_QJC_003);
    const fixed = createQueueJobContract(
      baseContract({ jobs: [job({ retry: retry({ backoff: "fixed", initialDelayMs: 1000, maxDelayMs: 2000 }) })] }),
    );
    assert.equal(fixed.diagnostics[0]?.code, FUNGI_APPK_QJC_003);
    const missing = { ...retry() };
    delete missing.maxDelayMs;
    assert.equal(createQueueJobContract(baseContract({ jobs: [job({ retry: missing })] })).diagnostics[0]?.code, FUNGI_APPK_QJC_001);
    assert.equal(createQueueJobContract(baseContract({ jobs: [job({ retry: [3] })] })).diagnostics[0]?.code, FUNGI_APPK_QJC_004);
  });

  it("refuses empty / duplicate / unsorted / sparse lists, unadmitted queues and non-empty input diagnostics", () => {
    assert.equal(createQueueJobContract(baseContract({ admittedQueues: [] })).diagnostics[0]?.code, FUNGI_APPK_QJC_003);
    assert.equal(
      createQueueJobContract(baseContract({ admittedQueues: ["media", "media"] })).diagnostics[0]?.code,
      FUNGI_APPK_QJC_003,
    );
    assert.equal(
      createQueueJobContract(baseContract({ admittedQueues: ["media", "email"] })).diagnostics[0]?.code,
      FUNGI_APPK_QJC_002,
    );
    const wildcard = createQueueJobContract(baseContract({ admittedQueues: ["*"] }));
    assert.equal(wildcard.diagnostics[0]?.code, FUNGI_APPK_QJC_002);
    assert.equal(wildcard.diagnostics.some((d) => d.message.includes("*")), false);
    const sparseQueues = [];
    sparseQueues[0] = "email";
    sparseQueues[2] = "media";
    assert.equal(createQueueJobContract(baseContract({ admittedQueues: sparseQueues })).diagnostics[0]?.code, FUNGI_APPK_QJC_004);

    assert.equal(createQueueJobContract(baseContract({ jobs: [] })).diagnostics[0]?.code, FUNGI_APPK_QJC_003);
    assert.equal(createQueueJobContract(baseContract({ jobs: [job(), job()] })).diagnostics[0]?.code, FUNGI_APPK_QJC_003);
    assert.equal(
      createQueueJobContract(baseContract({ jobs: [job(), job({ id: "send-receipt", queue: "email" })] })).diagnostics[0]?.code,
      FUNGI_APPK_QJC_002,
    );
    const unadmitted = createQueueJobContract(baseContract({ jobs: [job({ queue: "billing" })] }));
    assert.equal(unadmitted.diagnostics[0]?.code, FUNGI_APPK_QJC_003);
    assert.equal(unadmitted.diagnostics[0]?.field, "queue");
    assert.equal(unadmitted.diagnostics.some((d) => d.message.includes("billing")), false);
    const sparseJobs = [];
    sparseJobs[1] = job();
    assert.equal(createQueueJobContract(baseContract({ jobs: sparseJobs })).diagnostics[0]?.code, FUNGI_APPK_QJC_004);
    assert.equal(createQueueJobContract(baseContract({ jobs: ["transcode-video"] })).diagnostics[0]?.code, FUNGI_APPK_QJC_004);

    const injected = createQueueJobContract(
      baseContract({ diagnostics: [{ code: "X", severity: "error", message: "pre-seeded", field: "record" }] }),
    );
    assert.equal(injected.diagnostics[0]?.code, FUNGI_APPK_QJC_005);
  });

  it("never throws on hostile proxies and refused output carries no null / NaN / undefined", () => {
    let flips = 0;
    const proxy = new Proxy(baseContract(), {
      get(target, prop, receiver) {
        flips += 1;
        if (flips > 3 && prop === "jobs") return null;
        return Reflect.get(target, prop, receiver);
      },
      getOwnPropertyDescriptor(target, prop) {
        flips += 1;
        if (prop === "jobs") throw new Error("descriptor-trap");
        return Reflect.getOwnPropertyDescriptor(target, prop);
      },
      ownKeys(target) {
        flips += 1;
        return Reflect.ownKeys(target);
      },
    });
    let refused;
    assert.doesNotThrow(() => {
      refused = createQueueJobContract(proxy);
    });
    assert.equal(refused.diagnostics.length > 0, true);
    assert.equal(refused.diagnostics.some((d) => d.message.includes("descriptor-trap")), false);
    assert.equal(hasNoHoles(refused), true);
    assert.equal(readQueueJobContract(proxy).ok, false);

    const jobProxy = new Proxy(job(), {
      ownKeys() {
        throw new Error("ownkeys-trap");
      },
    });
    let nested;
    assert.doesNotThrow(() => {
      nested = createQueueJobContract(baseContract({ jobs: [jobProxy] }));
    });
    assert.equal(nested.diagnostics[0]?.code, FUNGI_APPK_QJC_004);
    assert.equal(hasNoHoles(nested), true);
  });
});

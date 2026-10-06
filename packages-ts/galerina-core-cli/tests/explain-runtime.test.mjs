import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  EXPLAIN_RUNTIME_PROFILE_SCHEMA,
  FUNGI_EXPLAIN_009,
  FUNGI_EXPLAIN_010,
  readExplainRuntimeProfile,
  explainRuntimeProfile,
} from "../dist/explain/explain-runtime.js";

const validProfile = {
  schema: EXPLAIN_RUNTIME_PROFILE_SCHEMA,
  profile: "production",
  target: "node",
  effects: ["fs.read", "net.fetch"],
  capabilities: ["cap.read"],
  memoryMb: 512,
};

describe("readExplainRuntimeProfile / explainRuntimeProfile", () => {
  it("explains a closed runtime profile as boundary/effect/capability traces", () => {
    const result = explainRuntimeProfile(validProfile);
    assert.equal(result.diagnostics.length, 0);
    assert.ok(result.traces.length >= 5);
    assert.equal(result.traces[0].label, "boundary");
    assert.equal(result.traces[0].output, "production");
    assert.equal(result.traces[1].output, "node");
    assert.deepEqual([...result.effects], ["fs.read", "net.fetch"]);
    assert.deepEqual([...result.capabilities], ["cap.read"]);
    const mem = result.traces.find((t) => t.input === "runtime.memoryMb");
    assert.ok(mem);
    assert.equal(mem.output, "memory.bound");
    assert.equal(JSON.stringify(result).includes("512"), false);
  });

  it("refuses bad schema, unknown target, non-ascending tokens, bad memory without echo", () => {
    const badSchema = readExplainRuntimeProfile({ ...validProfile, schema: "x" });
    assert.equal(badSchema.ok, false);
    assert.equal(badSchema.diagnostics[0].code, FUNGI_EXPLAIN_009);
    assert.equal(JSON.stringify(badSchema.diagnostics).includes('"x"'), false);

    const badTarget = readExplainRuntimeProfile({ ...validProfile, target: "jvm" });
    assert.equal(badTarget.ok, false);
    assert.equal(badTarget.diagnostics[0].code, FUNGI_EXPLAIN_010);
    assert.equal(JSON.stringify(badTarget.diagnostics).includes("jvm"), false);

    const unsorted = readExplainRuntimeProfile({
      ...validProfile,
      effects: ["net.fetch", "fs.read"],
    });
    assert.equal(unsorted.ok, false);
    assert.equal(unsorted.diagnostics[0].code, FUNGI_EXPLAIN_010);

    const badMem = readExplainRuntimeProfile({ ...validProfile, memoryMb: 0 });
    assert.equal(badMem.ok, false);
    assert.equal(badMem.diagnostics[0].code, FUNGI_EXPLAIN_010);

    const nanMem = readExplainRuntimeProfile({ ...validProfile, memoryMb: Number.NaN });
    assert.equal(nanMem.ok, false);
    assert.equal(nanMem.diagnostics[0].code, FUNGI_EXPLAIN_010);

    const accessor = {};
    Object.defineProperty(accessor, "schema", {
      get() {
        throw new Error("boom");
      },
      enumerable: true,
    });
    const hostile = explainRuntimeProfile(accessor);
    assert.ok(hostile.diagnostics.length > 0);
    assert.equal(hostile.traces.length, 0);
  });

  it("never throws on hostile getters in lists", () => {
    const effects = ["fs.read"];
    Object.defineProperty(effects, "0", {
      get() {
        throw new Error("effect-get");
      },
      enumerable: true,
      configurable: true,
    });
    const input = {
      schema: EXPLAIN_RUNTIME_PROFILE_SCHEMA,
      profile: "production",
      target: "node",
      effects,
      capabilities: ["cap.read"],
    };
    assert.doesNotThrow(() => {
      const r = explainRuntimeProfile(input);
      assert.ok(r.diagnostics.length > 0);
    });
  });
});

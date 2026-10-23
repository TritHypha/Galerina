import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  decodeCanonicalFrame,
  encodeCanonicalFrame,
  runRequirementProcessWorker,
} from "../dist/index.js";

const NONCE = "00112233445566778899aabbccddeeff";
const ARTIFACT_BYTES = readFileSync(new URL(
  "../../../packages/fungi/products/galerina/rd0858-unit4-scalar-oracle/scalar-oracle.checked.json",
  import.meta.url,
));

const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function cleanScalarWorkerFrame() {
  const argument = Buffer.from('{"subject":1}', "utf8");
  const request = encodeCanonicalFrame("launcher-request", {
    schemaVersion: 1,
    nonce: NONCE,
    runtimeProfile: "scalar-1",
    subjectDigest: digest(argument),
    flowLocator: "rd0858/unit4/scalar-oracle",
    flowDigest: digest(ARTIFACT_BYTES),
    argumentDigest: digest(argument),
    argumentBytes: argument.toString("base64"),
  });
  const execution = encodeCanonicalFrame("worker-execution", {
    schemaVersion: 1,
    nonce: NONCE,
    artifactDigest: digest(ARTIFACT_BYTES),
    artifactBytes: ARTIFACT_BYTES.toString("base64"),
    requestDigest: digest(request),
    requestBytes: Buffer.from(request).toString("base64"),
  });
  const frames = [];
  const outcome = await runRequirementProcessWorker(
    { read: async () => execution },
    { write: async (frame) => frames.push(Buffer.from(frame)), close() {} },
    { nonce: NONCE, workerDigest: "a".repeat(64), runtimeDigest: "b".repeat(64), timeoutMs: 1_000 },
  );
  assert.equal(outcome.executionState, "COMPLETE");
  assert.equal(frames.length, 2);
  const result = decodeCanonicalFrame("worker-result", frames[1]);
  assert.equal(result.boundedValue.decision, "allow");
  assert.equal(result.boundedAudit.executionTier, "tree");
  return frames[1];
}

const ATTACK_MODES = Object.freeze([
  "detector-direct",
  "detector-retained",
  "descriptor-direct",
  "descriptor-retained",
]);

const sourceForRequire = (flowName) =>
  `@version 1\npure flow ${flowName}(subject: Bool) -> String\n` +
  `contract { effects {} }\n{\n` +
  `  require subject {\n` +
  `    deny: return "deny"\n` +
  `    ambig: return "ambig"\n` +
  `  }\n` +
  `  return "allow"\n}`;

function runPreBootstrapAttack(mode) {
  const parserUrl = new URL("../dist/parser.js", import.meta.url).href;
  const typeCheckerUrl = new URL("../dist/type-checker.js", import.meta.url).href;
  const interpreterUrl = new URL("../dist/interpreter.js", import.meta.url).href;
  const flowName = `processRoot_${mode.replaceAll("-", "_")}`;
  const childSource = String.raw`
    import { createRequire, syncBuiltinESMExports } from "node:module";

    const require = createRequire(import.meta.url);
    const utilTypes = require("node:util/types");
    const vm = require("node:vm");
    const mode = process.argv[5];
    const flowName = process.argv[6];
    const originalDetector = utilTypes.isProxy;
    const originalRunInNewContext = vm.runInNewContext;
    const originalDescriptor = Object.getOwnPropertyDescriptor;
    let armed = !mode.endsWith("-retained");
    let descriptorReads = 0;
    let forgedReads = 0;

    const subject = mode.startsWith("detector-")
      ? new Proxy({}, {
          getOwnPropertyDescriptor(_target, key) {
            descriptorReads += 1;
            if (key === "__tag") {
              return { configurable: true, enumerable: true, writable: true, value: "bool" };
            }
            if (key === "value") {
              return { configurable: true, enumerable: true, writable: true, value: true };
            }
            return undefined;
          },
        })
      : { __tag: "bool", value: mode === "stable-unpoisoned" ? true : 0 };

    if (mode.startsWith("detector-")) {
      utilTypes.isProxy = function (candidate) {
        if (armed && candidate === subject) return false;
        return Reflect.apply(originalDetector, utilTypes, [candidate]);
      };
      syncBuiltinESMExports();
    } else if (mode.startsWith("descriptor-")) {
      vm.runInNewContext = function (code, context, options) {
        if (code === "Object.getOwnPropertyDescriptor") {
          return (candidate, key) => {
            if (armed && candidate === subject && (key === "__tag" || key === "value")) {
              forgedReads += 1;
              return {
                configurable: true,
                enumerable: true,
                writable: true,
                value: key === "__tag" ? "bool" : true,
              };
            }
            return Reflect.apply(originalDescriptor, Object, [candidate, key]);
          };
        }
        return Reflect.apply(originalRunInNewContext, vm, [code, context, options]);
      };
      syncBuiltinESMExports();
    }

    const { parseProgram } = await import(process.argv[1]);
    const { checkTypes } = await import(process.argv[2]);
    const parsed = parseProgram(process.argv[4], mode + ".fungi");
    const parserErrors = parsed.diagnostics.filter(
      (diagnostic) => diagnostic.severity === "error",
    );
    const typeErrors = checkTypes(parsed.ast).diagnostics.filter(
      (diagnostic) => diagnostic.severity === "error",
    );
    if (parserErrors.length > 0 || typeErrors.length > 0) {
      throw new Error("unexpected parser or type errors in process-root fixture");
    }

    const interpreter = await import(process.argv[3] + "?" + mode);
    utilTypes.isProxy = originalDetector;
    vm.runInNewContext = originalRunInNewContext;
    const detectorRestored = utilTypes.isProxy === originalDetector;
    const descriptorRestored = vm.runInNewContext === originalRunInNewContext;
    armed = true;

    try {
      const result = await interpreter.executeFlow(
        flowName,
        new Map([["subject", subject]]),
        parsed.ast,
        parsed.flows,
      );
      process.stdout.write(JSON.stringify({
        audit: result.audit.result,
        tag: result.value?.__tag,
        value: result.value?.value,
        descriptorReads,
        forgedReads,
        detectorRestored,
        descriptorRestored,
      }));
    } finally {
      syncBuiltinESMExports();
    }
  `;
  const child = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      childSource,
      parserUrl,
      typeCheckerUrl,
      interpreterUrl,
      sourceForRequire(flowName),
      mode,
      flowName,
    ],
    {
      encoding: "utf8",
      maxBuffer: 1_048_576,
      timeout: 30_000,
      windowsHide: true,
    },
  );
  assert.equal(child.error, undefined);
  assert.equal(child.signal, null);
  assert.equal(child.status, 0, child.stderr);
  assert.notEqual(child.stdout, "");
  return JSON.parse(child.stdout);
}

describe("RD-0858 Unit 4 causal in-process process-root controls", () => {
  it("keeps the unpoisoned canonical discriminator operational", () => {
    const result = runPreBootstrapAttack("stable-unpoisoned");
    assert.equal(result.audit, "ok");
    assert.equal(result.tag, "string");
    assert.equal(result.value, "allow");
    assert.equal(result.detectorRestored, true);
    assert.equal(result.descriptorRestored, true);
  });

  it("refuses the unpoisoned malformed discriminator", () => {
    const result = runPreBootstrapAttack("malformed-unpoisoned");
    assert.equal(result.audit, "error");
    assert.equal(result.tag, "runtimeError");
    assert.notEqual(result.value, "allow");
    assert.equal(result.detectorRestored, true);
    assert.equal(result.descriptorRestored, true);
  });

  for (const mode of ATTACK_MODES) {
    it(`contains ${mode} by preserving byte-identical clean-worker evidence`, async () => {
      const cleanBefore = await cleanScalarWorkerFrame();
      const result = runPreBootstrapAttack(mode);
      assert.equal(result.detectorRestored, true);
      assert.equal(result.descriptorRestored, true);
      // Runtime-error snapshotting also probes the input tag before the
      // require decision reads its tag and payload. The attack control is
      // about proving the forged discriminator path executes, not freezing
      // that legitimate third descriptor observation.
      if (mode.startsWith("detector-")) assert.ok(result.descriptorReads >= 2);
      if (mode.startsWith("descriptor-")) assert.ok(result.forgedReads >= 2);
      assert.equal(result.value, "allow", "control must prove the in-process root attack is live");
      assert.equal(result.audit, "ok", "control must reach the unsafe in-process allow path");
      const cleanAfter = await cleanScalarWorkerFrame();
      assert.deepEqual(cleanAfter, cleanBefore, "clean-worker semantic and audit bytes must be stable");
    });
  }
});

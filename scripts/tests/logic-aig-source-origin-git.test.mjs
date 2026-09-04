import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { arch, platform, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  SOURCE_ORIGIN_LIMITS,
  canonicalJsonText,
  parseCanonicalJsonBytes,
  sha256Canonical,
  validateExpectedParseOutcomes,
  validateParserPolicy,
  validateProposedBaseline,
  validateToolchainPins,
} from "../lib/logic-aig-source-origin/contract.mjs";
import * as gitSource from "../lib/logic-aig-source-origin/git-source.mjs";
import {
  OWNER_PROPOSAL_POLICY,
  buildGitEnvironment,
  validateExporterPolicy,
} from "../lib/logic-aig-source-origin/owner-proposal-policy.mjs";

const GOVERNANCE = new URL("../../governance/", import.meta.url);
const FINAL_OWNER_ROWS = Object.freeze([
  Object.freeze({ name: "example-proposed-baseline.json", byteLength: 1605, rawSha256: "eb1620e43d72f2d1afc3fc7c467c06856d99d936d45c905ef4f1b77abdff8817", semanticDigest: "7e244a1486778fc21fefbb9412ac1057172f716124ec0266f0ccedbae6dca6f8" }),
  Object.freeze({ name: "logic-aig-source-origin-expected-parse-outcomes.json", byteLength: 35998, rawSha256: "e86aa47550164ee30fac455c73f3e32f0e0cb1a047175924805087d2301afbe9", semanticDigest: "9a22abb0889101c39e30a07a546a00829320c5fa679a31e97e70312d93ae14a5" }),
  Object.freeze({ name: "logic-aig-source-origin-exporter-policy.json", byteLength: 9451, rawSha256: "97770da53732b1b09cddef4dbe550beca1b5c80cd203a30d29630f305612225a", semanticDigest: "d45f8e0c7404d608fc735ee406b1abc6348c4466988e6a150d7aa08a8707b96a" }),
]);
const TOOLCHAIN_PINS_IDENTITY = Object.freeze({
  byteLength: 69_452,
  rawSha256: "0c5bb3b5e77e36741c479f65442dec01c76c57aa67b57fdcdba975e9a6f036cf",
});
const TEMPORARY_CAPABILITY_PATHS = Object.freeze([
  new URL("../../governance/logic-aig-source-origin-owner-proposal-policy.json", import.meta.url),
  new URL("../propose-logic-aig-source-origin-owners.mjs", import.meta.url),
  new URL("../lib/logic-aig-source-origin/owner-proposal-runtime.mjs", import.meta.url),
  new URL("logic-aig-source-origin-owner-proposal-runtime.test.mjs", import.meta.url),
]);

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function task6BCopyPropertyDescriptor(descriptor) {
  if (descriptor === undefined) return undefined;
  const copy = Object.create(null);
  for (const field of ["configurable", "enumerable", "value", "writable", "get", "set"]) {
    if (Object.hasOwn(descriptor, field)) copy[field] = descriptor[field];
  }
  return copy;
}

function installTask6BDescriptorFieldPoison() {
  const safeCreate = Object.create;
  const safeDefineProperty = Object.defineProperty;
  const safeDeleteProperty = Reflect.deleteProperty;
  const safeGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
  const originals = safeCreate(null);
  originals.get = task6BCopyPropertyDescriptor(
    safeGetOwnPropertyDescriptor(Object.prototype, "get"),
  );
  originals.set = task6BCopyPropertyDescriptor(
    safeGetOwnPropertyDescriptor(Object.prototype, "set"),
  );
  let getTraps = 0;
  let setTraps = 0;
  const getDescriptor = safeCreate(null);
  getDescriptor.configurable = true;
  getDescriptor.enumerable = false;
  getDescriptor.get = function task6BInheritedGet() {
    getTraps += 1;
    return undefined;
  };
  safeDefineProperty(Object.prototype, "get", getDescriptor);
  const setDescriptor = safeCreate(null);
  setDescriptor.configurable = true;
  setDescriptor.enumerable = false;
  setDescriptor.get = function task6BInheritedSet() {
    setTraps += 1;
    return undefined;
  };
  safeDefineProperty(Object.prototype, "set", setDescriptor);
  const controller = safeCreate(null);
  controller.counts = () => ({ get: getTraps, set: setTraps });
  controller.restore = () => {
    for (const field of ["get", "set"]) {
      if (originals[field] === undefined) safeDeleteProperty(Object.prototype, field);
      else safeDefineProperty(Object.prototype, field, originals[field]);
    }
  };
  return controller;
}

async function readPinnedHeadCommit(gitExecutableLocator) {
  const repositoryRoot = await realpath(new URL("../../", import.meta.url));
  const canonicalExecutable = await realpath(gitExecutableLocator);
  const executableStat = await lstat(gitExecutableLocator);
  assert.equal(canonicalExecutable, gitExecutableLocator);
  assert.equal(executableStat.isFile(), true);
  assert.equal(executableStat.isSymbolicLink(), false);
  const pinsBytes = await readFile(new URL("logic-aig-source-origin-toolchain-pins.json", GOVERNANCE));
  assert.equal(pinsBytes.length, TOOLCHAIN_PINS_IDENTITY.byteLength);
  assert.equal(sha256(pinsBytes), TOOLCHAIN_PINS_IDENTITY.rawSha256);
  const pins = validateToolchainPins(parseCanonicalJsonBytes(pinsBytes, { label: "TOOLCHAIN_PINS" }));
  const hostPin = pins.records.find((row) => row.platform === platform() && row.arch === arch());
  assert(hostPin);
  const executableBytes = await readFile(gitExecutableLocator);
  assert.equal(executableBytes.length, hostPin.gitIdentity.executableByteLength);
  assert.equal(sha256(executableBytes), hostPin.gitIdentity.executableRawSha256);
  const selected = gitSource.materializeGitCommand(
    OWNER_PROPOSAL_POLICY.gitProcessPolicy,
    "HEAD",
    repositoryRoot,
  );
  const systemRoot = process.env.SystemRoot;
  assert.equal(typeof systemRoot, "string");
  const environment = buildGitEnvironment(OWNER_PROPOSAL_POLICY.environmentPolicy, {
    architecture: arch(),
    parentEnvironment: { SystemRoot: systemRoot },
    platform: platform(),
    systemRootDirectoryObservation: { exists: true, kind: "DIRECTORY", locator: systemRoot },
  });
  const commitOid = execFileSync(gitExecutableLocator, selected.arguments, {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: environment,
    maxBuffer: selected.maximumBytes,
    windowsHide: true,
  }).trim();
  assert.match(commitOid, /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u);
  const closingBytes = await readFile(gitExecutableLocator);
  assert.equal(closingBytes.length, hostPin.gitIdentity.executableByteLength);
  assert.equal(sha256(closingBytes), hostPin.gitIdentity.executableRawSha256);
  return commitOid;
}

function approvedGitEnvironment() {
  const parentEnvironment = Object.create(null);
  let systemRootDirectoryObservation = null;
  if (platform() === "win32") {
    const systemRoot = process.env.SystemRoot;
    assert.equal(typeof systemRoot, "string");
    Object.defineProperty(parentEnvironment, "SystemRoot", {
      configurable: true,
      enumerable: true,
      value: systemRoot,
      writable: true,
    });
    systemRootDirectoryObservation = { exists: true, kind: "DIRECTORY", locator: systemRoot };
  }
  return buildGitEnvironment(OWNER_PROPOSAL_POLICY.environmentPolicy, {
    architecture: arch(),
    parentEnvironment,
    platform: platform(),
    systemRootDirectoryObservation,
  });
}

function exporterBindings(value) {
  return Object.fromEntries([
    "sourcePolicyDigest",
    "exclusionDigest",
    "resolutionPolicyDigest",
    "parserPolicyDigest",
    "generatedConsumerPolicyDigest",
    "repositoryIdentityDigest",
    "toolchainPinsDigest",
    "expectedOutcomesDigest",
    "proposedBaselineDigest",
  ].map((field) => [field, value[field]]));
}

function configBytes(policy, root, localRows = []) {
  const commandRows = [];
  for (let index = 0; index < policy.fixedPrefix.length; index += 1) {
    if (policy.fixedPrefix[index] !== "-c") continue;
    const assignment = policy.fixedPrefix[index + 1].replace("<REPOSITORY_ROOT>", root);
    const split = assignment.indexOf("=");
    commandRows.push({ scope: "command", origin: "command line:", key: assignment.slice(0, split), value: assignment.slice(split + 1) });
  }
  const fields = [...commandRows, ...localRows].flatMap((row) => [row.scope, row.origin, `${row.key}\n${row.value}`]);
  return Buffer.from(`${fields.join("\0")}\0`, "utf8");
}

test("installs the complete approved final-owner set with exact canonical identities and retained transition equality", async () => {
  const values = new Map();
  for (const row of FINAL_OWNER_ROWS) {
    const bytes = await readFile(new URL(row.name, GOVERNANCE));
    assert.equal(bytes.length, row.byteLength, row.name);
    assert.equal(sha256(bytes), row.rawSha256, row.name);
    assert.equal(bytes.includes(10), false, row.name);
    assert.equal(bytes.includes(13), false, row.name);
    values.set(row.name, parseCanonicalJsonBytes(bytes, { label: row.name }));
  }
  const parser = validateParserPolicy(JSON.parse(await readFile(new URL("logic-aig-source-origin-parser-policy.json", GOVERNANCE), "utf8")));
  const baseline = validateProposedBaseline(values.get("example-proposed-baseline.json"));
  const expected = validateExpectedParseOutcomes(values.get("logic-aig-source-origin-expected-parse-outcomes.json"), { parserPolicy: parser });
  const exporterValue = values.get("logic-aig-source-origin-exporter-policy.json");
  const exporter = validateExporterPolicy(exporterValue, exporterBindings(exporterValue));
  assert.equal(baseline.policyDigest, FINAL_OWNER_ROWS[0].semanticDigest);
  assert.equal(expected.expectedOutcomesDigest, FINAL_OWNER_ROWS[1].semanticDigest);
  assert.equal(exporter.policyDigest, FINAL_OWNER_ROWS[2].semanticDigest);
  assert.equal(exporter.proposedBaselineDigest, baseline.policyDigest);
  assert.equal(exporter.expectedOutcomesDigest, expected.expectedOutcomesDigest);
  assert.deepEqual(exporter.gitProcessPolicy, OWNER_PROPOSAL_POLICY.gitProcessPolicy);
  assert.deepEqual(exporter.environmentPolicy, OWNER_PROPOSAL_POLICY.environmentPolicy);
  assert.deepEqual(exporter.limits, OWNER_PROPOSAL_POLICY.limits);

  const temporaryBytes = Buffer.from(canonicalJsonText(OWNER_PROPOSAL_POLICY), "utf8");
  assert.equal(temporaryBytes.length, 8371);
  assert.equal(sha256(temporaryBytes), "097abc918cd054c82fd10b339053d1400c1aaf6c8f9a41bc47d065e0aca80407");
  assert.equal(OWNER_PROPOSAL_POLICY.policyDigest, "73ebb11db247b6b94f8099d9e16d6adefc3e03e1c292d6f562a9b00743b01d9b");
});

test("retires every temporary proposal capability while preserving the pure policy module", async () => {
  for (const locator of TEMPORARY_CAPABILITY_PATHS) await assert.rejects(readFile(locator), (error) => error?.code === "ENOENT");
  const pure = await import("../lib/logic-aig-source-origin/owner-proposal-policy.mjs");
  assert.equal(typeof pure.validateExporterPolicy, "function");
  assert.equal(typeof pure.createOwnerProposalPolicyCandidate, "function");
});

test("captureFrozenSource rejects caller root, expectedHead, and limit authority before touching Git", async () => {
  await assert.rejects(gitSource.captureFrozenSource({
    repositoryRoot: dirname(process.execPath),
    expectedHead: "a".repeat(40),
    gitExecutableLocator: process.execPath,
    limits: SOURCE_ORIGIN_LIMITS,
  }), (error) => error?.code === "SOURCE_ORIGIN_GIT_SCHEMA");
});

test("captureFrozenSource accepts only caller commit identity and pinned executable location", async () => {
  await assert.rejects(gitSource.captureFrozenSource({
    commitOid: "a".repeat(40),
    gitExecutableLocator: process.execPath,
  }), (error) => error?.code === "SOURCE_ORIGIN_GIT_EXECUTABLE");
});

test("capture option capture refuses accessors, proxies, symbols, missing and surplus fields without invoking them", async () => {
  let getterCalls = 0;
  const accessor = {};
  Object.defineProperties(accessor, {
    commitOid: { enumerable: true, get() { getterCalls += 1; return "a".repeat(40); } },
    gitExecutableLocator: { enumerable: true, value: process.execPath },
  });
  await assert.rejects(gitSource.captureFrozenSource(accessor), (error) => error?.code === "SOURCE_ORIGIN_GIT_SCHEMA");
  assert.equal(getterCalls, 0);

  let proxyTraps = 0;
  const proxy = new Proxy({}, { getPrototypeOf() { proxyTraps += 1; return Object.prototype; } });
  await assert.rejects(gitSource.captureFrozenSource(proxy), (error) => error?.code === "SOURCE_ORIGIN_GIT_SCHEMA");
  assert.equal(proxyTraps, 0);

  for (const value of [
    { commitOid: "a".repeat(40) },
    { commitOid: "a".repeat(40), gitExecutableLocator: process.execPath, surplus: true },
    Object.assign({ commitOid: "a".repeat(40), gitExecutableLocator: process.execPath }, { [Symbol("authority")]: true }),
  ]) await assert.rejects(gitSource.captureFrozenSource(value), (error) => error?.code === "SOURCE_ORIGIN_GIT_SCHEMA");
});

test("twelfth-review frozen capture has no runtime owner-policy helper authority", { timeout: 180_000, skip: platform() !== "win32" }, async (t) => {
  const gitExecutableLocator = fileURLToPath(new URL(
    "../../.superpowers/sdd/2026-08-31-rd0873-portable-artifact-admission/toolchains/mingit-2.55.0.5/expanded/cmd/git.exe",
    import.meta.url,
  ));
  const capture = () => gitSource.captureFrozenSource({
    commitOid: "a".repeat(40),
    gitExecutableLocator,
  });
  const safeGetDescriptor = Object.getOwnPropertyDescriptor;
  const safeDefineProperty = Object.defineProperty;

  await t.test("post-import exporter-validator globals have zero effects", async () => {
    const descriptor = safeGetDescriptor(Object, "fromEntries");
    let effects = 0;
    let failure;
    safeDefineProperty(Object, "fromEntries", {
      ...descriptor,
      value() {
        effects += 1;
        throw new Error("ATTACKER_EXPORTER_VALIDATOR");
      },
    });
    try { await capture(); } catch (error) { failure = error; }
    finally { safeDefineProperty(Object, "fromEntries", descriptor); }
    assert.deepEqual(
      { effects, failureCode: failure?.code },
      { effects: 0, failureCode: "SOURCE_ORIGIN_GIT_HEAD" },
    );
  });

  await t.test("post-import environment globals cannot send a forbidden key to Git", async () => {
    const descriptor = safeGetDescriptor(Object, "create");
    let effects = 0;
    let forbiddenEnvironments = 0;
    let failure;
    safeDefineProperty(Object, "create", {
      ...descriptor,
      value(prototype, properties) {
        effects += 1;
        const output = Reflect.apply(descriptor.value, Object, [prototype, properties]);
        if (prototype === null) {
          forbiddenEnvironments += 1;
          safeDefineProperty(output, "GIT_DIR", {
            configurable: true,
            enumerable: true,
            value: dirname(process.execPath),
            writable: true,
          });
        }
        return output;
      },
    });
    try { await capture(); } catch (error) { failure = error; }
    finally { safeDefineProperty(Object, "create", descriptor); }
    assert.deepEqual(
      { effects, failureCode: failure?.code, forbiddenEnvironments },
      { effects: 0, failureCode: "SOURCE_ORIGIN_GIT_HEAD", forbiddenEnvironments: 0 },
    );
  });

  await t.test("git-source contains no imported runtime helper call sites", async () => {
    const source = await readFile(new URL("../lib/logic-aig-source-origin/git-source.mjs", import.meta.url), "utf8");
    assert.doesNotMatch(source, /\b(?:buildGitEnvironment|validateExporterPolicy)\b/u);
  });
});

test("sealed command selection atomically binds arguments and exact output ceiling for all fourteen classes", () => {
  const root = platform() === "win32" ? "C:\\repository" : "/repository";
  const trace = new Set();
  for (const row of OWNER_PROPOSAL_POLICY.gitProcessPolicy.commandRows) {
    const selected = gitSource.materializeGitCommand(
      OWNER_PROPOSAL_POLICY.gitProcessPolicy,
      row.commandId,
      root,
      { blobOid: "a".repeat(40), treeOid: "b".repeat(40) },
      row.commandId === "BLOB" ? "CAPTURED_FILE" : undefined,
    );
    assert.equal(selected.arguments.includes("<REPOSITORY_ROOT>"), false);
    assert.equal(selected.arguments.some((value) => value.includes("<")), false);
    assert(Number.isSafeInteger(selected.maximumBytes) && selected.maximumBytes > 0);
    trace.add(row.commandId);
  }
  assert.equal(trace.size, 14);
  const captured = gitSource.materializeGitCommand(OWNER_PROPOSAL_POLICY.gitProcessPolicy, "BLOB", root, { blobOid: "a".repeat(40) }, "CAPTURED_FILE");
  const json = gitSource.materializeGitCommand(OWNER_PROPOSAL_POLICY.gitProcessPolicy, "BLOB", root, { blobOid: "a".repeat(40) }, "JSON");
  assert.equal(captured.maximumBytes, SOURCE_ORIGIN_LIMITS.capturedFileBytes);
  assert.equal(json.maximumBytes, SOURCE_ORIGIN_LIMITS.jsonBytes);
  assert.throws(() => gitSource.materializeGitCommand(OWNER_PROPOSAL_POLICY.gitProcessPolicy, "BLOB", root, { blobOid: "a".repeat(40) }, "SCALAR"), /SOURCE_ORIGIN_/);
});

test("ninth-review Git commands ignore post-import Array.find poison and trace exact argv", { timeout: 30_000 }, async (t) => {
  const policy = OWNER_PROPOSAL_POLICY.gitProcessPolicy;
  const repositoryRoot = await realpath(new URL("../../", import.meta.url));
  const expectedHeadArguments = [
    ...policy.fixedPrefix.map((value) => value
      .replace("<REPOSITORY_ROOT>", repositoryRoot)),
    "rev-parse",
    "--verify",
    "HEAD^{commit}",
  ];
  const safeGetDescriptor = Object.getOwnPropertyDescriptor;
  const safeDefineProperty = Object.defineProperty;

  await t.test("post-import Array.prototype.find cannot replace pinned argv", () => {
    const descriptor = safeGetDescriptor(Array.prototype, "find");
    let effects = 0;
    let selected;
    let failure;
    safeDefineProperty(Array.prototype, "find", {
      ...descriptor,
      value() {
        effects += 1;
        return {
          commandId: "HEAD",
          arguments: ["--help"],
          outputLimitId: "SCALAR",
          stdoutRule: "ONE_UTF8_LINE",
        };
      },
    });
    try {
      selected = gitSource.materializeGitCommand(policy, "HEAD", repositoryRoot);
    } catch (error) {
      failure = error;
    } finally {
      safeDefineProperty(Array.prototype, "find", descriptor);
    }
    assert.equal(effects, 0);
    assert.equal(failure, undefined);
    assert.deepEqual(selected?.arguments, expectedHeadArguments);
    assert.match(selected?.argvDigest ?? "", /^[0-9a-f]{64}$/u);
  });

  await t.test("post-import Math.min cannot widen the sealed BLOB limit", () => {
    const descriptor = safeGetDescriptor(Math, "min");
    const expectedMaximum = Math.min(
      SOURCE_ORIGIN_LIMITS.capturedFileBytes,
      SOURCE_ORIGIN_LIMITS.processOutputBytes,
    );
    let effects = 0;
    let selected;
    let failure;
    safeDefineProperty(Math, "min", {
      ...descriptor,
      value() {
        effects += 1;
        return SOURCE_ORIGIN_LIMITS.processOutputBytes;
      },
    });
    try {
      selected = gitSource.materializeGitCommand(
        policy,
        "BLOB",
        repositoryRoot,
        { blobOid: "a".repeat(40) },
        "CAPTURED_FILE",
      );
    } catch (error) {
      failure = error;
    } finally {
      safeDefineProperty(Math, "min", descriptor);
    }
    assert.equal(effects, 0);
    assert.equal(failure, undefined);
    assert.equal(selected?.maximumBytes, expectedMaximum);
  });

  await t.test("trace validation detects a coherently re-digested argv substitution", () => {
    const environment = approvedGitEnvironment();
    const environmentDigest = sha256Canonical("galerina.logic-aig-git-environment.v1", environment);
    const selectedById = new Map();
    for (const row of policy.commandRows) {
      selectedById.set(row.commandId, gitSource.materializeGitCommand(
        policy,
        row.commandId,
        repositoryRoot,
        { blobOid: "a".repeat(40), treeOid: "b".repeat(40) },
        row.commandId === "BLOB" ? "CAPTURED_FILE" : undefined,
      ));
    }
    const middle = policy.commandRows
      .map((row) => row.commandId)
      .filter((commandId) => commandId !== "GIT_VERSION" && commandId !== "CONFIG_ROWS");
    const commandIds = ["GIT_VERSION", "CONFIG_ROWS", ...middle, "CONFIG_ROWS", "GIT_VERSION"];
    const trace = commandIds.map((commandId) => {
      const selected = selectedById.get(commandId);
      assert(selected);
      return {
        commandId,
        arguments: [...selected.arguments],
        argvDigest: selected.argvDigest,
        environmentDigest,
      };
    });
    assert.doesNotThrow(() => gitSource.validateGitCommandTrace(trace, policy, repositoryRoot, environment));

    const forged = structuredClone(trace);
    const head = forged.find((row) => row.commandId === "HEAD");
    assert(head);
    head.arguments = [...head.arguments.slice(0, -3), "status", "--short"];
    head.argvDigest = sha256Canonical("galerina.logic-aig-git-command-argv.v1", {
      commandId: head.commandId,
      arguments: head.arguments,
    });
    assert.throws(
      () => gitSource.validateGitCommandTrace(forged, policy, repositoryRoot, environment),
      (error) => error?.code === "SOURCE_ORIGIN_GIT_PROCESS",
    );

    const forgedEnvironmentDigest = structuredClone(trace);
    forgedEnvironmentDigest[0].environmentDigest = "0".repeat(64);
    assert.throws(
      () => gitSource.validateGitCommandTrace(forgedEnvironmentDigest, policy, repositoryRoot, environment),
      (error) => error?.code === "SOURCE_ORIGIN_GIT_PROCESS",
    );

    const forbiddenEnvironment = Object.assign(Object.create(null), environment, {
      GIT_DIR: dirname(process.execPath),
    });
    assert.throws(
      () => gitSource.validateGitCommandTrace(trace, policy, repositoryRoot, forbiddenEnvironment),
      (error) => error?.code === "SOURCE_ORIGIN_GIT_ENVIRONMENT",
    );
  });
});

test("config parser requires the complete command prefix and the closed local allowance", () => {
  const root = platform() === "win32" ? "C:\\repository" : "/repository";
  const policy = OWNER_PROPOSAL_POLICY.gitProcessPolicy;
  const accepted = gitSource.parseGitConfigRows(configBytes(policy, root, [{ scope: "local", origin: "file:.git/config", key: "core.bare", value: "false" }]), policy, root);
  assert.equal(accepted.commandRowCount, 12);
  assert.equal(accepted.localRowCount, 1);
  assert.match(accepted.semanticDigest, /^[0-9a-f]{64}$/);
  assert.throws(() => gitSource.parseGitConfigRows(configBytes(policy, root, [{ scope: "local", origin: "file:.git/config", key: "filter.hostile.process", value: "run-me" }]), policy, root), /SOURCE_ORIGIN_GIT_CONFIG/);
  const incomplete = configBytes({ ...policy, fixedPrefix: policy.fixedPrefix.slice(0, -4) }, root);
  assert.throws(() => gitSource.parseGitConfigRows(incomplete, policy, root), /SOURCE_ORIGIN_GIT_CONFIG/);
});

test("every Git text boundary refuses a raw UTF-8 BOM before decoding", async () => {
  const bom = Buffer.from([0xef, 0xbb, 0xbf]);
  const root = platform() === "win32" ? "C:\\repository" : "/repository";
  const policy = OWNER_PROPOSAL_POLICY.gitProcessPolicy;
  assert.throws(() => gitSource.parseGitConfigRows(Buffer.concat([bom, configBytes(policy, root)]), policy, root), /SOURCE_ORIGIN_GIT_CONFIG/);
  assert.throws(() => gitSource.decodeGitLine(Buffer.concat([bom, Buffer.from("git version 2.55.0\n")])), /SOURCE_ORIGIN_GIT_PROCESS/);
  assert.throws(() => gitSource.decodeGitLine(Buffer.from("git\0 version 2.55.0\n")), /SOURCE_ORIGIN_GIT_PROCESS/);

  const parser = validateParserPolicy(JSON.parse(await readFile(new URL("logic-aig-source-origin-parser-policy.json", GOVERNANCE), "utf8")));
  const gateBytes = await readFile(new URL("../../packages-ts/galerina-core-compiler/tests/fixtures/gate-v3/REFERENCE-VERDICTS.json", import.meta.url));
  assert.throws(() => gitSource.authenticateGateOwnerBytes(Buffer.concat([bom, gateBytes]), parser), /SOURCE_ORIGIN_GIT_POLICY/);
});

test("the legacy Gate predecessor is bound to the approved raw and external semantic identity", async () => {
  const parser = validateParserPolicy(JSON.parse(await readFile(new URL("logic-aig-source-origin-parser-policy.json", GOVERNANCE), "utf8")));
  const locator = new URL("../../packages-ts/galerina-core-compiler/tests/fixtures/gate-v3/REFERENCE-VERDICTS.json", import.meta.url);
  const workingBytes = await readFile(locator);
  const bytes = Buffer.from(workingBytes.toString("utf8").replaceAll("\r\n", "\n"), "utf8");
  const accepted = gitSource.authenticateGateOwnerBytes(bytes, parser);
  assert.equal(accepted.rawSha256, "d83ce2590520b152e1c838322e1762e4840c274e812bf6006e275118ada59467");
  assert.equal(accepted.semanticDigest, "4dfceb7f2bf2b6642c3b0cc2838735d41b8aad9e3c08e45f394637eb43bf8a58");

  const drifted = JSON.parse(bytes.toString("utf8"));
  drifted[Object.keys(drifted)[0]].codes = ["GATE-PARSE-002"];
  const driftedBytes = Buffer.from(`${JSON.stringify(drifted, null, 2)}\n`, "utf8");
  assert.throws(() => gitSource.authenticateGateOwnerBytes(driftedBytes, parser), /SOURCE_ORIGIN_GIT_POLICY/);
});

test("tree and index parsing requires one case-unique regular stage-zero census", () => {
  const a = "a".repeat(40);
  const b = "b".repeat(40);
  const treeBytes = Buffer.from(`100644 blob ${a}\tA.ts\0` + `100755 blob ${b}\tb.mjs\0`, "utf8");
  const treeRows = gitSource.parseGitTreeRows(treeBytes, "sha1");
  const stageBytes = Buffer.from(`100644 ${a} 0\tA.ts\0` + `100755 ${b} 0\tb.mjs\0`, "utf8");
  const flagBytes = Buffer.from("H A.ts\0H b.mjs\0", "utf8");
  const index = gitSource.observeGitIndex(stageBytes, flagBytes, "sha1", treeRows);
  assert.equal(index.rows.length, 2);
  assert.match(index.indexDigest, /^[0-9a-f]{64}$/);
  assert.throws(() => gitSource.parseGitTreeRows(Buffer.from(`100644 blob ${a}\tCase.ts\0` + `100644 blob ${b}\tcase.ts\0`, "utf8"), "sha1"), /SOURCE_ORIGIN_GIT_CASE_SHADOW/);
  assert.throws(() => gitSource.parseGitTreeRows(Buffer.from(`120000 blob ${a}\tlink.ts\0`, "utf8"), "sha1"), /SOURCE_ORIGIN_GIT_MODE/);
  assert.throws(() => gitSource.observeGitIndex(stageBytes.subarray(0, -1), flagBytes, "sha1", treeRows), /SOURCE_ORIGIN_GIT_INDEX/);
});

test("repository layout validation refuses wrong parent, non-canonical path text, case aliases, and links", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "galerina-source-origin-layout-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const gitDirectory = join(root, ".git");
  const indexPath = join(gitDirectory, "index");
  await mkdir(gitDirectory);
  await writeFile(indexPath, "index");
  const canonicalRoot = await realpath(root);
  const canonicalGit = await realpath(gitDirectory);
  const canonicalIndex = await realpath(indexPath);
  const gitText = (value) => platform() === "win32" ? value.replaceAll("\\", "/") : value;
  assert.deepEqual(gitSource.assertCanonicalRepositoryLayout({ repositoryRoot: canonicalRoot, toplevel: gitText(canonicalRoot), gitDirectory: gitText(canonicalGit), indexPath: gitText(canonicalIndex) }), { repositoryRoot: canonicalRoot, gitDirectory: canonicalGit, indexPath: canonicalIndex });
  assert.throws(() => gitSource.assertCanonicalRepositoryLayout({ repositoryRoot: canonicalRoot, toplevel: gitText(dirname(canonicalRoot)), gitDirectory: gitText(canonicalGit), indexPath: gitText(canonicalIndex) }), /SOURCE_ORIGIN_/);
  if (platform() === "win32") {
    const caseAlias = gitText(canonicalRoot).replace(/^([A-Za-z]):/, (_, drive) => `${drive === drive.toUpperCase() ? drive.toLowerCase() : drive.toUpperCase()}:`);
    assert.throws(() => gitSource.assertCanonicalRepositoryLayout({ repositoryRoot: canonicalRoot, toplevel: caseAlias, gitDirectory: gitText(canonicalGit), indexPath: gitText(canonicalIndex) }), /SOURCE_ORIGIN_/);
  }
  const link = `${root}-link`;
  t.after(() => rm(link, { recursive: true, force: true }));
  await symlink(root, link, platform() === "win32" ? "junction" : "dir");
  assert.throws(() => gitSource.assertCanonicalRepositoryLayout({ repositoryRoot: canonicalRoot, toplevel: gitText(link), gitDirectory: gitText(canonicalGit), indexPath: gitText(canonicalIndex) }), /SOURCE_ORIGIN_/);
});

test("closing-state validation refuses cached-tree, index, config, and post-input owner drift", () => {
  const opening = Object.freeze({ repositoryRoot: "root", gitDirectory: "git", indexPath: "index", objectFormat: "sha1", commitOid: "a".repeat(40), treeOid: "b".repeat(40), treeDigest: "c".repeat(64), indexDigest: "d".repeat(64), configDigest: "e".repeat(64), ownerSetDigest: "f".repeat(64) });
  assert.doesNotThrow(() => gitSource.assertFrozenSourceClosure(opening, structuredClone(opening)));
  for (const [field, value] of [["treeDigest", "0".repeat(64)], ["indexDigest", "1".repeat(64)], ["configDigest", "2".repeat(64)], ["ownerSetDigest", "3".repeat(64)]]) {
    const drifted = structuredClone(opening);
    drifted[field] = value;
    assert.throws(() => gitSource.assertFrozenSourceClosure(opening, drifted), /SOURCE_ORIGIN_GIT_DRIFT/);
  }
});

test("child output accounting accepts exact per-stream/global limits and refuses every plus one", () => {
  assert.equal(gitSource.exceedsChildOutputLimit(64, 0, 64, 64), false);
  assert.equal(gitSource.exceedsChildOutputLimit(65, 0, 64, 128), true);
  assert.equal(gitSource.exceedsChildOutputLimit(32, 33, 64, 64), true);
  assert.equal(gitSource.exceedsChildOutputLimit(0, 65, 64, 128), true);
});

test("frozen blob admission requires exact complete row-to-byte identity and returns defensive bytes", () => {
  const firstBytes = Buffer.from("first", "utf8");
  const secondBytes = Buffer.from("second", "utf8");
  const rows = [
    { path: "a.ts", byteLength: firstBytes.length, rawSha256: sha256(firstBytes) },
    { path: "b.fungi", byteLength: secondBytes.length, rawSha256: sha256(secondBytes) },
  ];
  const source = new Map([["a.ts", firstBytes], ["b.fungi", secondBytes]]);
  const admitted = gitSource.admitFrozenBlobSet(rows, source, { label: "SOURCE_MANIFEST" });
  assert.deepEqual([...admitted.keys()], ["a.ts", "b.fungi"]);
  firstBytes.fill(0);
  assert.equal(admitted.get("a.ts").toString("utf8"), "first");
  const returned = admitted.get("a.ts");
  returned.fill(0);
  assert.equal(admitted.get("a.ts").toString("utf8"), "first");
  assert.throws(() => admitted.set("c.ts", Buffer.from("c")), TypeError);

  assert.throws(() => gitSource.admitFrozenBlobSet(rows, new Map([["a.ts", Buffer.from("first")]]), { label: "SOURCE_MANIFEST" }), /SOURCE_ORIGIN_GIT_BLOB_SET/);
  assert.throws(() => gitSource.admitFrozenBlobSet(rows, new Map([...source, ["extra.ts", Buffer.from("extra")]]), { label: "SOURCE_MANIFEST" }), /SOURCE_ORIGIN_GIT_BLOB_SET/);
  assert.throws(() => gitSource.admitFrozenBlobSet(rows, new Map([["a.ts", Buffer.from("drift")], ["b.fungi", secondBytes]]), { label: "SOURCE_MANIFEST" }), /SOURCE_ORIGIN_GIT_BLOB_SET/);

  let traps = 0;
  const proxy = new Proxy(new Map(), {
    getPrototypeOf() { traps += 1; throw new Error("trap"); },
    get() { traps += 1; throw new Error("trap"); },
  });
  assert.throws(() => gitSource.admitFrozenBlobSet(rows, proxy, { label: "SOURCE_MANIFEST" }), /SOURCE_ORIGIN_GIT_BLOB_SET/);
  assert.equal(traps, 0);

  const gitOid = createHash("sha1")
    .update(Buffer.from(`blob ${secondBytes.length}\0`, "utf8"))
    .update(secondBytes)
    .digest("hex");
  const fullRow = [{
    path: "b.fungi",
    mode: "100644",
    blobOid: gitOid,
    objectFormat: "sha1",
    byteLength: secondBytes.length,
    rawSha256: sha256(secondBytes),
  }];
  assert.doesNotThrow(() => gitSource.admitFrozenBlobSet(fullRow, new Map([["b.fungi", secondBytes]]), { label: "SOURCE_MANIFEST" }));
  const oidDrift = structuredClone(fullRow);
  oidDrift[0].blobOid = "f".repeat(40);
  assert.throws(() => gitSource.admitFrozenBlobSet(oidDrift, new Map([["b.fungi", secondBytes]]), { label: "SOURCE_MANIFEST" }), /SOURCE_ORIGIN_GIT_BLOB_SET/);
});

test("frozen blob admission closes Buffer extent properties before caller effects", async (t) => {
  const expected = Buffer.from("sealed", "utf8");
  const rows = [{ path: "sealed.ts", byteLength: expected.length, rawSha256: sha256(expected) }];
  const admit = (bytes) => gitSource.admitFrozenBlobSet(
    rows,
    new Map([["sealed.ts", bytes]]),
    { label: "SOURCE_MANIFEST" },
  );
  const expectClosedRefusal = (bytes) => assert.throws(
    () => admit(bytes),
    (error) => error?.code === "SOURCE_ORIGIN_GIT_BLOB_SET",
  );

  await t.test("own buffer accessor", () => {
    let effects = 0;
    let failure;
    const hostile = Buffer.from(expected);
    Object.defineProperty(hostile, "buffer", {
      configurable: true,
      enumerable: true,
      get() {
        effects += 1;
        return new ArrayBuffer(expected.length);
      },
    });
    try { admit(hostile); } catch (error) { failure = error; }
    assert.equal(effects, 0);
    assert.equal(failure?.code, "SOURCE_ORIGIN_GIT_BLOB_SET");
  });

  for (const property of ["length", "byteLength", "byteOffset"]) {
    await t.test(`own ${property} property`, () => {
      const hostile = Buffer.from(expected);
      Object.defineProperty(hostile, property, {
        configurable: true,
        enumerable: true,
        value: expected.length,
      });
      expectClosedRefusal(hostile);
    });
  }

  await t.test("proxied Buffer", () => {
    let effects = 0;
    const hostile = new Proxy(Buffer.from(expected), {
      get() { effects += 1; throw new Error("get trap ran"); },
      getOwnPropertyDescriptor() { effects += 1; throw new Error("descriptor trap ran"); },
      getPrototypeOf() { effects += 1; throw new Error("prototype trap ran"); },
      ownKeys() { effects += 1; throw new Error("keys trap ran"); },
    });
    expectClosedRefusal(hostile);
    assert.equal(effects, 0);
  });

  await t.test("proxy in a forged Buffer prototype chain", () => {
    let effects = 0;
    const hostilePrototype = new Proxy(Buffer.prototype, {
      getPrototypeOf() { effects += 1; throw new Error("nested prototype trap ran"); },
    });
    const hostile = Object.create(hostilePrototype);
    let failure;
    let result;
    try { result = admit(hostile); } catch (error) { failure = error; }
    assert.equal(effects, 0);
    assert.equal(result, undefined);
    assert.equal(failure?.code, "SOURCE_ORIGIN_GIT_BLOB_SET");
  });

  await t.test("post-import Buffer hasInstance accessor refuses before effects", () => {
    const descriptor = Object.getOwnPropertyDescriptor(Buffer, Symbol.hasInstance);
    let effects = 0;
    let failure;
    let result;
    try {
      Object.defineProperty(Buffer, Symbol.hasInstance, {
        configurable: true,
        get() { effects += 1; throw new Error("Buffer hasInstance accessor ran"); },
      });
      try { result = admit(Buffer.from(expected)); } catch (error) { failure = error; }
    } finally {
      if (descriptor === undefined) Reflect.deleteProperty(Buffer, Symbol.hasInstance);
      else Object.defineProperty(Buffer, Symbol.hasInstance, descriptor);
    }
    assert.equal(effects, 0);
    assert.equal(result, undefined);
    assert.equal(failure?.code, "SOURCE_ORIGIN_GIT_BLOB_SET");
  });

  await t.test("exact Buffer", () => {
    assert.equal(admit(Buffer.from(expected)).get("sealed.ts").toString("utf8"), "sealed");
  });
});

test("defensive blob capabilities close construction, iteration, bytes, and re-admission", async (t) => {
  const expected = Buffer.from("sealed", "utf8");
  const rows = [{ path: "sealed.ts", byteLength: expected.length, rawSha256: sha256(expected) }];
  const admit = (blobs, selectedRows = rows) => gitSource.admitFrozenBlobSet(
    selectedRows,
    blobs,
    { label: "SOURCE_MANIFEST" },
  );
  const fresh = () => admit(new Map([["sealed.ts", Buffer.from(expected)]]));
  const text = (bytes) => Buffer.from(bytes).toString("utf8");
  const assertClosedRefusal = (operation, expectedEffects = 0, observeEffects = () => 0) => {
    let failure;
    let result;
    try { result = operation(); } catch (error) { failure = error; }
    assert.equal(observeEffects(), expectedEffects);
    assert.equal(result, undefined);
    assert.equal(failure?.code, "SOURCE_ORIGIN_GIT_BLOB_SET");
  };

  await t.test("capability has no constructor or prototype and exposes only the required frozen surface", () => {
    const admitted = fresh();
    assert.equal(Object.getPrototypeOf(admitted), null);
    assert.equal(Object.isFrozen(admitted), true);
    assert.equal("constructor" in admitted, false);
    assert.equal("prototype" in admitted, false);
    assert.deepEqual(Object.getOwnPropertyNames(admitted).sort(), [
      "entries", "get", "has", "keys", "size", "values",
    ]);
    assert.deepEqual(Object.getOwnPropertySymbols(admitted), [Symbol.iterator]);
    assert.equal(admitted.forEach, undefined);
    for (const property of ["get", "has", "entries", "keys", "values", Symbol.iterator]) {
      const descriptor = Object.getOwnPropertyDescriptor(admitted, property);
      assert.equal(typeof descriptor?.value, "function");
      assert.equal(descriptor?.configurable, false);
      assert.equal(descriptor?.writable, false);
      assert.equal(Object.isFrozen(descriptor.value), true);
      assert.equal(Object.getPrototypeOf(descriptor.value), null);
      assert.equal("constructor" in descriptor.value, false);
      assert.equal("prototype" in descriptor.value, false);
    }
    const sizeDescriptor = Object.getOwnPropertyDescriptor(admitted, "size");
    assert.equal(typeof sizeDescriptor?.get, "function");
    assert.equal(sizeDescriptor?.configurable, false);
    assert.equal(Object.isFrozen(sizeDescriptor.get), true);
    assert.equal(Object.getPrototypeOf(sizeDescriptor.get), null);
    assert.equal("constructor" in sizeDescriptor.get, false);
    assert.equal("prototype" in sizeDescriptor.get, false);
  });

  await t.test("iterators and entry pairs are frozen null-prototype branded capabilities", () => {
    const admitted = fresh();
    const iterator = admitted.entries();
    assert.equal(Object.getPrototypeOf(iterator), null);
    assert.equal(Object.isFrozen(iterator), true);
    assert.equal("constructor" in iterator, false);
    assert.deepEqual(Object.getOwnPropertyNames(iterator), ["next"]);
    assert.deepEqual(Object.getOwnPropertySymbols(iterator), [Symbol.iterator]);
    assert.equal(Object.getPrototypeOf(iterator.next), null);
    assert.equal(Object.getPrototypeOf(iterator[Symbol.iterator]), null);
    assert.equal(iterator[Symbol.iterator](), iterator);
    const first = iterator.next();
    assert.equal(Object.getPrototypeOf(first), null);
    assert.equal(Object.isFrozen(first), true);
    assert.equal(first.done, false);
    const pair = first.value;
    assert.equal(Array.isArray(pair), false);
    assert.equal(Object.getPrototypeOf(pair), null);
    assert.equal(Object.isFrozen(pair), true);
    assert.deepEqual(Object.getOwnPropertyNames(pair), ["0", "1", "length"]);
    assert.equal(pair.length, 2);
    assert.equal(pair[0], "sealed.ts");
    assert.equal(text(pair[1]), "sealed");
    const finished = iterator.next();
    assert.equal(Object.getPrototypeOf(finished), null);
    assert.equal(Object.isFrozen(finished), true);
    assert.equal(finished.done, true);
    assert.equal(finished.value, undefined);
  });

  await t.test("branded re-admission succeeds without public dispatch", () => {
    const admitted = fresh();
    const readmitted = admit(admitted);
    assert.equal(text(readmitted.get("sealed.ts")), "sealed");
    assert.deepEqual([...readmitted.keys()], ["sealed.ts"]);
  });

  await t.test("lookalikes, accessors, and a proxy of the capability refuse before effects", () => {
    const admitted = fresh();
    let effects = 0;
    const traps = {
      get() { effects += 1; throw new Error("get trap ran"); },
      getOwnPropertyDescriptor() { effects += 1; throw new Error("descriptor trap ran"); },
      getPrototypeOf() { effects += 1; throw new Error("prototype trap ran"); },
      ownKeys() { effects += 1; throw new Error("keys trap ran"); },
    };
    assertClosedRefusal(() => admit(new Proxy(admitted, traps)), 0, () => effects);

    const lookalike = Object.create(null);
    Object.defineProperties(lookalike, Object.getOwnPropertyDescriptors(admitted));
    Object.freeze(lookalike);
    assertClosedRefusal(() => admit(lookalike));

    const ownAccessor = Object.create(null);
    Object.defineProperty(ownAccessor, "entries", {
      configurable: true,
      enumerable: true,
      get() { effects += 1; throw new Error("own accessor ran"); },
    });
    assertClosedRefusal(() => admit(ownAccessor), 0, () => effects);

    const inherited = Object.create(Object.defineProperty(Object.create(null), "entries", {
      configurable: true,
      enumerable: true,
      get() { effects += 1; throw new Error("inherited accessor ran"); },
    }));
    assertClosedRefusal(() => admit(inherited), 0, () => effects);
  });

  await t.test("ordinary Map own accessors refuse and inherited poisons are bypassed", () => {
    const hostile = new Map([["sealed.ts", Buffer.from(expected)]]);
    let effects = 0;
    Object.defineProperty(hostile, "entries", {
      configurable: true,
      enumerable: true,
      get() { effects += 1; throw new Error("own accessor ran"); },
    });
    assertClosedRefusal(() => admit(hostile), 0, () => effects);

    const descriptor = Object.getOwnPropertyDescriptor(Map.prototype, "entries");
    let result;
    let failure;
    try {
      Object.defineProperty(Map.prototype, "entries", {
        ...descriptor,
        value() { effects += 1; throw new Error("inherited method ran"); },
      });
      try { result = fresh(); } catch (error) { failure = error; }
    } finally {
      Object.defineProperty(Map.prototype, "entries", descriptor);
    }
    assert.equal(effects, 0);
    assert.equal(failure, undefined);
    assert.equal(text(result.get("sealed.ts")), "sealed");
  });

  await t.test("native Map internal-slot mutation cannot alter the capability", () => {
    const admitted = fresh();
    assert.throws(() => Reflect.apply(Map.prototype.set, admitted, ["evil.ts", Buffer.from("evil")]), TypeError);
    assert.equal(admitted.size, 1);
    assert.equal(admitted.has("evil.ts"), false);
    assert.equal(text(admitted.get("sealed.ts")), "sealed");
  });

  await t.test("extracted methods and iterator methods brand this with a stable refusal", () => {
    const admitted = fresh();
    let effects = 0;
    const forged = new Proxy(Object.create(null), {
      get() { effects += 1; throw new Error("get trap ran"); },
      getOwnPropertyDescriptor() { effects += 1; throw new Error("descriptor trap ran"); },
      getPrototypeOf() { effects += 1; throw new Error("prototype trap ran"); },
      ownKeys() { effects += 1; throw new Error("keys trap ran"); },
    });
    for (const property of ["get", "has", "entries", "keys", "values", Symbol.iterator]) {
      assertClosedRefusal(
        () => Reflect.apply(admitted[property], forged, property === "get" || property === "has" ? ["sealed.ts"] : []),
        0,
        () => effects,
      );
    }
    const sizeGetter = Object.getOwnPropertyDescriptor(admitted, "size").get;
    assertClosedRefusal(() => Reflect.apply(sizeGetter, forged, []), 0, () => effects);
    const iterator = admitted.entries();
    assertClosedRefusal(() => Reflect.apply(iterator.next, forged, []), 0, () => effects);
    assertClosedRefusal(() => Reflect.apply(iterator[Symbol.iterator], forged, []), 0, () => effects);
  });

  await t.test("keys are primitive strings and no caller coercion can run", () => {
    const admitted = fresh();
    let effects = 0;
    const hostileKey = Object.create(null);
    for (const property of ["toString", "valueOf", Symbol.toPrimitive]) {
      Object.defineProperty(hostileKey, property, {
        configurable: true,
        get() { effects += 1; throw new Error("key coercion ran"); },
      });
    }
    for (const key of [hostileKey, 1, null, undefined, Symbol("sealed.ts")]) {
      assertClosedRefusal(() => admitted.get(key), 0, () => effects);
      assertClosedRefusal(() => admitted.has(key), 0, () => effects);
    }
    const hostileInput = new Map([[hostileKey, Buffer.from(expected)]]);
    assertClosedRefusal(() => admit(hostileInput), 0, () => effects);
  });

  await t.test("unordered input canonicalizes while duplicate rows refuse without an artifact", () => {
    const first = Buffer.from("first", "utf8");
    const second = Buffer.from("second", "utf8");
    const orderedRows = [
      { path: "a.ts", byteLength: first.length, rawSha256: sha256(first) },
      { path: "b.ts", byteLength: second.length, rawSha256: sha256(second) },
    ];
    const admitted = admit(new Map([["b.ts", second], ["a.ts", first]]), orderedRows);
    assert.deepEqual([...admitted.keys()], ["a.ts", "b.ts"]);
    assert.equal(text(admitted.get("a.ts")), "first");
    assert.equal(text(admitted.get("b.ts")), "second");
    assertClosedRefusal(() => admit(
      new Map([["a.ts", first]]),
      [orderedRows[0], { ...orderedRows[0] }],
    ));
  });

  await t.test("original and returned bytes cannot mutate private state", () => {
    const original = Buffer.from(expected);
    const admitted = admit(new Map([["sealed.ts", original]]));
    original.fill(0);
    assert.equal(text(admitted.get("sealed.ts")), "sealed");
    const returned = admitted.get("sealed.ts");
    returned.fill(0);
    assert.equal(text(admitted.get("sealed.ts")), "sealed");
    const iteratorSnapshot = admitted.entries().next().value;
    iteratorSnapshot[1].fill(0);
    assert.equal(text(admitted.get("sealed.ts")), "sealed");
  });

  await t.test("pinned Node byte copy bypasses poisoned Buffer and TypedArray extent dispatch", {
    skip: process.version !== "v24.18.0",
  }, () => {
    const SafeObject = Object;
    const SafeBuffer = Buffer;
    const SafeUint8Array = Uint8Array;
    const typedArrayPrototype = SafeObject.getPrototypeOf(SafeUint8Array.prototype);
    const original = SafeBuffer.from([7, 8, 9]);
    const selectedRows = [{ path: "bytes.ts", byteLength: 3, rawSha256: sha256(original) }];
    const source = new Map([["bytes.ts", original]]);
    const restorations = [];
    let effects = 0;
    let failure;
    let copied;
    const replace = (target, property, replacement) => {
      const descriptor = SafeObject.getOwnPropertyDescriptor(target, property);
      restorations.push(() => {
        if (descriptor === undefined) Reflect.deleteProperty(target, property);
        else SafeObject.defineProperty(target, property, descriptor);
      });
      SafeObject.defineProperty(target, property, replacement);
    };
    const poisonGetter = (target, property) => replace(target, property, {
      configurable: true,
      enumerable: false,
      get() { effects += 1; throw new Error(`poisoned ${String(property)}`); },
    });
    const poisonFunction = (target, property) => {
      const descriptor = SafeObject.getOwnPropertyDescriptor(target, property);
      replace(target, property, {
        ...descriptor,
        configurable: true,
        value() { effects += 1; throw new Error(`poisoned ${String(property)}`); },
      });
    };
    try {
      for (const property of ["length", "buffer", "byteLength", "byteOffset", "constructor"]) {
        poisonGetter(SafeBuffer.prototype, property);
      }
      for (const property of ["length", "buffer", "byteLength", "byteOffset"]) {
        poisonGetter(typedArrayPrototype, property);
      }
      for (const property of ["set", "slice", "subarray"]) poisonFunction(SafeUint8Array.prototype, property);
      for (const property of ["from", "isBuffer", "allocUnsafe"]) poisonFunction(SafeBuffer, property);
      poisonGetter(SafeUint8Array, Symbol.species);
      replace(globalThis, "Buffer", {
        configurable: true,
        enumerable: false,
        writable: true,
        value() { effects += 1; throw new Error("rebound Buffer ran"); },
      });
      replace(globalThis, "Uint8Array", {
        configurable: true,
        enumerable: false,
        writable: true,
        value() { effects += 1; throw new Error("rebound Uint8Array ran"); },
      });
      try { copied = admit(source, selectedRows).get("bytes.ts"); } catch (error) { failure = error; }
    } finally {
      for (let index = restorations.length - 1; index >= 0; index -= 1) restorations[index]();
    }
    assert.equal(effects, 0);
    assert.equal(failure, undefined);
    assert.deepEqual([...copied], [7, 8, 9]);
  });

  await t.test("post-import global and prototype poison cannot steer retained capability operations", () => {
    const SafeObject = Object;
    const SafeProxy = Proxy;
    const SafeFunction = Function;
    const SafeMap = Map;
    const SafeArray = Array;
    const SafeWeakMap = WeakMap;
    const SafeMapGet = SafeMap.prototype.get;
    const SafeMapSet = SafeMap.prototype.set;
    const SafeReflectApply = Reflect.apply;
    const admitted = fresh();
    const restorations = [];
    let effects = 0;
    let failure;
    let observed;
    const replace = (target, property, replacement) => {
      const descriptor = SafeObject.getOwnPropertyDescriptor(target, property);
      restorations.push(() => {
        if (descriptor === undefined) Reflect.deleteProperty(target, property);
        else SafeObject.defineProperty(target, property, descriptor);
      });
      SafeObject.defineProperty(target, property, replacement);
    };
    const poisonData = (target, property) => {
      const descriptor = SafeObject.getOwnPropertyDescriptor(target, property);
      replace(target, property, {
        ...descriptor,
        configurable: true,
        value() { effects += 1; throw new Error(`poisoned ${String(property)}`); },
      });
    };
    const poisonGlobal = (property) => replace(globalThis, property, {
      configurable: true,
      enumerable: false,
      writable: true,
      value: new SafeProxy(function poisonedGlobal() {}, {
        apply() { effects += 1; throw new Error(`called rebound ${property}`); },
        construct() { effects += 1; throw new Error(`constructed rebound ${property}`); },
        get() { effects += 1; throw new Error(`read rebound ${property}`); },
      }),
    });
    const generator = (function* generatorProbe() {})();
    let generatorPrototype = SafeObject.getPrototypeOf(generator);
    while (generatorPrototype !== null && !SafeObject.hasOwn(generatorPrototype, "next")) {
      generatorPrototype = SafeObject.getPrototypeOf(generatorPrototype);
    }
    const mapIteratorPrototype = SafeObject.getPrototypeOf(new SafeMap().entries());
    const arrayIteratorPrototype = SafeObject.getPrototypeOf([][Symbol.iterator]());
    try {
      for (const property of ["call", "apply", "bind"]) poisonData(SafeFunction.prototype, property);
      for (const property of ["get", "set", "has", "delete", "clear", "entries", "keys", "values", Symbol.iterator]) {
        poisonData(SafeMap.prototype, property);
      }
      for (const property of ["get", "set", "has", "delete"]) poisonData(SafeWeakMap.prototype, property);
      const globalNames = [
        "Function", "Object", "Map", "Array", "WeakMap", "Buffer", "Uint8Array",
        "ArrayBuffer", "SharedArrayBuffer", "Proxy",
      ];
      for (let index = 0; index < globalNames.length; index += 1) poisonGlobal(globalNames[index]);
      poisonData(SafeArray.prototype, Symbol.iterator);
      if (generatorPrototype !== null) poisonData(generatorPrototype, "next");
      poisonData(mapIteratorPrototype, "next");
      poisonData(arrayIteratorPrototype, "next");
      try {
        const readmitted = admit(admitted);
        const snapshot = new SafeMap();
        const snapshotIterator = readmitted.entries();
        while (true) {
          const step = snapshotIterator.next();
          if (step.done) break;
          const pair = step.value;
          SafeReflectApply(SafeMapSet, snapshot, [pair[0], pair[1]]);
        }
        const entryIterator = readmitted.entries();
        const entry = entryIterator.next();
        const end = entryIterator.next();
        const keyIterator = readmitted.keys();
        const key = keyIterator.next();
        const valueIterator = readmitted.values();
        const value = valueIterator.next();
        const defaultIterator = readmitted[Symbol.iterator]();
        const defaultEntry = defaultIterator.next();
        observed = {
          defaultEntry,
          end,
          entry,
          has: readmitted.has("sealed.ts"),
          key,
          size: readmitted.size,
          snapshot: SafeReflectApply(SafeMapGet, snapshot, ["sealed.ts"]),
          direct: readmitted.get("sealed.ts"),
          value,
        };
      } catch (error) {
        failure = error;
      }
    } finally {
      for (let index = restorations.length - 1; index >= 0; index -= 1) restorations[index]();
    }
    assert.equal(effects, 0);
    assert.equal(failure, undefined);
    assert.equal(observed.size, 1);
    assert.equal(observed.has, true);
    assert.equal(text(observed.direct), "sealed");
    assert.equal(text(observed.snapshot), "sealed");
    assert.equal(observed.entry.done, false);
    assert.equal(observed.entry.value[0], "sealed.ts");
    assert.equal(text(observed.entry.value[1]), "sealed");
    assert.equal(observed.end.done, true);
    assert.equal(observed.key.value, "sealed.ts");
    assert.equal(text(observed.value.value), "sealed");
    assert.equal(observed.defaultEntry.value[0], "sealed.ts");
  });

  await t.test("SharedArrayBuffer-backed Buffer refuses with the stable code", {
    skip: typeof SharedArrayBuffer !== "function",
  }, () => {
    const backing = new SharedArrayBuffer(expected.length);
    const hostile = Buffer.from(backing);
    hostile.set(expected);
    assertClosedRefusal(() => admit(new Map([["sealed.ts", hostile]])));
  });
});

test("blob capability copies use isolated exact ArrayBuffer backing", {
  skip: process.version !== "v24.18.0",
}, async (t) => {
  const marker = "RD0873_ALIAS_MARKER_6A_3f6c9b21";
  const markerBytes = [];
  for (let index = 0; index < marker.length; index += 1) markerBytes.push(marker.charCodeAt(index));

  const assertMarker = (bytes) => {
    assert.equal(bytes.length, markerBytes.length);
    for (let index = 0; index < markerBytes.length; index += 1) {
      assert.equal(bytes[index], markerBytes[index], `marker byte ${index}`);
    }
  };
  const fresh = () => {
    const original = Buffer.from(marker, "utf8");
    const rows = [{ path: "alias.ts", byteLength: original.length, rawSha256: sha256(original) }];
    const capability = gitSource.admitFrozenBlobSet(
      rows,
      new Map([["alias.ts", original]]),
      { label: "SOURCE_MANIFEST" },
    );
    return { capability, original, rows };
  };
  const corruptExpandedMatchesOutsideView = (bytes) => {
    const expanded = new Uint8Array(bytes.buffer);
    const mutations = [];
    const visibleStart = bytes.byteOffset;
    for (let start = 0; start <= expanded.length - markerBytes.length; start += 1) {
      let matches = true;
      for (let offset = 0; offset < markerBytes.length; offset += 1) {
        if (expanded[start + offset] !== markerBytes[offset]) {
          matches = false;
          break;
        }
      }
      if (!matches || start === visibleStart) continue;
      mutations.push([start, expanded[start]]);
      expanded[start] ^= 0xff;
    }
    return { expanded, mutations };
  };
  const restoreMutations = ({ expanded, mutations }) => {
    for (let index = 0; index < mutations.length; index += 1) {
      expanded[mutations[index][0]] = mutations[index][1];
    }
  };

  await t.test("expanding the caller Buffer cannot reach private held bytes", () => {
    const { capability, original } = fresh();
    const attack = corruptExpandedMatchesOutsideView(original);
    try {
      assertMarker(original);
      assertMarker(capability.get("alias.ts"));
    } finally {
      restoreMutations(attack);
    }
  });

  await t.test("expanding a returned Buffer cannot reach private held bytes", () => {
    const { capability } = fresh();
    const returned = capability.get("alias.ts");
    const attack = corruptExpandedMatchesOutsideView(returned);
    try {
      assertMarker(returned);
      assertMarker(capability.get("alias.ts"));
    } finally {
      restoreMutations(attack);
    }
  });

  await t.test("every returned and re-admitted copy has one exact unshared backing", () => {
    const { capability, original, rows } = fresh();
    const returned = capability.get("alias.ts");
    const readmitted = gitSource.admitFrozenBlobSet(rows, capability, { label: "SOURCE_MANIFEST" });
    const readmittedBytes = readmitted.get("alias.ts");
    for (const bytes of [returned, readmittedBytes]) {
      assert.equal(bytes.byteOffset, 0);
      assert.equal(bytes.buffer.byteLength, bytes.byteLength);
      assertMarker(bytes);
    }
    assert.notEqual(returned.buffer, original.buffer);
    assert.notEqual(readmittedBytes.buffer, original.buffer);
    assert.notEqual(readmittedBytes.buffer, returned.buffer);
    returned.fill(0);
    assertMarker(capability.get("alias.ts"));
    assertMarker(readmitted.get("alias.ts"));
  });
});

test("post-import blob operations bypass mutable global and prototype dispatch", async (t) => {
  const SafeObject = Object;
  const safeGetDescriptor = Object.getOwnPropertyDescriptor;
  const safeDefineProperty = Object.defineProperty;
  const safeDeleteProperty = Reflect.deleteProperty;
  const marker = Buffer.from("closed-dispatch", "utf8");
  const rows = [{ path: "closed.ts", byteLength: marker.length, rawSha256: sha256(marker) }];
  const input = new Map([["closed.ts", marker]]);
  const parserPolicy = validateParserPolicy(JSON.parse(await readFile(
    new URL("logic-aig-source-origin-parser-policy.json", GOVERNANCE),
    "utf8",
  )));
  const gateWorkingBytes = await readFile(new URL(
    "../../packages-ts/galerina-core-compiler/tests/fixtures/gate-v3/REFERENCE-VERDICTS.json",
    import.meta.url,
  ));
  const gateBytes = Buffer.from(gateWorkingBytes.toString("utf8").replaceAll("\r\n", "\n"), "utf8");
  const fresh = () => gitSource.admitFrozenBlobSet(rows, input, { label: "SOURCE_MANIFEST" });
  const assertMarker = (bytes) => assert.equal(Buffer.from(bytes).toString("utf8"), "closed-dispatch");

  const exercise = (target, property, replacement, operation, verify) => {
    const descriptor = safeGetDescriptor(target, property);
    let effects = 0;
    let failure;
    let result;
    const attack = () => {
      effects += 1;
      throw new Error(`ATTACKER_${String(property).toUpperCase()}`);
    };
    safeDefineProperty(target, property, replacement(descriptor, attack));
    try { result = operation(); } catch (error) { failure = error; }
    finally {
      if (descriptor === undefined) safeDeleteProperty(target, property);
      else safeDefineProperty(target, property, descriptor);
    }
    assert.equal(effects, 0);
    assert.equal(failure, undefined);
    verify(result);
  };
  const replaceFunction = (descriptor, attack) => ({
    ...descriptor,
    configurable: true,
    value() { attack(); },
  });

  await t.test("global Symbol cannot steer capability iterator construction", () => {
    const capability = fresh();
    exercise(
      globalThis,
      "Symbol",
      (descriptor, attack) => ({
        ...descriptor,
        configurable: true,
        value: new Proxy(descriptor.value, { get() { attack(); } }),
      }),
      () => capability.entries(),
      (iterator) => {
        const first = iterator.next();
        assert.equal(first.done, false);
        assert.equal(first.value[0], "closed.ts");
        assertMarker(first.value[1]);
      },
    );
  });

  await t.test("global Number cannot steer returned-byte validation", () => {
    const capability = fresh();
    exercise(
      globalThis,
      "Number",
      (descriptor, attack) => ({
        ...descriptor,
        configurable: true,
        value: new Proxy(descriptor.value, { get() { attack(); } }),
      }),
      () => capability.get("closed.ts"),
      assertMarker,
    );
  });

  await t.test("Buffer.poolSize cannot steer allocation", {
    skip: process.version !== "v24.18.0",
  }, () => {
    const capability = fresh();
    exercise(
      Buffer,
      "poolSize",
      (descriptor, attack) => ({ configurable: true, enumerable: descriptor.enumerable, get() { attack(); } }),
      () => capability.get("closed.ts"),
      assertMarker,
    );
  });

  await t.test("Buffer.poolSize mutation is refused before child-output aggregation", {
    skip: process.version !== "v24.18.0" || platform() !== "win32",
    timeout: 900_000,
  }, async () => {
    const descriptor = safeGetDescriptor(Buffer, "poolSize");
    const gitExecutableLocator = fileURLToPath(new URL(
      "../../.superpowers/sdd/2026-08-31-rd0873-portable-artifact-admission/toolchains/mingit-2.55.0.5/expanded/cmd/git.exe",
      import.meta.url,
    ));
    let effects = 0;
    let failure;
    safeDefineProperty(Buffer, "poolSize", {
      configurable: true,
      enumerable: descriptor.enumerable,
      get() {
        effects += 1;
        return descriptor.value;
      },
    });
    try {
      await gitSource.captureFrozenSource({
        commitOid: "a".repeat(40),
        gitExecutableLocator,
      });
    } catch (error) {
      failure = error;
    } finally {
      safeDefineProperty(Buffer, "poolSize", descriptor);
    }
    assert.equal(failure?.code, "SOURCE_ORIGIN_GIT_PROCESS");
    assert.equal(effects, 0);
  });

  await t.test("Array prototype index setters cannot observe admission", () => {
    const descriptor = safeGetDescriptor(Array.prototype, "0");
    let effects = 0;
    let failure;
    let result;
    safeDefineProperty(Array.prototype, "0", {
      configurable: true,
      set() { effects += 1; },
    });
    try { result = fresh(); } catch (error) { failure = error; }
    finally {
      if (descriptor === undefined) safeDeleteProperty(Array.prototype, "0");
      else safeDefineProperty(Array.prototype, "0", descriptor);
    }
    assert.equal(effects, 0);
    assert.equal(failure, undefined);
    assertMarker(result.get("closed.ts"));
  });

  await t.test("Object prototype descriptor lookalikes cannot reopen an accessor candidate", () => {
    const descriptor = safeGetDescriptor(Object.prototype, "value");
    let effects = 0;
    let failure;
    let result;
    const options = {};
    safeDefineProperty(options, "label", {
      configurable: true,
      enumerable: true,
      get() { effects += 1; throw new Error("ATTACKER_OPTION_GET"); },
    });
    safeDefineProperty(Object.prototype, "value", {
      configurable: true,
      get() { effects += 1; throw new Error("ATTACKER_DESCRIPTOR_GET"); },
    });
    try { result = gitSource.admitFrozenBlobSet(rows, input, options); } catch (error) { failure = error; }
    finally {
      if (descriptor === undefined) safeDeleteProperty(Object.prototype, "value");
      else safeDefineProperty(Object.prototype, "value", descriptor);
    }
    assert.equal(effects, 0);
    assert.equal(result, undefined);
    assert.equal(failure?.code, "SOURCE_ORIGIN_GIT_BLOB_SET");
  });

  for (const property of ["name", "code"]) {
    await t.test(`Error.prototype.${property} setters cannot observe stable refusal construction`, () => {
      const descriptor = safeGetDescriptor(Error.prototype, property);
      let effects = 0;
      let failure;
      safeDefineProperty(Error.prototype, property, {
        configurable: true,
        set() { effects += 1; throw "ATTACKER_ERROR_SET"; },
      });
      try {
        gitSource.admitFrozenBlobSet(rows, input, { label: "INVALID" });
      } catch (error) {
        failure = error;
      } finally {
        if (descriptor === undefined) safeDeleteProperty(Error.prototype, property);
        else safeDefineProperty(Error.prototype, property, descriptor);
      }
      assert.equal(effects, 0);
      assert.equal(failure?.code, "SOURCE_ORIGIN_GIT_BLOB_SET");
    });
  }

  await t.test("a prior refusal cannot redirect later internal refusal recognition", () => {
    let prior;
    try {
      gitSource.admitFrozenBlobSet(rows, input, { label: "INVALID" });
    } catch (error) {
      prior = error;
    }
    assert(prior);
    const refusalConstructor = prior.constructor;
    const descriptor = safeGetDescriptor(refusalConstructor, Symbol.hasInstance);
    let effects = 0;
    let installed = false;
    let failure;
    try {
      safeDefineProperty(refusalConstructor, Symbol.hasInstance, {
        configurable: true,
        value() { effects += 1; throw "ATTACKER_HAS_INSTANCE"; },
      });
      installed = true;
    } catch {
      // A closed refusal constructor is also acceptable.
    }
    try {
      const file = fileURLToPath(import.meta.url);
      gitSource.assertCanonicalRepositoryLayout({
        repositoryRoot: file,
        toplevel: file,
        gitDirectory: file,
        indexPath: file,
      });
    } catch (error) {
      failure = error;
    } finally {
      if (installed) {
        if (descriptor === undefined) safeDeleteProperty(refusalConstructor, Symbol.hasInstance);
        else safeDefineProperty(refusalConstructor, Symbol.hasInstance, descriptor);
      }
    }
    assert.equal(effects, 0);
    assert.equal(failure?.code, "SOURCE_ORIGIN_GIT_LAYOUT");
  });

  for (const property of ["includes", "startsWith", "endsWith", "normalize", "split", "charCodeAt"]) {
    await t.test(`String.prototype.${property} cannot steer re-admission`, () => {
      const capability = fresh();
      exercise(
        String.prototype,
        property,
        replaceFunction,
        () => gitSource.admitFrozenBlobSet(rows, capability, { label: "SOURCE_MANIFEST" }),
        (readmitted) => assertMarker(readmitted.get("closed.ts")),
      );
    });
  }

  await t.test("Array.prototype.some cannot steer re-admission", () => {
    const capability = fresh();
    exercise(
      Array.prototype,
      "some",
      replaceFunction,
      () => gitSource.admitFrozenBlobSet(rows, capability, { label: "SOURCE_MANIFEST" }),
      (readmitted) => assertMarker(readmitted.get("closed.ts")),
    );
  });

  await t.test("RegExp.prototype.test cannot steer re-admission", () => {
    const capability = fresh();
    exercise(
      RegExp.prototype,
      "test",
      replaceFunction,
      () => gitSource.admitFrozenBlobSet(rows, capability, { label: "SOURCE_MANIFEST" }),
      (readmitted) => assertMarker(readmitted.get("closed.ts")),
    );
  });

  const hashProbe = createHash("sha256");
  let hashPrototype = SafeObject.getPrototypeOf(hashProbe);
  while (hashPrototype !== null && !SafeObject.hasOwn(hashPrototype, "update")) {
    hashPrototype = SafeObject.getPrototypeOf(hashPrototype);
  }
  assert(hashPrototype);
  for (const property of ["update", "digest"]) {
    await t.test(`hash prototype ${property} cannot steer re-admission`, () => {
      const capability = fresh();
      exercise(
        hashPrototype,
        property,
        replaceFunction,
        () => gitSource.admitFrozenBlobSet(rows, capability, { label: "SOURCE_MANIFEST" }),
        (readmitted) => assertMarker(readmitted.get("closed.ts")),
      );
    });
    await t.test(`hash prototype ${property} cannot steer Gate-owner authentication`, () => {
      exercise(
        hashPrototype,
        property,
        replaceFunction,
        () => gitSource.authenticateGateOwnerBytes(gateBytes, parserPolicy),
        (accepted) => {
          assert.equal(accepted.rawSha256, "d83ce2590520b152e1c838322e1762e4840c274e812bf6006e275118ada59467");
          assert.equal(accepted.semanticDigest, "4dfceb7f2bf2b6642c3b0cc2838735d41b8aad9e3c08e45f394637eb43bf8a58");
        },
      );
    });
  }

  await t.test("Array.prototype.push cannot steer Gate-owner authentication", () => {
    exercise(
      Array.prototype,
      "push",
      replaceFunction,
      () => gitSource.authenticateGateOwnerBytes(gateBytes, parserPolicy),
      (accepted) => {
        assert.equal(accepted.rawSha256, "d83ce2590520b152e1c838322e1762e4840c274e812bf6006e275118ada59467");
        assert.equal(accepted.semanticDigest, "4dfceb7f2bf2b6642c3b0cc2838735d41b8aad9e3c08e45f394637eb43bf8a58");
      },
    );
  });

  const gitExecutableLocator = fileURLToPath(new URL(
    "../../.superpowers/sdd/2026-08-31-rd0873-portable-artifact-admission/toolchains/mingit-2.55.0.5/expanded/cmd/git.exe",
    import.meta.url,
  ));
  for (const property of ["from", "concat"]) {
    await t.test(`Buffer.${property} cannot steer frozen-source capture through contract helpers`, async () => {
      const descriptor = safeGetDescriptor(Buffer, property);
      let effects = 0;
      let failure;
      safeDefineProperty(Buffer, property, {
        ...descriptor,
        configurable: true,
        value() {
          effects += 1;
          throw new Error(`ATTACKER_BUFFER_${property.toUpperCase()}`);
        },
      });
      try {
        await gitSource.captureFrozenSource({
          commitOid: "a".repeat(40),
          gitExecutableLocator,
        });
      } catch (error) {
        failure = error;
      } finally {
        safeDefineProperty(Buffer, property, descriptor);
      }
      assert.equal(effects, 0);
      assert.equal(failure?.code, "SOURCE_ORIGIN_GIT_HEAD");
    });
  }
});

test("eighth-review Git boundary closes regex, synced hash and decorated Buffer attacks", async (t) => {
  const safeGetDescriptor = Object.getOwnPropertyDescriptor;
  const safeDefineProperty = Object.defineProperty;
  const gateWorkingBytes = await readFile(new URL(
    "../../packages-ts/galerina-core-compiler/tests/fixtures/gate-v3/REFERENCE-VERDICTS.json",
    import.meta.url,
  ));
  const gateBytes = Buffer.from(gateWorkingBytes.toString("utf8").replaceAll("\r\n", "\n"), "utf8");
  const parserPolicy = validateParserPolicy(JSON.parse(await readFile(
    new URL("logic-aig-source-origin-parser-policy.json", GOVERNANCE),
    "utf8",
  )));

  await t.test("captured RegExp exec preserves Gate-owner authentication", () => {
    const descriptor = safeGetDescriptor(RegExp.prototype, "exec");
    let effects = 0;
    let failure;
    let result;
    safeDefineProperty(RegExp.prototype, "exec", {
      ...descriptor,
      configurable: true,
      value() {
        effects += 1;
        throw new Error("ATTACKER_REGEXP_EXEC");
      },
    });
    try { result = gitSource.authenticateGateOwnerBytes(gateBytes, parserPolicy); } catch (error) { failure = error; }
    finally { safeDefineProperty(RegExp.prototype, "exec", descriptor); }
    assert.equal(effects, 0);
    assert.equal(failure, undefined);
    assert.equal(result?.rawSha256, "d83ce2590520b152e1c838322e1762e4840c274e812bf6006e275118ada59467");
    assert.equal(result?.semanticDigest, "4dfceb7f2bf2b6642c3b0cc2838735d41b8aad9e3c08e45f394637eb43bf8a58");
  });

  await t.test("syncBuiltinESMExports cannot replace hashing beneath frozen capture", { timeout: 900_000 }, async () => {
    const { createRequire, syncBuiltinESMExports } = await import("node:module");
    const require = createRequire(import.meta.url);
    const crypto = require("node:crypto");
    const descriptor = safeGetDescriptor(crypto, "createHash");
    const gitExecutableLocator = fileURLToPath(new URL(
      "../../.superpowers/sdd/2026-08-31-rd0873-portable-artifact-admission/toolchains/mingit-2.55.0.5/expanded/cmd/git.exe",
      import.meta.url,
    ));
    let effects = 0;
    let failure;
    safeDefineProperty(crypto, "createHash", {
      ...descriptor,
      value() {
        effects += 1;
        throw new Error("ATTACKER_CREATE_HASH");
      },
    });
    syncBuiltinESMExports();
    try {
      await gitSource.captureFrozenSource({ commitOid: "a".repeat(40), gitExecutableLocator });
    } catch (error) {
      failure = error;
    } finally {
      safeDefineProperty(crypto, "createHash", descriptor);
      syncBuiltinESMExports();
    }
    assert.equal(effects, 0);
    assert.equal(failure?.code, "SOURCE_ORIGIN_GIT_HEAD");
  });

  await t.test("a surplus own Buffer accessor refuses before admission without effects", () => {
    const bytes = Buffer.from("decorated", "utf8");
    const rows = [{ path: "decorated.ts", byteLength: bytes.length, rawSha256: sha256(bytes) }];
    let effects = 0;
    safeDefineProperty(bytes, "surplus", {
      configurable: true,
      enumerable: true,
      get() {
        effects += 1;
        throw new Error("ATTACKER_BUFFER_GET");
      },
    });
    let result;
    let failure;
    try {
      result = gitSource.admitFrozenBlobSet(
        rows,
        new Map([["decorated.ts", bytes]]),
        { label: "SOURCE_MANIFEST" },
      );
    } catch (error) {
      failure = error;
    }
    assert.equal(effects, 0);
    assert.equal(result, undefined);
    assert.equal(failure?.code, "SOURCE_ORIGIN_GIT_BLOB_SET");
  });
});

test("Task 6B git-source descriptors ignore inherited fields", { timeout: 900_000 }, async () => {
  const gitExecutableLocator = platform() === "win32"
    ? fileURLToPath(new URL(
      "../../.superpowers/sdd/2026-08-31-rd0873-portable-artifact-admission/toolchains/mingit-2.55.0.5/expanded/cmd/git.exe",
      import.meta.url,
    ))
    : "/usr/bin/git";
  const commitOid = await readPinnedHeadCommit(gitExecutableLocator);
  const invalidLine = Buffer.from([0xff]);
  const poison = installTask6BDescriptorFieldPoison();
  let refusal;
  let captured;
  let failure;
  try {
    try {
      gitSource.decodeGitLine(invalidLine);
    } catch (error) {
      refusal = error;
    }
    try {
      captured = await gitSource.captureFrozenSource({ commitOid, gitExecutableLocator });
    } catch (error) {
      failure = error;
    }
  } finally {
    poison.restore();
  }
  assert.deepEqual(poison.counts(), { get: 0, set: 0 });
  assert.equal(refusal?.name, "SourceOriginCaptureRefusal");
  assert.equal(refusal?.code, "SOURCE_ORIGIN_GIT_PROCESS");
  assert.equal(failure, undefined);
  assert.equal(captured?.owners.authorizing, false);
  assert.equal(captured?.sourceManifest.expectedHead, commitOid);
});

test("twelfth-review frozen capture async boundaries ignore inherited then capabilities", { timeout: 900_000, skip: platform() !== "win32" }, async (t) => {
  const gitExecutableLocator = fileURLToPath(new URL(
    "../../.superpowers/sdd/2026-08-31-rd0873-portable-artifact-admission/toolchains/mingit-2.55.0.5/expanded/cmd/git.exe",
    import.meta.url,
  ));
  const commitOid = await readPinnedHeadCommit(gitExecutableLocator);
  const safeBufferFrom = Buffer.from;
  const safeBufferIsBuffer = Buffer.isBuffer;
  const safeCreate = Object.create;
  const safeGetDescriptor = Object.getOwnPropertyDescriptor;
  const safeGetNames = Object.getOwnPropertyNames;
  const safeDefineProperty = Object.defineProperty;
  const safeDeleteProperty = Reflect.deleteProperty;
  const safeReflectApply = Reflect.apply;
  const safeHasOwn = Object.hasOwn;
  const prior = safeGetDescriptor(Object.prototype, "then");

  const freshCounters = () => ({
    total: 0,
    buffers: 0,
    repositoryState: 0,
    heldBlob: 0,
    manifests: 0,
    heldOwners: 0,
    capture: 0,
  });
  const classify = (receiver, counters) => {
    let matched = false;
    if (safeBufferIsBuffer(receiver)) { counters.buffers += 1; matched = true; }
    if (safeHasOwn(receiver, "repositoryRoot") && safeHasOwn(receiver, "treeRows") && safeHasOwn(receiver, "index")) { counters.repositoryState += 1; matched = true; }
    if (safeHasOwn(receiver, "locator") && safeHasOwn(receiver, "blobOid") && safeHasOwn(receiver, "bytes")) { counters.heldBlob += 1; matched = true; }
    if (safeHasOwn(receiver, "sourceManifest") && safeHasOwn(receiver, "sourceBlobs") && safeHasOwn(receiver, "resolutionInputs")) { counters.manifests += 1; matched = true; }
    if (safeHasOwn(receiver, "pins") && safeHasOwn(receiver, "exporter") && safeHasOwn(receiver, "ownerSetDigest")) { counters.heldOwners += 1; matched = true; }
    if (safeHasOwn(receiver, "observation") && safeHasOwn(receiver, "owners") && safeHasOwn(receiver, "sourceManifest")) { counters.capture += 1; matched = true; }
    if (matched) counters.total += 1;
    return matched;
  };

  try {
    await t.test("inherited getter has zero effects across internal and public results", { timeout: 900_000 }, async () => {
      const effects = freshCounters();
      let failure;
      let result;
      safeDefineProperty(Object.prototype, "then", {
        configurable: true,
        get() {
          classify(this, effects);
          return undefined;
        },
      });
      try { result = await gitSource.captureFrozenSource({ commitOid, gitExecutableLocator }); }
      catch (error) { failure = error; }
      finally { safeDeleteProperty(Object.prototype, "then"); }
      assert.deepEqual(effects, freshCounters());
      assert.equal(failure, undefined);
      assert.equal(result?.owners.authorizing, false);
    });

    await t.test("inherited data function cannot transform internals or substitute the public result", { timeout: 900_000 }, async () => {
      const effects = freshCounters();
      const injected = safeCreate(null);
      safeDefineProperty(injected, "owners", {
        enumerable: true,
        value: safeCreate(null),
      });
      safeDefineProperty(injected.owners, "authorizing", { enumerable: true, value: true });
      let substitutions = 0;
      let failure;
      let result;
      safeDefineProperty(Object.prototype, "then", {
        configurable: true,
        value(resolve, reject) {
          try {
            const targeted = classify(this, effects);
            if (safeHasOwn(this, "observation") && safeHasOwn(this, "owners") && safeHasOwn(this, "sourceManifest")) {
              substitutions += 1;
              resolve(injected);
              return;
            }
            if (safeBufferIsBuffer(this)) {
              const copy = safeReflectApply(safeBufferFrom, Buffer, [this]);
              safeDefineProperty(copy, "then", { configurable: true, value: undefined });
              resolve(copy);
              safeDeleteProperty(copy, "then");
              return;
            }
            if (!targeted) {
              safeDefineProperty(this, "then", { configurable: true, value: undefined });
              resolve(this);
              safeDeleteProperty(this, "then");
              return;
            }
            const copy = safeCreate(null);
            const names = safeGetNames(this);
            for (let index = 0; index < names.length; index += 1) {
              const descriptor = safeGetDescriptor(this, names[index]);
              if (!descriptor || !safeHasOwn(descriptor, "value")) throw new Error("ATTACKER_GIT_COPY");
              safeDefineProperty(copy, names[index], descriptor);
            }
            resolve(copy);
          } catch (error) {
            reject(error);
          }
        },
        writable: true,
      });
      try { result = await gitSource.captureFrozenSource({ commitOid, gitExecutableLocator }); }
      catch (error) { failure = error; }
      finally { safeDeleteProperty(Object.prototype, "then"); }
      assert.deepEqual(effects, freshCounters());
      assert.equal(substitutions, 0);
      assert.equal(failure, undefined);
      assert.notEqual(result, injected);
      assert.equal(result?.owners.authorizing, false);
    });
  } finally {
    safeDeleteProperty(Object.prototype, "then");
    if (prior) safeDefineProperty(Object.prototype, "then", prior);
  }
});

test("genuine pinned-Git capture returns every frozen owner value and defensive owner blob", { timeout: 900_000, skip: platform() !== "win32" }, async () => {
  const gitExecutableLocator = fileURLToPath(new URL(
    "../../.superpowers/sdd/2026-08-31-rd0873-portable-artifact-admission/toolchains/mingit-2.55.0.5/expanded/cmd/git.exe",
    import.meta.url,
  ));
  const commitOid = await readPinnedHeadCommit(gitExecutableLocator);
  const captured = await gitSource.captureFrozenSource({
    commitOid,
    gitExecutableLocator,
  });
  assert.deepEqual(Object.keys(captured).sort(), [
    "observation", "ownerBlobs", "owners", "resolutionBlobs",
    "resolutionInputs", "sourceBlobs", "sourceManifest",
  ].sort());
  assert.deepEqual(Object.keys(captured.owners).sort(), ["authorizing", "identities", "ownerSetDigest", "values"].sort());
  assert.equal(captured.owners.authorizing, false);
  assert.equal(captured.owners.identities.length, 10);
  assert.deepEqual(Object.keys(captured.owners.values).sort(), [
    "expectedOutcomes", "exporter", "gate", "generated", "parser", "pins",
    "proposedBaseline", "repositoryIdentity", "resolution", "source",
  ].sort());
  const ownerRows = captured.owners.identities.map((row) => ({
    path: row.locator,
    byteLength: row.byteLength,
    rawSha256: row.rawSha256,
  }));
  const admittedOwners = gitSource.admitFrozenBlobSet(ownerRows, captured.ownerBlobs, { label: "OWNER_SET" });
  assert.equal(admittedOwners.size, 10);
  assert.equal(captured.owners.values.pins.pinsDigest, "a287faaf55f698b7e78d085a24a34bae4998e78e55706731fe9779a0fe4834f8");
  assert.equal(captured.owners.values.expectedOutcomes.expectedOutcomesDigest, "9a22abb0889101c39e30a07a546a00829320c5fa679a31e97e70312d93ae14a5");
  assert(Object.isFrozen(captured.owners));
  assert(Object.isFrozen(captured.owners.values));
  assert.throws(() => captured.ownerBlobs.clear(), TypeError);
});

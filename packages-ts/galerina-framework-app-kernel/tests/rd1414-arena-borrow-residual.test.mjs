import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const kernelDir = join(here, "..");
const providerSrcPath = join(here, "..", "src", "secret-arena-provider.ts");
const gateSrcPath = join(here, "..", "src", "secret-gate.ts");
const custodianSrcPath = join(
  here,
  "..",
  "..",
  "galerina-core-runtime",
  "native",
  "vok-authority",
  "src",
  "secret_arena_custodian.rs",
);
const cargoTomlPath = join(
  here,
  "..",
  "..",
  "galerina-core-runtime",
  "native",
  "vok-authority",
  "Cargo.toml",
);
const rd1413Path = join(
  here,
  "..",
  "..",
  "galerina-core-compiler",
  "tests",
  "rd1413-serve-gate.test.mjs",
);
const tscPath = join(kernelDir, "node_modules", "typescript", "bin", "tsc");
const distGatePath = join(kernelDir, "dist", "secret-gate.js");
const distProviderPath = join(kernelDir, "dist", "secret-arena-provider.js");
const crateDir = join(here, "..", "..", "galerina-core-runtime", "native", "vok-authority");
const binPath = join(crateDir, "target", "debug", "galerina-secret-arena-custodian");

const RD1413_SHA256_LF = "A4EA20ED14CEA3C3B7B01804221DBFB063C4BC515D33DEBDDC1E952A1B9D3021";

function sha256UpperLf(path) {
  const text = readFileSync(path, "utf8").replace(/\r\n/g, "\n");
  return createHash("sha256").update(text, "utf8").digest("hex").toUpperCase();
}

function sha256Buf(buf) {
  return createHash("sha256").update(buf).digest("hex").toUpperCase();
}

function countNeedle(haystack, needle) {
  let count = 0;
  let from = 0;
  while (from <= haystack.length) {
    const index = haystack.indexOf(needle, from);
    if (index === -1) return count;
    count += 1;
    from = index + needle.length;
  }
  return count;
}

function assertProviderNeedles(provider) {
  const requiredOnce = [
    "wipeOrQuarantine(body);",
    "wipeOrQuarantine(header);",
    "wipeOrQuarantine(respHeader);",
    "wipeOrQuarantine(resp);",
    "wipeOrQuarantine(payload);",
    "wipeOrQuarantine(result.data);",
    "if (!wipe(bytes)) markQuarantined();",
    "if (detached || !slot.wipe())",
    "if (quarantined) return lastEpoch;",
    "if (quarantined && opcode !== OP_STATUS && opcode !== OP_EPOCH)",
    "if (epoch < lastEpoch)",
    "lastEpoch = epoch;",
  ];
  for (const needle of requiredOnce) {
    assert.equal(countNeedle(provider, needle) >= 1, true, `missing ${needle}`);
  }
  assert.equal(countNeedle(provider, "wipeOrQuarantine(nameBytes);") >= 3, true, "nameBytes wiped on has/use/put");
  assert.equal(countNeedle(provider, "wipeOrQuarantine(data);") >= 4, true, "rpc data copies wiped");
  assert.equal(
    countNeedle(provider, "if (quarantined) return lastEpoch;") >= 2,
    true,
    "EPOCH is served both before rpc and after a quarantining wipe",
  );
  assert.equal(provider.includes("debugForceCleanupFailure"), false);
  assert.equal(provider.includes("ForTests"), false);

  const epochFn = provider.indexOf("revocationEpoch(): number {");
  assert.notEqual(epochFn, -1, "revocationEpoch missing");
  const serveEpoch = provider.indexOf("if (quarantined) return lastEpoch;", epochFn);
  const epochRpc = provider.indexOf("rpc(OP_EPOCH)", epochFn);
  const commitEpoch = provider.indexOf("lastEpoch = epoch;", epochFn);
  const wipeAfterCommit = provider.indexOf("wipeOrQuarantine(data);", commitEpoch);
  assert.notEqual(serveEpoch, -1, "EPOCH is served locally after quarantine");
  assert.notEqual(epochRpc, -1, "EPOCH rpc exists");
  assert.equal(serveEpoch < epochRpc, true, "quarantined EPOCH return precedes rpc");
  assert.notEqual(commitEpoch, -1, "epoch is committed to lastEpoch");
  assert.notEqual(wipeAfterCommit, -1, "wipe follows epoch commit");
  assert.equal(commitEpoch < wipeAfterCommit, true, "lastEpoch is committed before the quarantining wipe");
}

function assertGateNeedles(gate) {
  assert.equal(countNeedle(gate, "let stagedWipeFailed = false;") >= 1, true, "stagedWipeFailed flag");
  assert.equal(
    countNeedle(gate, "if (stagedWipeFailed && deliverySucceeded)") >= 1,
    true,
    "gate wipe fail refuses success",
  );
  assert.equal(
    countNeedle(gate, "throw new SecretGateWipeFailed();") >= 1,
    true,
    "gate wipe fail is typed SecretGateWipeFailed",
  );
  assert.equal(countNeedle(gate, "export class SecretGateWipeFailed extends Error") >= 1, true, "named wipe error");
  assert.equal(countNeedle(gate, "ERR_SECRET_GATE_WIPE_FAILED") >= 2, true, "stable wipe-failed code");
}

function assertCustodianNeedles(custodian, cargo) {
  assert.equal(countNeedle(custodian, "struct ZeroOnDrop(Vec<u8>);") >= 1, true, "ZeroOnDrop");
  assert.equal(countNeedle(custodian, "wipe_volatile(&mut self.0);") >= 1, true, "ZeroOnDrop wipes via wipe_volatile");
  assert.equal(countNeedle(custodian, "fn wipe_volatile(bytes: &mut [u8])") >= 1, true, "wipe_volatile helper");
  assert.equal(countNeedle(custodian, "write_volatile") >= 1, true, "volatile store");
  assert.equal(countNeedle(custodian, "compiler_fence(Ordering::SeqCst)") >= 1, true, "compiler fence");
  assert.equal(cargo.includes("cdylib"), false, "vok-authority must not be a cdylib");
}

function rebuildDist() {
  assert.equal(existsSync(tscPath), true, "local typescript tsc is required to rebuild dist");
  const built = spawnSync(process.execPath, [tscPath, "-p", "tsconfig.json", "--noCheck"], {
    cwd: kernelDir,
    encoding: "utf8",
  });
  assert.equal(built.status, 0, `tsc failed: ${built.stderr}\n${built.stdout}`);
}

function writeTempScript(name, source) {
  const path = join(tmpdir(), name);
  writeFileSync(path, source);
  return path;
}

const WIPE_FAILED_CHILD = `import { pathToFileURL } from "node:url";
const origFill = Uint8Array.prototype.fill;
Uint8Array.prototype.fill = function patchedFill(...args) {
  if (this.length === 3 && this[0] === 9 && this[1] === 8 && this[2] === 7) {
    throw new Error("forced-wipe-fail");
  }
  return origFill.apply(this, args);
};
const gateUrl = process.env.DIST_GATE;
if (typeof gateUrl !== "string" || gateUrl.length === 0) {
  process.stderr.write("DIST_GATE missing\\n");
  process.exit(2);
}
const { createSecretGate, SecretGateWipeFailed } = await import(pathToFileURL(gateUrl).href);
const provider = {
  has() { return true; },
  use(_name, fn) { fn(new Uint8Array([9, 8, 7])); },
  revocationEpoch() { return 0; },
};
const gate = createSecretGate(provider);
try {
  gate.getSecret(["cred"], "cred", () => { throw new Error("consumer-throw"); });
  process.stderr.write("consumer-throw was swallowed\\n");
  process.exit(5);
} catch (error) {
  if (!(error instanceof Error) || error.message !== "consumer-throw" || error instanceof SecretGateWipeFailed) {
    process.stderr.write("consumer-throw was replaced: " + String(error) + "\\n");
    process.exit(6);
  }
}
try {
  gate.getSecret(["cred"], "cred", () => undefined);
  process.stderr.write("expected SecretGateWipeFailed\\n");
  process.exit(3);
} catch (error) {
  if (error instanceof SecretGateWipeFailed && error.code === "ERR_SECRET_GATE_WIPE_FAILED") {
    process.exit(0);
  }
  process.stderr.write(String(error && error.stack ? error.stack : error) + "\\n");
  process.exit(4);
}
`;

function runWipeFailedChild() {
  const childPath = writeTempScript("galerina-secret-gate-wipe-failed-child.mjs", WIPE_FAILED_CHILD);
  try {
    return spawnSync(process.execPath, [childPath], {
      encoding: "utf8",
      env: { ...process.env, DIST_GATE: distGatePath },
    });
  } finally {
    try {
      unlinkSync(childPath);
    } catch {
      // tmp cleanup
    }
  }
}

test("U3 residual: wipe-or-quarantine, EPOCH after quarantine, borrow wipe, gate staged wipe", () => {
  assertProviderNeedles(readFileSync(providerSrcPath, "utf8"));
  assertGateNeedles(readFileSync(gateSrcPath, "utf8"));
  assertCustodianNeedles(
    readFileSync(custodianSrcPath, "utf8"),
    readFileSync(cargoTomlPath, "utf8"),
  );
  assert.equal(sha256UpperLf(rd1413Path), RD1413_SHA256_LF, "RD-1413 test file unmodified (LF-normalised)");
});

test("U3 residual SOURCE-PIN ONLY: source needles refuse listed edits (not behavioural)", () => {
  const provider = readFileSync(providerSrcPath, "utf8");
  const gate = readFileSync(gateSrcPath, "utf8");
  const pins = [
    { name: "rpc-body", apply: () => provider.replace("wipeOrQuarantine(body);", "/* mutant */") },
    { name: "rpc-header", apply: () => provider.replace("wipeOrQuarantine(header);", "/* mutant */") },
    {
      name: "rpc-respHeader",
      apply: () => provider.replace("wipeOrQuarantine(respHeader);", "/* mutant */"),
    },
    { name: "rpc-resp", apply: () => provider.replace("wipeOrQuarantine(resp);", "/* mutant */") },
    { name: "put-payload", apply: () => provider.replace("wipeOrQuarantine(payload);", "/* mutant */") },
    {
      name: "result-data",
      apply: () => provider.replace("wipeOrQuarantine(result.data);", "/* mutant */"),
    },
    {
      name: "nameBytes-all",
      apply: () => provider.split("wipeOrQuarantine(nameBytes);").join("/* mutant */"),
    },
    {
      name: "wipe-fail-quarantine",
      apply: () => provider.replace("if (!wipe(bytes)) markQuarantined();", "if (!wipe(bytes)) {}"),
    },
    {
      name: "slot-wipe-source-pin",
      apply: () => provider.replace("if (detached || !slot.wipe())", "if (detached)"),
    },
    {
      name: "epoch-after-quarantine-source-pin",
      apply: () =>
        provider.replace("if (quarantined) return lastEpoch;", "if (quarantined) throw new SecretArenaQuarantined();"),
    },
    {
      name: "gate-staged-wipe-fail-source-pin",
      apply: () => gate.replace("if (stagedWipeFailed && deliverySucceeded)", "if (false && stagedWipeFailed && deliverySucceeded)"),
    },
  ];

  for (const pin of pins) {
    const mutated = pin.apply();
    assert.notEqual(mutated, pin.name.includes("gate-") ? gate : provider, `${pin.name} is a real edit`);
    let pinRefused = false;
    try {
      if (pin.name.includes("gate-")) assertGateNeedles(mutated);
      else assertProviderNeedles(mutated);
    } catch {
      pinRefused = true;
    }
    assert.equal(
      pinRefused,
      true,
      `SOURCE-PIN ONLY (not behavioural), UNKNOWN: no production test hook observes this wipe without a rebuilt-dist run; ${pin.name}`,
    );
  }
});

test("U3 residual F5 behavioural: staged wipe failure throws SecretGateWipeFailed", () => {
  const child = runWipeFailedChild();
  assert.equal(child.status, 0, child.stderr + child.stdout);
});

function restoreSrc(originalProvider, originalGate, originalProviderSha, originalGateSha) {
  writeFileSync(providerSrcPath, originalProvider);
  writeFileSync(gateSrcPath, originalGate);
  rebuildDist();
  assert.equal(sha256Buf(readFileSync(providerSrcPath)), originalProviderSha, "provider src restore-match");
  assert.equal(sha256Buf(readFileSync(gateSrcPath)), originalGateSha, "gate src restore-match");
}

test("U3 residual behavioural mutant: gate-staged-wipe-fail rebuilt dist goes red then restores green", (t) => {
  const originalProvider = readFileSync(providerSrcPath);
  const originalGate = readFileSync(gateSrcPath);
  const originalProviderSha = sha256Buf(originalProvider);
  const originalGateSha = sha256Buf(originalGate);
  t.after(() => {
    restoreSrc(originalProvider, originalGate, originalProviderSha, originalGateSha);
  });
  const gate = originalGate.toString("utf8");
  const mutated = gate.replace(
    "if (stagedWipeFailed && deliverySucceeded)",
    "if (false && stagedWipeFailed && deliverySucceeded)",
  );
  assert.notEqual(mutated, gate, "gate-staged-wipe-fail is a real edit");
  writeFileSync(gateSrcPath, mutated);
  rebuildDist();
  const red = runWipeFailedChild();
  assert.notEqual(red.status, 0, "gate-staged-wipe-fail rebuilt-dist mutant must go red");
  restoreSrc(originalProvider, originalGate, originalProviderSha, originalGateSha);
  const green = runWipeFailedChild();
  assert.equal(green.status, 0, "gate-staged-wipe-fail restore must be green");
});

test("U3 residual behavioural mutants: linux rebuilt dist slot.wipe and epoch-after-quarantine", (t) => {
  if (process.platform !== "linux") {
    t.skip("linux rebuilt-dist slot.wipe and epoch-after-quarantine mutants");
    return;
  }
  const originalProvider = readFileSync(providerSrcPath);
  const originalGate = readFileSync(gateSrcPath);
  const originalProviderSha = sha256Buf(originalProvider);
  const originalGateSha = sha256Buf(originalGate);
  const restore = () => restoreSrc(originalProvider, originalGate, originalProviderSha, originalGateSha);
  t.after(() => {
    restore();
  });

  {
    const provider = originalProvider.toString("utf8");
    const mutated = provider.replace(
      "if (quarantined) return lastEpoch;",
      "if (quarantined) throw new SecretArenaQuarantined();",
    );
    assert.notEqual(mutated, provider, "epoch-after-quarantine is a real edit");
    writeFileSync(providerSrcPath, mutated);
    rebuildDist();
    const fake = join(here, "secret-arena-fake-exit-after-hello.mjs");
    chmodSync(fake, 0o755);
    const childPath = writeTempScript(
      "galerina-epoch-after-quarantine-mutant.mjs",
      `import { pathToFileURL } from "node:url";
const { createSecretArenaProvider } = await import(pathToFileURL(process.env.DIST_PROVIDER).href);
const provider = createSecretArenaProvider({ binPath: process.env.FAKE });
try {
  provider.status();
} catch {
  // child death
}
try {
  const epoch = provider.revocationEpoch();
  if (typeof epoch === "number") process.exit(0);
  process.exit(2);
} catch {
  process.exit(1);
}
`,
    );
    try {
      const red = spawnSync(process.execPath, [childPath], {
        encoding: "utf8",
        env: { ...process.env, DIST_PROVIDER: distProviderPath, FAKE: fake },
      });
      assert.notEqual(red.status, 0, "epoch-after-quarantine rebuilt-dist mutant must go red");
    } finally {
      try {
        unlinkSync(childPath);
      } catch {
        // tmp cleanup
      }
    }
    restore();
    const greenPath = writeTempScript(
      "galerina-epoch-after-quarantine-green.mjs",
      `import { pathToFileURL } from "node:url";
const { createSecretArenaProvider } = await import(pathToFileURL(process.env.DIST_PROVIDER).href);
const provider = createSecretArenaProvider({ binPath: process.env.FAKE });
try {
  provider.status();
} catch {
  // child death
}
const epoch = provider.revocationEpoch();
if (typeof epoch === "number" && Number.isSafeInteger(epoch) && epoch > 0) process.exit(0);
process.exit(1);
`,
    );
    try {
      const green = spawnSync(process.execPath, [greenPath], {
        encoding: "utf8",
        env: { ...process.env, DIST_PROVIDER: distProviderPath, FAKE: fake },
      });
      assert.equal(green.status, 0, "epoch-after-quarantine restore must be green: " + green.stderr + green.stdout);
    } finally {
      try {
        unlinkSync(greenPath);
      } catch {
        // tmp cleanup
      }
    }
  }

  if (!existsSync(binPath)) {
    t.skip("custodian binary unavailable for slot.wipe rebuilt-dist mutant");
    return;
  }

  {
    const provider = originalProvider.toString("utf8");
    const mutated = provider.replace("if (detached || !slot.wipe())", "if (detached)");
    assert.notEqual(mutated, provider, "slot-wipe is a real edit");
    writeFileSync(providerSrcPath, mutated);
    rebuildDist();
    const childPath = writeTempScript(
      "galerina-slot-wipe-mutant.mjs",
      `import { pathToFileURL } from "node:url";
const { createSecretArenaProvider } = await import(pathToFileURL(process.env.DIST_PROVIDER).href);
const provider = createSecretArenaProvider({ binPath: process.env.BIN });
provider.put("cred", new Uint8Array([7, 8, 9]));
let view;
provider.use("cred", (value) => { view = value; });
if (view === undefined) process.exit(2);
if (view[0] !== 0) {
  process.stderr.write("7 !== 0\\n");
  process.exit(1);
}
process.exit(0);
`,
    );
    try {
      const red = spawnSync(process.execPath, [childPath], {
        encoding: "utf8",
        env: { ...process.env, DIST_PROVIDER: distProviderPath, BIN: binPath },
      });
      assert.notEqual(red.status, 0, "slot.wipe rebuilt-dist mutant must go red");
    } finally {
      try {
        unlinkSync(childPath);
      } catch {
        // tmp cleanup
      }
    }
    restore();
    const greenPath = writeTempScript(
      "galerina-slot-wipe-green.mjs",
      `import { pathToFileURL } from "node:url";
const { createSecretArenaProvider } = await import(pathToFileURL(process.env.DIST_PROVIDER).href);
const provider = createSecretArenaProvider({ binPath: process.env.BIN });
provider.put("cred", new Uint8Array([7, 8, 9]));
let view;
provider.use("cred", (value) => { view = value; });
if (view === undefined) process.exit(2);
for (let i = 0; i < view.length; i += 1) {
  if (view[i] !== 0) process.exit(1);
}
process.exit(0);
`,
    );
    try {
      const green = spawnSync(process.execPath, [greenPath], {
        encoding: "utf8",
        env: { ...process.env, DIST_PROVIDER: distProviderPath, BIN: binPath },
      });
      assert.equal(green.status, 0, "slot.wipe restore must be green: " + green.stderr + green.stdout);
    } finally {
      try {
        unlinkSync(greenPath);
      } catch {
        // tmp cleanup
      }
    }
  }
});

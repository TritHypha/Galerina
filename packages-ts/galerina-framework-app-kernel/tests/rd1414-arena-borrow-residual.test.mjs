import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
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

const RD1413_SHA256 = "BA17CC92BB601127551EB2B3D719794A2515F6D39ED94922B65FDECCE6174E00";

function sha256Upper(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex").toUpperCase();
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
  assert.notEqual(serveEpoch, -1, "EPOCH is served locally after quarantine");
  assert.notEqual(epochRpc, -1, "EPOCH rpc exists");
  assert.equal(serveEpoch < epochRpc, true, "quarantined EPOCH return precedes rpc");
}

function assertGateNeedles(gate) {
  assert.equal(countNeedle(gate, "let stagedWipeFailed = false;") >= 1, true, "stagedWipeFailed flag");
  assert.equal(
    countNeedle(gate, "if (stagedWipeFailed && deliverySucceeded)") >= 1,
    true,
    "gate wipe fail refuses success",
  );
  assert.equal(
    countNeedle(gate, "throw new Error(\"SecretGate: staged secret wipe failed\");") >= 1,
    true,
    "gate wipe fail is typed refuse",
  );
}

function assertCustodianNeedles(custodian, cargo) {
  assert.equal(countNeedle(custodian, "struct ZeroOnDrop(Vec<u8>);") >= 1, true, "ZeroOnDrop");
  assert.equal(countNeedle(custodian, "self.0.fill(0);") >= 1, true, "ZeroOnDrop wipes");
  assert.equal(cargo.includes("cdylib"), false, "vok-authority must not be a cdylib");
}

test("U3 residual: wipe-or-quarantine, EPOCH after quarantine, borrow wipe, gate staged wipe", () => {
  assertProviderNeedles(readFileSync(providerSrcPath, "utf8"));
  assertGateNeedles(readFileSync(gateSrcPath, "utf8"));
  assertCustodianNeedles(
    readFileSync(custodianSrcPath, "utf8"),
    readFileSync(cargoTomlPath, "utf8"),
  );
  assert.equal(sha256Upper(rd1413Path), RD1413_SHA256, "RD-1413 test file unmodified");
});

test("U3 residual mutants: removing each wipe or the quarantine set turns the instrument red", () => {
  const provider = readFileSync(providerSrcPath, "utf8");
  const gate = readFileSync(gateSrcPath, "utf8");
  const mutants = [
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
      name: "slot-wipe",
      apply: () => provider.replace("if (detached || !slot.wipe())", "if (detached)"),
    },
    {
      name: "epoch-after-quarantine",
      apply: () =>
        provider.replace("if (quarantined) return lastEpoch;", "if (quarantined) throw new SecretArenaQuarantined();"),
    },
    {
      name: "gate-staged-wipe-fail",
      apply: () => gate.replace("if (stagedWipeFailed && deliverySucceeded)", "if (false && stagedWipeFailed && deliverySucceeded)"),
    },
  ];

  for (const mutant of mutants) {
    const mutated = mutant.apply();
    assert.notEqual(mutated, mutant.name.startsWith("gate-") ? gate : provider, `${mutant.name} is a real edit`);
    let red = false;
    try {
      if (mutant.name.startsWith("gate-")) assertGateNeedles(mutated);
      else assertProviderNeedles(mutated);
    } catch {
      red = true;
    }
    assert.equal(red, true, `${mutant.name} must turn the residual instrument red`);
  }
});

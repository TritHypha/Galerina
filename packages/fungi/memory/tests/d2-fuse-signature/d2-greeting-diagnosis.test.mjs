// OPEN-S6-1 D-2 diagnosis pin (gcw d2, 2026-10-29). Read-only: never builds, signs, or opens key material.
// Root cause: the committed example-app greeting manifest has a real Ed25519 governanceSignature whose
// public half (governance/signing-key-<keyId>.pub.pem) is not tracked, so the frozen-TS loader warns
// FUNGI-FUSE-NO-PUBKEY, degrades to unsigned and refuses with FUNGI-FUSE-UNSIGNED. Key presence is checked
// by tracked FILE NAME only (git ls-files); no key file is opened by this test.
// While the public half is missing, the refusal is pinned (fail-closed, for the intended reason).
// Once Phillip commits the public half or re-signs under a tracked key, S6-D2-D3 turns from todo to a real check.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..", "..", "..", "..");
const APP = join(REPO, "packages-ts", "galerina-framework-example-app");
const GREETING = join(APP, "packages", "greeting");
const MANIFEST = join(GREETING, "dist", "greeting.lmanifest.json");
const GOV = join(REPO, "governance");
const { fusePackage } = await import(pathToFileURL(join(REPO, "packages-ts", "galerina-framework-app-kernel", "dist", "index.js")).href);

const sig = JSON.parse(readFileSync(MANIFEST, "utf8")).governanceSignature;
const tracked = spawnSync("git", ["-C", REPO, "ls-files", "governance"], { encoding: "utf8" });
const names = tracked.status === 0 ? tracked.stdout.split("\n").map((s) => s.trim().replace(/^governance\//, "")) : [];
const pubTracked = typeof sig?.keyId === "string" && names.includes(`signing-key-${sig.keyId}.pub.pem`);
// synthetic name-pinned registry: exact ALLOW for "greeting" only
const registryCheck = (pkg) => ({ ok: pkg.name === "greeting" });

test("S6-D2-D1 the greeting manifest carries a real Ed25519 signature (not a placeholder)", () => {
  assert.equal(tracked.status, 0, "git ls-files governance");
  assert.ok(names.length > 0, "governance names listed");
  assert.equal(String(sig?.algorithm).toLowerCase(), "ed25519");
  assert.match(String(sig?.keyId), /^[0-9a-f]{16}$/);
  assert.equal(typeof sig?.signature, "string");
});

test("S6-D2-D2 public half missing => fuse refuses UNSIGNED for the NO-PUBKEY reason (dev and production posture)", { skip: pubTracked ? "public half is tracked; D-2 closed, see D3" : false }, async () => {
  const lines = [];
  await assert.rejects(
    () => fusePackage(GREETING, { governanceDir: GOV, registryCheck, warn: (m) => lines.push(m) }),
    /FUNGI-FUSE-UNSIGNED/,
  );
  assert.ok(lines.some((l) => l.includes("FUNGI-FUSE-NO-PUBKEY") && l.includes(sig.keyId)), "refusal reason is the missing public half: " + lines.join(" | "));
  await assert.rejects(
    () => fusePackage(GREETING, { governanceDir: GOV, registryCheck, warn: () => {}, requireSignature: true, revocationCheck: () => false }),
    /FUNGI-FUSE-UNSIGNED/,
  );
  // allowUnsigned never rescues a production posture
  await assert.rejects(
    () => fusePackage(GREETING, { governanceDir: GOV, registryCheck, warn: () => {}, requireSignature: true, allowUnsigned: true, revocationCheck: () => false }),
    /FUNGI-FUSE-UNSIGNED/,
  );
});

test("S6-D2-D3 D-2 closed: greeting fuses VERIFIED with no allowUnsigned", { todo: pubTracked ? false : "needs Phillip: tracked public half for keyId or re-signed greeting" }, async () => {
  const g = await fusePackage(GREETING, { governanceDir: GOV, registryCheck, warn: () => {} });
  assert.equal(g.name, "greeting");
  assert.equal(g.invoke("main"), 200);
});

test("S6-D2-D4 registry still gates: a verdict that is not exactly ok === true refuses before instantiation", async () => {
  for (const verdict of [{ ok: false }, { ok: 1 }, { ok: "true" }, {}, null]) {
    await assert.rejects(
      () => fusePackage(GREETING, { governanceDir: GOV, registryCheck: () => verdict, allowUnsigned: true, warn: () => {} }),
      /FUNGI-FUSE-REGISTRY|REGISTRY/,
      JSON.stringify(verdict),
    );
  }
});

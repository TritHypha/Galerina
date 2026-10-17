import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  createTriPipeEngine,
  prepareSlideAdmissionRequest,
  bindExactArtifactDigest,
  hashWasmArtifact,
  artifactDigestFromRaw32,
} from "../dist/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const srcPath = join(here, "..", "src", "artifact-digest-binding.ts");
const tscPath = join(here, "..", "node_modules", "typescript", "bin", "tsc");
const ARTIFACT = `sha256:${"b".repeat(64)}`;
const OTHER = `sha256:${"c".repeat(64)}`;

function present(digest) {
  return { kind: "present", digest };
}

function allPresent(digest) {
  return {
    slideAdmission: present(digest),
    wamrLoaded: present(digest),
    vokReceipt: present(digest),
    lythProducer: present(digest),
    towerProducer: present(digest),
  };
}

test("end-to-end synthetic artifact binds the same digest across every hop", () => {
  const wasm = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
  const hashed = hashWasmArtifact(wasm);
  assert.equal(hashed.kind, "BOUND");
  if (hashed.kind !== "BOUND") return;
  const raw = createHash("sha256").update(wasm).digest();
  const fromRaw = artifactDigestFromRaw32(raw);
  assert.equal(fromRaw.kind, "BOUND");
  if (fromRaw.kind !== "BOUND") return;
  assert.equal(fromRaw.digest, hashed.digest);
  const proposal = createTriPipeEngine({ targetId: "cpu", attestationVerified: true });
  const request = prepareSlideAdmissionRequest(proposal, hashed.digest);
  assert.equal(request.kind, "SLIDE_ADMISSION_REQUEST");
  if (request.kind !== "SLIDE_ADMISSION_REQUEST") return;
  const bound = bindExactArtifactDigest({
    slideAdmission: present(request.artifactDigest),
    wamrLoaded: present(fromRaw.digest),
    vokReceipt: present(hashed.digest),
    lythProducer: present(hashed.digest),
    towerProducer: present(hashed.digest),
  });
  assert.equal(bound.kind, "BOUND");
  if (bound.kind !== "BOUND") return;
  assert.equal(bound.digest, hashed.digest);
  assert.equal(bound.digest, request.artifactDigest);
});

test("per-hop mismatch refuses before secret access", () => {
  for (const name of ["slideAdmission", "wamrLoaded", "vokReceipt", "lythProducer", "towerProducer"]) {
    const hops = allPresent(ARTIFACT);
    hops[name] = present(OTHER);
    const refused = bindExactArtifactDigest(hops);
    assert.equal(refused.kind, "REFUSED");
    assert.equal(refused.code, "ARTIFACT_DIGEST_MISMATCH");
  }
});

test("missing hop refuses", () => {
  for (const name of ["slideAdmission", "wamrLoaded", "vokReceipt", "lythProducer", "towerProducer"]) {
    const hops = allPresent(ARTIFACT);
    hops[name] = { kind: "missing" };
    const refused = bindExactArtifactDigest(hops);
    assert.equal(refused.kind, "REFUSED");
    assert.equal(refused.code, "ARTIFACT_DIGEST_MISSING");
  }
});

test("unknown hop refuses", () => {
  const hops = allPresent(ARTIFACT);
  hops.towerProducer = { kind: "unknown", reason: "Tower package field not located" };
  const refused = bindExactArtifactDigest(hops);
  assert.equal(refused.kind, "REFUSED");
  assert.equal(refused.code, "ARTIFACT_DIGEST_UNKNOWN");
});

test("wrong-length and malformed digest refuse", () => {
  const malformed = [
    `sha256:${"b".repeat(63)}`,
    `sha256:${"b".repeat(65)}`,
    `sha256:${"B".repeat(64)}`,
    `md5:${"b".repeat(64)}`,
    "",
    "b".repeat(64),
  ];
  for (const digest of malformed) {
    const hops = allPresent(ARTIFACT);
    hops.vokReceipt = present(digest);
    const refused = bindExactArtifactDigest(hops);
    assert.equal(refused.kind, "REFUSED");
    assert.equal(refused.code, "ARTIFACT_DIGEST_MALFORMED");
  }
  const raw = artifactDigestFromRaw32(new Uint8Array(31));
  assert.equal(raw.kind, "REFUSED");
  assert.equal(raw.code, "ARTIFACT_DIGEST_MALFORMED");
  const empty = hashWasmArtifact(new Uint8Array(0));
  assert.equal(empty.kind, "REFUSED");
  assert.equal(empty.code, "ARTIFACT_DIGEST_MISSING");
});

test("mutant: dropping a hop mismatch check turns the binder red then restores green", async () => {
  const original = readFileSync(srcPath);
  const originalText = original.toString("utf8");
  const mutated = originalText.replace(
    "parsed.digest !== expected.digest",
    "false && parsed.digest !== expected.digest",
  );
  assert.notEqual(mutated, originalText, "mismatch-check mutant is a real edit");
  const restore = () => {
    writeFileSync(srcPath, original);
  };
  try {
    writeFileSync(srcPath, mutated);
    const built = spawnSync(process.execPath, [tscPath, "-p", "tsconfig.json", "--noCheck", "--skipLibCheck"], {
      cwd: join(here, ".."),
      encoding: "utf8",
    });
    assert.equal(built.status, 0, built.stderr);
    const hops = allPresent(ARTIFACT);
    hops.lythProducer = present(OTHER);
    const mutatedUrl = `${pathToFileURL(join(here, "..", "dist", "artifact-digest-binding.js")).href}?mutant=${Date.now()}`;
    const { bindExactArtifactDigest: mutatedBind } = await import(mutatedUrl);
    const red = mutatedBind(hops);
    assert.equal(red.kind, "BOUND", "mutant must go red by accepting a mismatch");
  } finally {
    restore();
    const built = spawnSync(process.execPath, [tscPath, "-p", "tsconfig.json", "--noCheck", "--skipLibCheck"], {
      cwd: join(here, ".."),
      encoding: "utf8",
    });
    assert.equal(built.status, 0, built.stderr);
  }
  const hops = allPresent(ARTIFACT);
  hops.lythProducer = present(OTHER);
  const green = bindExactArtifactDigest(hops);
  assert.equal(green.kind, "REFUSED");
  assert.equal(green.code, "ARTIFACT_DIGEST_MISMATCH");
});

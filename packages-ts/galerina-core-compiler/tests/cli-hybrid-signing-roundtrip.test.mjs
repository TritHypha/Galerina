/**
 * #34 / 0102 — HYBRID manifest signing, full CLI round-trip through the REAL galerina.mjs.
 *
 * The keygen-hybrid sibling test proves the keypair serialization round-trips at the LIBRARY layer
 * (signProofGraphHybrid / verifyGovernanceSignatureHybrid). THIS test proves the WIRING through the
 * user-facing CLI end to end, so a regression in the build→sign→persist→verify plumbing is caught:
 *
 *   (1) keygen --hybrid                       mint a hybrid Ed25519+ML-DSA-65 key in a temp dir
 *   (2) write a PURE .fungi flow returning Int  (no effects → fuses clean, signs over governance facts)
 *   (3) build under GALERINA_MANIFEST_PROFILE=certified (MANDATES hybrid; a classical-only key fail-closes)
 *         → the emitted build/<name>.lmanifest.json must be a both-half v2 hybrid signature
 *   (4) verify <flow>.fungi                      exit 0 + output naming BOTH halves (Ed25519 AND ML-DSA-65)
 *   (5) flip a byte of the manifest body       verify FAILS CLOSED (exit 1, FUNGI-MANIFEST-TAMPER)
 *
 * Uses the EXISTING dist (no rebuild) — same posture as cli-keygen-hybrid.test.mjs.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decodeCBOR, encodeCBOR } from "../dist/manifest-generator.js";

const REPO = join(import.meta.dirname, "..", "..", "..");
const CLI = join(REPO, "galerina.mjs");

const run = (args, env, dir) =>
  spawnSync("node", [CLI, ...args], { cwd: dir, encoding: "utf8", env: { ...process.env, ...env } });
const out = (r) => (r.stdout ?? "") + (r.stderr ?? "");

function nonCanonicalTopLevelMap(bytes) {
  const first = bytes[0];
  assert.notEqual(first, undefined, "the authoritative CBOR must not be empty");
  assert.equal(first >> 5, 5, "the authoritative CBOR must start with a map");
  const additional = first & 0x1f;
  assert.ok(additional < 24, "fixture expects the top-level map to use the shortest inline length");
  return Buffer.concat([
    Buffer.from([(5 << 5) | 24, additional]),
    bytes.subarray(1),
  ]);
}

// A PURE flow: returns an Int, declares no effects → the compute body fuses cleanly and the manifest
// signs over the governance facts (no `unreachable` effect stubs needed). Keeps the round-trip about
// the SIGNATURE, not about compute lowering.
const PURE_FLOW = `@version 1
flow answer() -> Int {
  return 42
}
`;

test("hybrid CLI round-trip: certified build emits a v2 both-half manifest, verify passes, tamper fails closed", () => {
  const dir = mkdtempSync(join(tmpdir(), "galerina-hybrid-rt-"));
  try {
    // ── (1) keygen --hybrid — mints the hybrid keypair + .env.galerina-signing into the temp cwd. ──
    const kg = run(["keygen", "--hybrid"], {}, dir);
    assert.equal(kg.status, 0, `keygen --hybrid should exit 0: ${out(kg)}`);

    // ── (2) write the PURE Int flow. ──
    const fungi = join(dir, "answer.fungi");
    writeFileSync(fungi, PURE_FLOW);

    // ── (3) build under certified — MANDATES the hybrid signature (no PQ downgrade). ──
    const build = run(["build", "answer.fungi"], { GALERINA_MANIFEST_PROFILE: "certified" }, dir);
    assert.equal(build.status, 0, `certified build should succeed: ${out(build)}`);

    const jsonPath = join(dir, "build", "answer.lmanifest.json");
    const manifest = JSON.parse(readFileSync(jsonPath, "utf8"));

    // The persisted manifest is a v2 hybrid: a durable on-disk PQ signature fact.
    assert.equal(manifest.schemaVersion, "fungi.manifest.v2", "certified hybrid manifest bumps to schema v2");
    const sig = manifest.governanceSignature;
    assert.ok(sig && typeof sig === "object", "manifest carries a governanceSignature");
    assert.equal(sig.algorithm, "Ed25519+ML-DSA-65", "both-half hybrid algorithm");
    assert.equal(sig.sigAlgorithm, "fungi.gov.sig.v2", "v2 envelope signature version");
    assert.ok(typeof sig.signature === "string" && sig.signature.includes("|"),
      "the signature concatenates BOTH halves as '<ed25519>|<mldsa>'");

    // ── (4) verify — exit 0, output names BOTH crypto halves. ──
    const verify = run(["verify", "answer.fungi"], {}, dir);
    assert.equal(verify.status, 0, `verify of a clean hybrid manifest should exit 0: ${out(verify)}`);
    const vout = out(verify);
    assert.match(vout, /Ed25519/, "verify output names the classical (Ed25519) half");
    assert.match(vout, /ML-DSA-65/, "verify output names the post-quantum (ML-DSA-65) half");
    assert.match(vout, /both halves/, "verify confirms both halves were checked");

    const cborPath = join(dir, "build", "answer.lmanifest");
    const canonicalCbor = readFileSync(cborPath);
    const decoded = decodeCBOR(new Uint8Array(canonicalCbor)).value;
    const edPublicPath = join(dir, "governance", `signing-key-${sig.keyId}.pub.pem`);
    const mlPublicPath = join(dir, "governance", `signing-key-${sig.keyId}.mldsa.pub.b64`);
    const edPublic = readFileSync(edPublicPath);
    const mlPublic = readFileSync(mlPublicPath);

    rmSync(cborPath);
    const verifyMissing = run(["verify", "answer.fungi"], {}, dir);
    assert.equal(verifyMissing.status, 1);
    assert.match(out(verifyMissing), /FUNGI-MANIFEST-MISSING/);
    writeFileSync(cborPath, canonicalCbor);

    writeFileSync(cborPath, Buffer.from([0xff]));
    const verifyInvalid = run(["verify", "answer.fungi"], {}, dir);
    assert.equal(verifyInvalid.status, 1);
    assert.match(out(verifyInvalid), /FUNGI-MANIFEST-INVALID/);
    writeFileSync(cborPath, canonicalCbor);

    writeFileSync(cborPath, nonCanonicalTopLevelMap(canonicalCbor));
    const verifyNonCanonical = run(["verify", "answer.fungi"], {}, dir);
    assert.equal(verifyNonCanonical.status, 1);
    assert.match(out(verifyNonCanonical), /FUNGI-MANIFEST-NONCANONICAL/);
    writeFileSync(cborPath, canonicalCbor);

    writeFileSync(
      cborPath,
      Buffer.from(encodeCBOR({ ...decoded, schemaVersion: "fungi.manifest.v999" })),
    );
    const verifyVersion = run(["verify", "answer.fungi"], {}, dir);
    assert.equal(verifyVersion.status, 1);
    assert.match(out(verifyVersion), /FUNGI-MANIFEST-VERSION/);
    writeFileSync(cborPath, canonicalCbor);

    rmSync(edPublicPath);
    rmSync(mlPublicPath);
    const verifyMissingPublic = run(["verify", "answer.fungi"], {}, dir);
    assert.equal(verifyMissingPublic.status, 1);
    assert.match(out(verifyMissingPublic), /FUNGI-MANIFEST-PUBKEY-MISSING/);
    writeFileSync(edPublicPath, edPublic);
    writeFileSync(mlPublicPath, mlPublic);

    const revocationsPath = join(dir, "governance", "revocations.json");
    writeFileSync(
      revocationsPath,
      JSON.stringify({ schemaVersion: 1, revoked: [] }, null, 2),
    );
    const verifyUnsignedRevocations = run(["verify", "answer.fungi"], {}, dir);
    assert.equal(verifyUnsignedRevocations.status, 0, out(verifyUnsignedRevocations));
    assert.match(out(verifyUnsignedRevocations), /FUNGI-REVOCATION-UNSIGNED/);

    writeFileSync(
      revocationsPath,
      JSON.stringify({ schemaVersion: 1, revoked: [{ keyId: sig.keyId }] }, null, 2),
    );
    const verifyRevoked = run(["verify", "answer.fungi"], {}, dir);
    assert.equal(verifyRevoked.status, 1);
    assert.match(out(verifyRevoked), /FUNGI-MANIFEST-REVOKED-KEY/);
    rmSync(revocationsPath);

    // ── (5) sidecar-only flip must NOT fail: JSON is not the checked subject. ──
    const originalJson = readFileSync(jsonPath, "utf8");
    const sidecarFlip = JSON.parse(originalJson);
    sidecarFlip.flowCount = (sidecarFlip.flowCount ?? 0) + 1;
    writeFileSync(jsonPath, JSON.stringify(sidecarFlip, null, 2));
    const verifySidecarOnly = run(["verify", "answer.fungi"], {}, dir);
    assert.equal(verifySidecarOnly.status, 0, `JSON sidecar field flip must not fail CBOR-subject verify: ${out(verifySidecarOnly)}`);
    writeFileSync(jsonPath, originalJson);

    // ── (6) flip a signed field on the CBOR subject → FAIL CLOSED. ──
    const tamperedCbor = { ...decoded, flowCount: (decoded.flowCount ?? 0) + 1 };
    writeFileSync(cborPath, Buffer.from(encodeCBOR(tamperedCbor)));
    const verifyTampered = run(["verify", "answer.fungi"], {}, dir);
    assert.equal(verifyTampered.status, 1, `tampered CBOR subject must fail closed (exit 1): ${out(verifyTampered)}`);
    assert.match(out(verifyTampered), /FUNGI-MANIFEST-TAMPER/,
      "CBOR body tamper is reported as FUNGI-MANIFEST-TAMPER (fail-closed)");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

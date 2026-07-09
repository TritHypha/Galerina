// =============================================================================
// Manifest Generator — Security Invariant Regression Test
//
// Pins the property that the source-file PATH is bound INSIDE the
// cryptographically signed manifest body. The signing target is
// sha256Hex(canonicalJson(manifestBody)) (see generateManifest:589-606 in
// src/manifest-generator.ts); the Ed25519 / ML-DSA-65 signatures in galerina.mjs
// cover exactly that body hash. Because `sourceFile` is a member of `manifestBody`
// (alongside `sourceHash`), the path and the source content are sealed together
// under ONE signature — an attacker cannot swap or reorder the path a manifest
// claims to describe without invalidating the signature.
//
// WHY THIS TEST EXISTS: surfaced by the TMX-256 / TriMerkle-XOF boundary review
// (notes/32). A future refactor could plausibly "tidy" the manifest by moving
// `sourceFile` out of the signed body into a cosmetic sibling field — silently
// reopening a swap/reorder attack surface. This test fails loudly if that happens.
//
// SCOPE GUARD: this is a TEST-ONLY safeguard for a property the generator ALREADY
// has. It deliberately keeps SHA-256 as the hash primitive and introduces NO
// TriMerkle / tree-hash machinery (that is TritMesh-only).
// =============================================================================

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  generateManifest,
  canonicalJson,
  sha256Hex,
  manifestSigningInput,
  manifestSigCanon,
  serializeManifestCBOR,
  decodeCBOR,
} from "../dist/manifest-generator.js";
import { sign as cryptoSign, verify as cryptoVerify, generateKeyPairSync, createPublicKey, createPrivateKey } from "node:crypto";

// ---------------------------------------------------------------------------
// Minimal valid inputs (shapes per src/parser.ts FlowMeta / SourceLocation)
// ---------------------------------------------------------------------------

const SOURCE = `pure flow calculateVat(price: Money) -> Money {
  return price
}
`;

/** One minimal, well-formed FlowMeta. */
const FLOWS = [
  {
    name: "calculateVat",
    qualifier: "pure",
    params: ["price: Money"],
    returnType: "Money",
    declaredEffects: [],
    location: { file: "examples/vat.fungi", line: 1, column: 1 },
  },
];

// A FIXED timestamp pins both `generatedAt` and `policyResolutionDag.resolvedAt`
// (generateManifest:584,602), so two manifests differing ONLY by sourceFile are
// otherwise byte-identical — isolating the path as the sole hash driver.
const GENERATED_AT = "2026-06-15T00:00:00.000Z";

// Windows-style path (backslashes) and its expected normalized form.
const WIN_PATH = "C:\\project\\examples\\vat.fungi";
const POSIX_PATH = "C:/project/examples/vat.fungi";

const PLACEHOLDER_PREFIX = "placeholder:sha256:";

/** Strip the signature → the exact object that was the signing target. */
function bodyOf(manifest) {
  const { governanceSignature, ...body } = manifest;
  return body;
}

/** Recover the signed body hash embedded in the (placeholder) signature. */
function embeddedBodyHash(manifest) {
  const sig = manifest.governanceSignature.ed25519;
  assert.ok(sig.startsWith(PLACEHOLDER_PREFIX), `unexpected signature form: ${sig}`);
  return sig.slice(PLACEHOLDER_PREFIX.length);
}

function makeManifest(sourceFile) {
  return generateManifest(SOURCE, sourceFile, FLOWS, undefined, GENERATED_AT);
}

// ---------------------------------------------------------------------------
// (a) sourceFile is present in the manifest
// ---------------------------------------------------------------------------

describe("manifest-generator: sourceFile presence", () => {
  it("the returned manifest carries a non-empty sourceFile", () => {
    const m = makeManifest(WIN_PATH);
    assert.equal(typeof m.sourceFile, "string");
    assert.ok(m.sourceFile.length > 0, "sourceFile must not be empty");
  });

  it("sourceFile is a member of the SIGNED body, not the signature wrapper", () => {
    const m = makeManifest(WIN_PATH);
    assert.ok(
      Object.prototype.hasOwnProperty.call(bodyOf(m), "sourceFile"),
      "sourceFile must live in the manifest body (the signing target)",
    );
  });
});

// ---------------------------------------------------------------------------
// (b) sourceFile is covered by bodyHash / the signature
// ---------------------------------------------------------------------------

describe("manifest-generator: sourceFile is bound inside the signed body hash", () => {
  it("recomputed sha256(canonicalJson(body)) matches the signed body hash", () => {
    const m = makeManifest(POSIX_PATH);
    const recomputed = sha256Hex(canonicalJson(bodyOf(m)));
    assert.equal(
      recomputed,
      embeddedBodyHash(m),
      "the body we recompute (which includes sourceFile) must hash to the signed body hash",
    );
  });

  it("the signed canonical bytes literally contain the path", () => {
    const m = makeManifest(POSIX_PATH);
    const canon = canonicalJson(bodyOf(m));
    assert.ok(
      canon.includes(POSIX_PATH),
      "the path must appear in the canonical bytes that are hashed and signed",
    );
  });

  it("mutating ONLY sourceFile changes the signed body hash (path is inside the body, not cosmetic)", () => {
    const m = makeManifest(POSIX_PATH);
    const body = bodyOf(m);

    const originalHash = sha256Hex(canonicalJson(body));
    assert.equal(originalHash, embeddedBodyHash(m), "sanity: recomputed == signed");

    // Tamper with the path alone — every other field byte-identical.
    const tampered = { ...body, sourceFile: "C:/attacker/swapped.fungi" };
    const tamperedHash = sha256Hex(canonicalJson(tampered));

    assert.notEqual(
      tamperedHash,
      originalHash,
      "Changing only sourceFile MUST change the body hash. If it did not, the path " +
        "would be outside the signature and a swap/reorder attack would go undetected.",
    );
  });

  it("two manifests differing ONLY by sourceFile produce different signatures (anti-swap, end-to-end)", () => {
    const a = makeManifest("C:/project/examples/vat.fungi");
    const b = makeManifest("C:/project/examples/other.fungi");

    // Control: identical SOURCE ⇒ identical sourceHash. The ONLY varying input is the path.
    assert.equal(a.sourceHash, b.sourceHash, "control: same source content ⇒ same sourceHash");

    assert.notEqual(
      embeddedBodyHash(a),
      embeddedBodyHash(b),
      "body hash must differ when only the path differs",
    );
    assert.notEqual(
      a.governanceSignature.ed25519,
      b.governanceSignature.ed25519,
      "Ed25519 signature must differ when only the path differs",
    );
    assert.notEqual(
      a.governanceSignature.mlDsa65,
      b.governanceSignature.mlDsa65,
      "ML-DSA-65 signature must differ when only the path differs",
    );
  });
});

// ---------------------------------------------------------------------------
// (c) backslashes normalized to forward slashes — BEFORE signing
// ---------------------------------------------------------------------------

describe("manifest-generator: sourceFile path normalization", () => {
  it("normalizes backslashes to forward slashes", () => {
    const m = makeManifest(WIN_PATH);
    assert.equal(m.sourceFile, POSIX_PATH);
    assert.ok(!m.sourceFile.includes("\\"), "no backslashes may remain in sourceFile");
  });

  it("the NORMALIZED path (not the raw backslash form) is what gets signed", () => {
    const m = makeManifest(WIN_PATH);
    const canon = canonicalJson(bodyOf(m));
    assert.ok(canon.includes(POSIX_PATH), "normalized path must be in the signed canonical bytes");

    // Equivalence: signing the backslash path and the forward-slash path yields the
    // same body hash — normalization happens upstream of the signature, so the two
    // spellings are not distinguishable swap targets.
    const fromWin = makeManifest(WIN_PATH);
    const fromPosix = makeManifest(POSIX_PATH);
    assert.equal(
      embeddedBodyHash(fromWin),
      embeddedBodyHash(fromPosix),
      "backslash and forward-slash spellings of the same path must sign identically",
    );
  });
});

// ---------------------------------------------------------------------------
// Versioned signing input + #67 CBOR self-verification
// ---------------------------------------------------------------------------
describe("manifest signing input (versioned) + #67 CBOR self-verify", () => {
  // A manifest body whose keys are deliberately OUT of lexicographic order, with nesting + an array,
  // so canonicalization (key-sorting) is observable and the JSON↔CBOR representation differs.
  const BODY = {
    schemaVersion: "fungi.manifest.v2",
    sourceHash: "sha256:" + "a".repeat(64),
    zeta: "last-alphabetically",
    alpha: 1,
    nested: { y: 2, x: 1, list: [3, 1, 2] },
    flags: [true, false, null],
  };

  it("manifestSigCanon: 'jcs' tag ⇒ jcs; untagged/legacy ⇒ legacy (back-compat default)", () => {
    assert.equal(manifestSigCanon({ algorithm: "Ed25519", canon: "jcs" }), "jcs");
    assert.equal(manifestSigCanon({ algorithm: "Ed25519" }), "legacy");   // untagged older signature
    assert.equal(manifestSigCanon("placeholder"), "legacy");
    assert.equal(manifestSigCanon(null), "legacy");
  });

  it("jcs input == canonicalJson; legacy input == pretty JSON; the two differ", () => {
    assert.equal(manifestSigningInput(BODY, "jcs"), canonicalJson(BODY));
    assert.equal(manifestSigningInput(BODY, "legacy"), JSON.stringify(BODY, null, 2));
    assert.notEqual(manifestSigningInput(BODY, "jcs"), manifestSigningInput(BODY, "legacy"));
  });

  it("#67 invariant: canonical (jcs) bytes reconstruct IDENTICALLY from the decoded CBOR (legacy do NOT)", () => {
    const cbor = serializeManifestCBOR(BODY);
    const decoded = decodeCBOR(new Uint8Array(cbor)).value;
    // The canonical (jcs) form is representation-independent → byte-identical from JSON object and CBOR.
    assert.equal(manifestSigningInput(decoded, "jcs"), manifestSigningInput(BODY, "jcs"),
      "jcs signing input must be identical whether built from the JSON object or the decoded CBOR");
    // The legacy (pretty-JSON) form depends on key order, which canonical CBOR re-sorts → it differs.
    // (This is exactly why #67 self-verification REQUIRES the canonical format.)
    assert.notEqual(manifestSigningInput(decoded, "legacy"), manifestSigningInput(BODY, "legacy"),
      "legacy pretty-JSON is order-dependent, so it canNOT self-verify from CBOR");
  });

  it("a jcs Ed25519 signature verifies from BOTH the JSON body AND the decoded CBOR (self-verifying artifact)", () => {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const sig = cryptoSign(null, Buffer.from(manifestSigningInput(BODY, "jcs")), privateKey);

    // Verify from the JSON object.
    assert.equal(cryptoVerify(null, Buffer.from(manifestSigningInput(BODY, "jcs")), publicKey, sig), true);

    // Verify from the AUTHORITATIVE CBOR — decode → re-canonicalize → verify. No .json consulted (#67).
    const decoded = decodeCBOR(new Uint8Array(serializeManifestCBOR(BODY))).value;
    assert.equal(cryptoVerify(null, Buffer.from(manifestSigningInput(decoded, "jcs")), publicKey, sig), true,
      "the canonical signature must validate directly over the decoded CBOR");

    // A tampered field breaks it (control).
    const tampered = { ...decoded, alpha: 999 };
    assert.equal(cryptoVerify(null, Buffer.from(manifestSigningInput(tampered, "jcs")), publicKey, sig), false);
  });
});

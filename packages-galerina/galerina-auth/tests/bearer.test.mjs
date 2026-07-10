// bearer.test.mjs — JWT/bearer factor: deny-by-default + the classic JWT footgun defences.
// Hermetic: keys generated in-process, clock injected via `now`; no network, no fixtures on disk.

import assert from "node:assert/strict";
import { test } from "node:test";
import { createHmac, generateKeyPairSync, sign as cryptoSign } from "node:crypto";
import { Verdict, bearerTokenVerdict, composeAuthVerdict } from "../dist/index.js";

// ── JWT builder helpers ──────────────────────────────────────────────────────
const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
const rawB64url = (buf) => Buffer.from(buf).toString("base64url");

/** Build a compact JWS `h.p.s` where `sign(signingInput) → Buffer`. */
function jwt(header, payload, sign) {
  const h = b64url(header);
  const p = b64url(payload);
  const sig = sign(`${h}.${p}`);
  return `${h}.${p}.${rawB64url(sig)}`;
}
const bearer = (token) => ({ authorization: `Bearer ${token}` });

// Fixed clock: "now" = 1_000_000s. Tokens use exp/nbf relative to it.
const NOW = 1_000_000;
const now = () => NOW;

// Keys
const HS_SECRET = Buffer.from("a".repeat(32), "utf8");
const hsSign = (secret) => (input) => createHmac("sha256", secret).update(input).digest();
const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 });
const ed = generateKeyPairSync("ed25519");
const rsSign = (input) => cryptoSign("sha256", Buffer.from(input), rsa.privateKey);
const edSign = (input) => cryptoSign(null, Buffer.from(input), ed.privateKey);

// ── happy paths ──────────────────────────────────────────────────────────────
test("valid HS256 token → ALLOW", () => {
  const t = jwt({ alg: "HS256", typ: "JWT" }, { sub: "u1", exp: NOW + 100 }, hsSign(HS_SECRET));
  const v = bearerTokenVerdict(bearer(t), { key: HS_SECRET, algorithms: ["HS256"], now });
  assert.equal(v, Verdict.ALLOW);
});

test("valid RS256 token → ALLOW", () => {
  const t = jwt({ alg: "RS256", typ: "JWT" }, { sub: "u1", exp: NOW + 100 }, rsSign);
  const v = bearerTokenVerdict(bearer(t), { key: rsa.publicKey, algorithms: ["RS256"], now });
  assert.equal(v, Verdict.ALLOW);
});

test("valid EdDSA (Ed25519) token → ALLOW", () => {
  const t = jwt({ alg: "EdDSA", typ: "JWT" }, { sub: "u1", exp: NOW + 100 }, edSign);
  const v = bearerTokenVerdict(bearer(t), { key: ed.publicKey, algorithms: ["EdDSA"], now });
  assert.equal(v, Verdict.ALLOW);
});

// ── absence = INDETERMINATE (no positive evidence, not a definite refusal) ─────
test("absent Authorization header → INDETERMINATE", () => {
  assert.equal(bearerTokenVerdict({}, { key: HS_SECRET, algorithms: ["HS256"], now }), Verdict.INDETERMINATE);
});
test("empty/whitespace header → INDETERMINATE", () => {
  assert.equal(bearerTokenVerdict({ authorization: "   " }, { key: HS_SECRET, algorithms: ["HS256"], now }), Verdict.INDETERMINATE);
});
test("non-Bearer scheme (Basic) → INDETERMINATE", () => {
  assert.equal(bearerTokenVerdict({ authorization: "Basic abc" }, { key: HS_SECRET, algorithms: ["HS256"], now }), Verdict.INDETERMINATE);
});

// ── footgun #1/#2: algorithm pinned by the caller; alg:none never passes ───────
test("alg:none is DENIED (unsigned token)", () => {
  const h = b64url({ alg: "none", typ: "JWT" });
  const p = b64url({ sub: "u1", exp: NOW + 100 });
  const t = `${h}.${p}.`; // JWS "none" has an empty signature
  assert.equal(bearerTokenVerdict(bearer(t), { key: HS_SECRET, algorithms: ["HS256"], now }), Verdict.DENY);
});

test("RS256↔HS256 confusion: caller pinned RS256, attacker sends HS256 signed with the public key → DENY", () => {
  // The classic attack: sign an HS256 token using the RSA PUBLIC key (PEM) as the HMAC secret.
  const pubPem = rsa.publicKey.export({ type: "spki", format: "pem" }).toString();
  const forged = jwt({ alg: "HS256", typ: "JWT" }, { sub: "attacker", exp: NOW + 100 }, hsSign(pubPem));
  // Server correctly pins RS256 (asymmetric) with the public key.
  const v = bearerTokenVerdict(bearer(forged), { key: rsa.publicKey, algorithms: ["RS256"], now });
  assert.equal(v, Verdict.DENY); // alg "HS256" is not in the pinned set → rejected before verification
});

test("alg not in the pinned set → DENY (HS384 token, only HS256 pinned)", () => {
  const t = jwt({ alg: "HS384", typ: "JWT" }, { sub: "u1", exp: NOW + 100 },
    (input) => createHmac("sha384", HS_SECRET).update(input).digest());
  assert.equal(bearerTokenVerdict(bearer(t), { key: HS_SECRET, algorithms: ["HS256"], now }), Verdict.DENY);
});

// ── footgun #3: key type must match the algorithm family ───────────────────────
test("key-type mismatch: HS256 pinned but an asymmetric public key supplied → DENY", () => {
  const t = jwt({ alg: "HS256", typ: "JWT" }, { sub: "u1", exp: NOW + 100 }, hsSign(HS_SECRET));
  // Misconfigured: HS256 with an RSA public KeyObject (not a secret) — must not verify.
  assert.equal(bearerTokenVerdict(bearer(t), { key: rsa.publicKey, algorithms: ["HS256"], now }), Verdict.DENY);
});

// ── footgun #4: exp required by default ────────────────────────────────────────
test("missing exp with default requireExp → DENY", () => {
  const t = jwt({ alg: "HS256", typ: "JWT" }, { sub: "u1" }, hsSign(HS_SECRET));
  assert.equal(bearerTokenVerdict(bearer(t), { key: HS_SECRET, algorithms: ["HS256"], now }), Verdict.DENY);
});
test("missing exp with requireExp:false → ALLOW (opt-out honoured)", () => {
  const t = jwt({ alg: "HS256", typ: "JWT" }, { sub: "u1" }, hsSign(HS_SECRET));
  assert.equal(bearerTokenVerdict(bearer(t), { key: HS_SECRET, algorithms: ["HS256"], now, requireExp: false }), Verdict.ALLOW);
});
test("expired token → DENY", () => {
  const t = jwt({ alg: "HS256", typ: "JWT" }, { sub: "u1", exp: NOW - 1 }, hsSign(HS_SECRET));
  assert.equal(bearerTokenVerdict(bearer(t), { key: HS_SECRET, algorithms: ["HS256"], now }), Verdict.DENY);
});
test("expired but within clockTolerance → ALLOW", () => {
  const t = jwt({ alg: "HS256", typ: "JWT" }, { sub: "u1", exp: NOW - 30 }, hsSign(HS_SECRET));
  assert.equal(bearerTokenVerdict(bearer(t), { key: HS_SECRET, algorithms: ["HS256"], now, clockToleranceSec: 60 }), Verdict.ALLOW);
});

// ── signature integrity ────────────────────────────────────────────────────────
test("tampered payload (signature no longer matches) → DENY", () => {
  const t = jwt({ alg: "HS256", typ: "JWT" }, { sub: "u1", exp: NOW + 100 }, hsSign(HS_SECRET));
  const [h, , s] = t.split(".");
  const tampered = `${h}.${b64url({ sub: "admin", exp: NOW + 100 })}.${s}`;
  assert.equal(bearerTokenVerdict(bearer(tampered), { key: HS_SECRET, algorithms: ["HS256"], now }), Verdict.DENY);
});
test("wrong HMAC secret → DENY", () => {
  const t = jwt({ alg: "HS256", typ: "JWT" }, { sub: "u1", exp: NOW + 100 }, hsSign(HS_SECRET));
  assert.equal(bearerTokenVerdict(bearer(t), { key: Buffer.from("b".repeat(32)), algorithms: ["HS256"], now }), Verdict.DENY);
});
test("malformed JWT (2 segments) → DENY", () => {
  assert.equal(bearerTokenVerdict(bearer("aaa.bbb"), { key: HS_SECRET, algorithms: ["HS256"], now }), Verdict.DENY);
});

// ── nbf / iss / aud ────────────────────────────────────────────────────────────
test("nbf in the future → DENY (not yet valid)", () => {
  const t = jwt({ alg: "HS256", typ: "JWT" }, { sub: "u1", exp: NOW + 100, nbf: NOW + 50 }, hsSign(HS_SECRET));
  assert.equal(bearerTokenVerdict(bearer(t), { key: HS_SECRET, algorithms: ["HS256"], now }), Verdict.DENY);
});
test("required issuer mismatch → DENY; match → ALLOW", () => {
  const bad = jwt({ alg: "HS256" }, { sub: "u1", exp: NOW + 100, iss: "evil" }, hsSign(HS_SECRET));
  const good = jwt({ alg: "HS256" }, { sub: "u1", exp: NOW + 100, iss: "trusted" }, hsSign(HS_SECRET));
  assert.equal(bearerTokenVerdict(bearer(bad), { key: HS_SECRET, algorithms: ["HS256"], now, issuer: "trusted" }), Verdict.DENY);
  assert.equal(bearerTokenVerdict(bearer(good), { key: HS_SECRET, algorithms: ["HS256"], now, issuer: "trusted" }), Verdict.ALLOW);
});
test("required audience: absent → DENY; string match → ALLOW; array includes → ALLOW", () => {
  const opts = { key: HS_SECRET, algorithms: ["HS256"], now, audience: "api" };
  const none = jwt({ alg: "HS256" }, { sub: "u1", exp: NOW + 100 }, hsSign(HS_SECRET));
  const str = jwt({ alg: "HS256" }, { sub: "u1", exp: NOW + 100, aud: "api" }, hsSign(HS_SECRET));
  const arr = jwt({ alg: "HS256" }, { sub: "u1", exp: NOW + 100, aud: ["web", "api"] }, hsSign(HS_SECRET));
  assert.equal(bearerTokenVerdict(bearer(none), opts), Verdict.DENY);
  assert.equal(bearerTokenVerdict(bearer(str), opts), Verdict.ALLOW);
  assert.equal(bearerTokenVerdict(bearer(arr), opts), Verdict.ALLOW);
});

// ── config / fail-closed edges ──────────────────────────────────────────────────
test("empty algorithms pin (misconfiguration) → DENY", () => {
  const t = jwt({ alg: "HS256" }, { sub: "u1", exp: NOW + 100 }, hsSign(HS_SECRET));
  assert.equal(bearerTokenVerdict(bearer(t), { key: HS_SECRET, algorithms: [], now }), Verdict.DENY);
});
test("ES256 listed but unsupported → DENY (fail-closed, never silent pass)", () => {
  const es = generateKeyPairSync("ec", { namedCurve: "P-256" });
  // A structurally-plausible ES256 token; our verifier does not implement ES* → must DENY.
  const t = jwt({ alg: "ES256" }, { sub: "u1", exp: NOW + 100 }, (input) => cryptoSign("sha256", Buffer.from(input), es.privateKey));
  assert.equal(bearerTokenVerdict(bearer(t), { key: es.publicKey, algorithms: ["ES256"], now }), Verdict.DENY);
});

// ── composition: the bearer factor folds into composeAuthVerdict with NO change to compose.ts ──
test("compose: a valid bearer + an ALLOW channel factor folds to ALLOW", () => {
  const t = jwt({ alg: "HS256" }, { sub: "u1", exp: NOW + 100 }, hsSign(HS_SECRET));
  const bv = bearerTokenVerdict(bearer(t), { key: HS_SECRET, algorithms: ["HS256"], now });
  assert.equal(composeAuthVerdict([Verdict.ALLOW, bv]), Verdict.ALLOW);
});

test("compose: a bearer DENY annihilates the fold even alongside an ALLOW channel", () => {
  const expired = jwt({ alg: "HS256" }, { sub: "u1", exp: NOW - 1 }, hsSign(HS_SECRET));
  const bv = bearerTokenVerdict(bearer(expired), { key: HS_SECRET, algorithms: ["HS256"], now });
  assert.equal(composeAuthVerdict([Verdict.ALLOW, bv]), Verdict.DENY);
});

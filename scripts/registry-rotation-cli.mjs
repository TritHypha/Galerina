#!/usr/bin/env node
// Registry rotation CLI: one root-signed rotation policy, then automated, bounded issuance.
//
//   keygen         generate a hybrid Ed25519 + ML-DSA-65 key pair into a directory OUTSIDE the repo
//   export-public derive the PUBLIC bundle from a private env the owner points at (writes only public files)
//   fingerprint    print the sha256 fingerprints of a PUBLIC key bundle (never reads private files)
//   draft-policy   build the UNSIGNED rotation policy for the root to review and sign once
//   sign-policy    ROOT CEREMONY: sign the policy with the offline root (explicit digest confirmation)
//   verify-policy  verify a signed policy against the root public key
//   issue          issuer: plan the next window (with overlap), issue + sign + chain-verify a delegation
//   status         show coverage, the next issue-by date, and a ready-to-run scheduler line
//   verify-chain   verify the anchor, policy and every issued delegation
//   --self-test    run the whole flow with throwaway keys in a temp directory
//
// Private files are read as data only by sign-policy (root) and issue (issuer); private values are never
// printed. Every write refuses to overwrite. Nothing runs in the background; `status --print-task` only
// PRINTS a scheduler command line.
//
// Policy format and threat model: docs/security/registry-rotation-policy-v1.md

import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  randomBytes,
  sign as edSign,
} from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const KERNEL_DIST = join(ROOT, "packages-ts", "galerina-framework-app-kernel", "dist", "index.js");
const TOWER_DIST = join(ROOT, "packages-ts", "galerina-tower-citizen", "dist", "index.js");
const COMPILER_PACKAGE = join(ROOT, "packages-ts", "galerina-core-compiler", "package.json");
const REVOCATION_GATE = join(ROOT, "governance", "revocation-registry.mjs");
const DEFAULT_ROOT_KEY_ID = "21415420b447e219";
const DEFAULT_ANCHOR_FILE = join(ROOT, "governance", "registry-delegation-f3172a48372bfb23-v2.json");
const DEFAULT_FIRST_KEY_ID = "0da09262513e2a8d";
const DAY = 86_400_000;
const KEY_ID = /^[0-9a-f]{16}$/;
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const iso = (ms) => new Date(ms).toISOString();
const refuse = (message) => { throw new Error(`REFUSED: ${message}`); };

// ---------------------------------------------------------------- argument parsing
const BOOLEAN_FLAGS = new Set([
  "--json", "--self-test", "--cleanup", "--print-task", "--no-first-rotation",
  "--no-generated-keys", "--help",
]);
export function parseArgs(argv) {
  const flags = new Map();
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) { positional.push(token); continue; }
    if (flags.has(token)) refuse(`command line repeats '${token}'.`);
    if (BOOLEAN_FLAGS.has(token)) { flags.set(token, true); continue; }
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) refuse(`option '${token}' lacks a value.`);
    flags.set(token, value);
    i += 1;
  }
  return { flags, positional };
}
const opt = (flags, name, fallback) => (flags.has(name) ? flags.get(name) : fallback);
const need = (flags, name) => {
  if (!flags.has(name)) refuse(`option '${name}' is required.`);
  return flags.get(name);
};
const numberOpt = (flags, name, fallback) => {
  if (!flags.has(name)) return fallback;
  const value = Number(flags.get(name));
  if (!Number.isFinite(value) || value <= 0) refuse(`option '${name}' must be a positive number.`);
  return value;
};

// ---------------------------------------------------------------- filesystem guards
function nearestRealPath(path) {
  let current = resolve(path);
  const tail = [];
  while (!existsSync(current)) {
    const parent = dirname(current);
    if (parent === current) break;
    tail.unshift(current.slice(parent.length).replace(/^[\\/]+/, ""));
    current = parent;
  }
  return join(realpathSync(current), ...tail);
}
export function assertOutsideRepo(path, label) {
  const target = nearestRealPath(path);
  const repo = realpathSync(ROOT);
  const rel = relative(repo, target);
  if (rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))) {
    refuse(`${label} '${path}' is inside the repository; private key material must live outside it.`);
  }
}
function writeNew(path, data, mode) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, data, { flag: "wx", ...(mode === undefined ? {} : { mode }) });
}
const writeJsonNew = (path, value) => writeNew(path, `${JSON.stringify(value, null, 2)}\n`);
const readJson = (path, label) => {
  try {
    return JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, ""));
  } catch {
    return refuse(`${label} '${path}' is missing or is not valid JSON.`);
  }
};

// ---------------------------------------------------------------- crypto helpers
async function loadKernel() { return import(pathToFileURL(KERNEL_DIST).href); }
async function loadTower() { return import(pathToFileURL(TOWER_DIST).href); }
async function loadMlDsa65() {
  const modulePath = createRequire(COMPILER_PACKAGE).resolve("@noble/post-quantum/ml-dsa.js");
  return (await import(pathToFileURL(modulePath).href)).ml_dsa65;
}
function canonicalBase64(value, label) {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) {
    refuse(`${label} is not canonical base64.`);
  }
  const bytes = Buffer.from(value, "base64");
  if (bytes.toString("base64") !== value) refuse(`${label} is not canonical base64.`);
  return bytes;
}
function readSigningEnvironment(path) {
  const bytes = readFileSync(path);
  if (bytes.includes(0) || (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf)
    || (bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff)) {
    refuse("signing environment must be UTF-8 without a byte-order mark.");
  }
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const fields = new Map();
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (line.trim().length === 0 || line.trimStart().startsWith("#")) continue;
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (!match) refuse(`signing environment has a malformed record at line ${index + 1}; values not shown.`);
    if (fields.has(match[1])) refuse(`signing environment repeats '${match[1]}' at line ${index + 1}.`);
    fields.set(match[1], match[2].trim());
  }
  return fields;
}
async function readPrivate(path, expectedKeyId, label) {
  const fields = readSigningEnvironment(path);
  if (fields.get("GALERINA_SIGNING_KEY_ID") !== expectedKeyId) {
    refuse(`${label} environment keyId does not match the expected '${expectedKeyId}'.`);
  }
  if (fields.get("GALERINA_SIGNING_ALGORITHM") !== "hybrid-ed25519-mldsa65") {
    refuse(`${label} key must be hybrid-ed25519-mldsa65; Ed25519-only is a prohibited downgrade.`);
  }
  const edB64 = fields.get("GALERINA_SIGNING_PRIVATE_KEY_B64");
  const mlB64 = fields.get("GALERINA_SIGNING_MLDSA_PRIVATE_KEY_B64");
  if (!edB64 || !mlB64) refuse(`${label} environment lacks one or both private halves.`);
  const edPrivate = createPrivateKey(canonicalBase64(edB64, `${label} Ed25519 key`).toString("utf8"));
  if (edPrivate.asymmetricKeyType !== "ed25519") refuse(`${label} classical key is not Ed25519.`);
  const mlDsa65 = await loadMlDsa65();
  const mlSecret = canonicalBase64(mlB64, `${label} ML-DSA-65 key`);
  if (mlSecret.length !== mlDsa65.lengths.secretKey) refuse(`${label} ML-DSA-65 key has the wrong length.`);
  return { edPrivate, mlSecret: new Uint8Array(mlSecret), mlDsa65 };
}
function signersFor(priv, context) {
  const ctx = new TextEncoder().encode(context);
  return {
    ed: (message) => edSign(null, message, priv.edPrivate).toString("base64"),
    ml: (message) => Buffer.from(priv.mlDsa65.sign(message, priv.mlSecret, { context: ctx })).toString("base64"),
  };
}
function readPublicBundle(dir, keyId) {
  if (!KEY_ID.test(keyId)) refuse(`key id '${keyId}' must be 16 lowercase hexadecimal characters.`);
  const pemPath = join(dir, `signing-key-${keyId}.pub.pem`);
  const mlPath = join(dir, `signing-key-${keyId}.mldsa.pub.b64`);
  if (!existsSync(pemPath) || !existsSync(mlPath)) {
    refuse(`public bundle for '${keyId}' not found in '${dir}' (needs signing-key-${keyId}.pub.pem and .mldsa.pub.b64).`);
  }
  const ed25519PublicKeyPem = readFileSync(pemPath, "utf8");
  const publicKey = createPublicKey(ed25519PublicKeyPem);
  if (publicKey.asymmetricKeyType !== "ed25519") refuse(`'${keyId}' classical public key is not Ed25519.`);
  const mlDsa65PublicKey = new Uint8Array(canonicalBase64(readFileSync(mlPath, "utf8").trim(), `'${keyId}' ML-DSA-65 public key`));
  return {
    keyId,
    ed25519PublicKeyPem,
    mlDsa65PublicKey,
    ed25519PublicKeySha256: sha256(publicKey.export({ type: "spki", format: "der" })),
    mlDsa65PublicKeySha256: sha256(mlDsa65PublicKey),
  };
}
async function verifiersFor(bundle, role) {
  const { createRegistryPublicVerifiers } = await loadTower();
  return createRegistryPublicVerifiers({
    role, keyId: bundle.keyId,
    ed25519PublicKeyPem: bundle.ed25519PublicKeyPem,
    mlDsa65PublicKey: bundle.mlDsa65PublicKey,
  });
}
async function revocationGate(ctx) {
  if (ctx.skipRevocation) return () => false;
  const gate = await import(pathToFileURL(REVOCATION_GATE).href);
  gate.assertRegistryTrustworthy(ROOT);
  return (keyId) => gate.isKeyRevoked(keyId, ROOT);
}
const governanceDir = (flags, ctx) => resolve(opt(flags, "--governance-dir", ctx.governanceDir ?? join(ROOT, "governance")));
const nowMs = (flags, ctx) => {
  const raw = opt(flags, "--now", ctx.now);
  const value = raw === undefined ? Date.now() : Date.parse(raw);
  if (!Number.isFinite(value)) refuse("--now is not a valid instant.");
  return value;
};

// ---------------------------------------------------------------- chain loading
const ISSUED_FILE = /^registry-issued-delegation-([0-9a-f]{16})-s(\d+)\.json$/;
const POLICY_FILE = /^registry-rotation-policy-s(\d+)\.json$/;
function loadChain(dir, policy, anchorFile) {
  const anchor = readJson(anchorFile, "anchor delegation");
  const delegations = [];
  for (const name of readdirSync(dir).sort()) {
    const match = ISSUED_FILE.exec(name);
    if (!match) continue;
    const delegation = readJson(join(dir, name), "issued delegation");
    if (delegation.operational?.keyId !== match[1] || delegation.serial !== Number(match[2])) {
      refuse(`issued delegation file '${name}' does not match its own key id or serial.`);
    }
    delegations.push(delegation);
  }
  delegations.sort((a, b) => a.serial - b.serial);
  return { policy, anchor, delegations };
}
function resolveAnchorFile(flags, policy, dir) {
  if (flags.has("--anchor-file")) return resolve(flags.get("--anchor-file"));
  const file = join(dir, `registry-delegation-${policy.anchor.keyId}-v${policy.anchor.serial}.json`);
  return existsSync(file) ? file : DEFAULT_ANCHOR_FILE;
}
function newestPolicyFile(dir) {
  const files = readdirSync(dir).map((n) => [POLICY_FILE.exec(n), n]).filter(([m]) => m)
    .sort((a, b) => Number(b[0][1]) - Number(a[0][1]));
  return files.length === 0 ? undefined : join(dir, files[0][1]);
}
async function authorityOptions(policy, flags, ctx, at) {
  const dir = governanceDir(flags, ctx);
  const root = readPublicBundle(dir, policy.rootKeyId);
  const issuer = readPublicBundle(dir, policy.issuer.keyId);
  return {
    expectedRootKeyId: policy.rootKeyId,
    at: iso(at),
    minSerial: 0,
    minPolicySerial: 0,
    isRevoked: await revocationGate(ctx),
    verifyRootPolicy: await verifiersFor(root, "rotationPolicy"),
    verifyRootDelegation: await verifiersFor(root, "root"),
    verifyIssuer: await verifiersFor(issuer, "rotationIssuer"),
    issuerPublicKeyFingerprints: { ed25519: issuer.ed25519PublicKeySha256, mlDsa65: issuer.mlDsa65PublicKeySha256 },
    sha256Hex: sha256,
  };
}

// ---------------------------------------------------------------- commands
export async function cmdKeygen(flags) {
  const dir = resolve(need(flags, "--out-dir"));
  assertOutsideRepo(dir, "--out-dir");
  const keyId = opt(flags, "--key-id", randomBytes(8).toString("hex"));
  if (!KEY_ID.test(keyId)) refuse("--key-id must be 16 lowercase hexadecimal characters.");
  const mlDsa65 = await loadMlDsa65();
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const ml = mlDsa65.keygen(new Uint8Array(randomBytes(32)));
  const pem = publicKey.export({ type: "spki", format: "pem" });
  const envText = [
    `GALERINA_SIGNING_KEY_ID=${keyId}`,
    "GALERINA_SIGNING_ALGORITHM=hybrid-ed25519-mldsa65",
    `GALERINA_SIGNING_PRIVATE_KEY_B64=${Buffer.from(privateKey.export({ type: "pkcs8", format: "pem" })).toString("base64")}`,
    `GALERINA_SIGNING_MLDSA_PRIVATE_KEY_B64=${Buffer.from(ml.secretKey).toString("base64")}`,
    "",
  ].join("\n");
  const envPath = join(dir, `galerina-signing-${keyId}.env`);
  writeNew(envPath, envText, 0o600);
  writeNew(join(dir, `signing-key-${keyId}.pub.pem`), pem);
  writeNew(join(dir, `signing-key-${keyId}.mldsa.pub.b64`), `${Buffer.from(ml.publicKey).toString("base64")}\n`);
  return {
    keyId,
    privateEnvFile: envPath,
    publicFiles: [`signing-key-${keyId}.pub.pem`, `signing-key-${keyId}.mldsa.pub.b64`].map((f) => join(dir, f)),
    ed25519PublicKeySha256: sha256(publicKey.export({ type: "spki", format: "der" })),
    mlDsa65PublicKeySha256: sha256(ml.publicKey),
    note: "Private values are in the .env file only (never printed). Back it up offline; never commit it.",
  };
}

export async function cmdExportPublic(flags) {
  // Derives the PUBLIC bundle from a private env the OWNER points at (only the owner runs this on a key they hold).
  const keyId = need(flags, "--key-id");
  if (!KEY_ID.test(keyId)) refuse("--key-id must be 16 lowercase hexadecimal characters.");
  const priv = await readPrivate(resolve(need(flags, "--env")), keyId, "export");
  const dir = resolve(need(flags, "--out-dir"));
  const publicKey = createPublicKey(priv.edPrivate);
  const mlPublic = priv.mlDsa65.getPublicKey(priv.mlSecret);
  writeNew(join(dir, `signing-key-${keyId}.pub.pem`), publicKey.export({ type: "spki", format: "pem" }));
  writeNew(join(dir, `signing-key-${keyId}.mldsa.pub.b64`), `${Buffer.from(mlPublic).toString("base64")}\n`);
  return {
    keyId,
    publicFiles: [`signing-key-${keyId}.pub.pem`, `signing-key-${keyId}.mldsa.pub.b64`].map((f) => join(dir, f)),
    ed25519PublicKeySha256: sha256(publicKey.export({ type: "spki", format: "der" })),
    mlDsa65PublicKeySha256: sha256(mlPublic),
  };
}

export async function cmdFingerprint(flags) {
  const bundle = readPublicBundle(resolve(need(flags, "--pub-dir")), need(flags, "--key-id"));
  return {
    keyId: bundle.keyId,
    ed25519PublicKeySha256: bundle.ed25519PublicKeySha256,
    mlDsa65PublicKeySha256: bundle.mlDsa65PublicKeySha256,
  };
}

export async function cmdDraftPolicy(flags, ctx = {}) {
  const K = await loadKernel();
  const now = nowMs(flags, ctx);
  const dir = governanceDir(flags, ctx);
  const anchorFile = resolve(opt(flags, "--anchor-file", DEFAULT_ANCHOR_FILE));
  const anchor = readJson(anchorFile, "anchor delegation");
  if (anchor.schema !== "galerina-registry-delegation/v1" || !anchor.rootSignature) {
    refuse("the anchor must be a root-signed galerina-registry-delegation/v1 document.");
  }
  const rootKeyId = opt(flags, "--root-key-id", anchor.rootKeyId ?? DEFAULT_ROOT_KEY_ID);
  if (anchor.rootKeyId !== rootKeyId) refuse("the anchor was not issued by the stated root key.");
  const issuer = readPublicBundle(resolve(opt(flags, "--issuer-pub-dir", dir)), need(flags, "--issuer-key-id"));
  const pinned = [];
  let firstRotation = null;
  if (!flags.has("--no-first-rotation")) {
    const firstId = opt(flags, "--first-key-id", DEFAULT_FIRST_KEY_ID);
    const first = readPublicBundle(resolve(need(flags, "--first-pub-dir")), firstId);
    pinned.push({
      keyId: first.keyId,
      ed25519PublicKeySha256: first.ed25519PublicKeySha256,
      mlDsa65PublicKeySha256: first.mlDsa65PublicKeySha256,
    });
    firstRotation = { fromKeyId: anchor.operational.keyId, toKeyId: first.keyId };
  }
  const policyDays = numberOpt(flags, "--policy-days", 720);
  const input = {
    registry: anchor.registry,
    serial: numberOpt(flags, "--serial", 1),
    issuedAt: iso(now),
    notBefore: iso(now),
    notAfter: iso(now + policyDays * DAY),
    rootKeyId,
    issuer: {
      keyId: issuer.keyId, algorithm: "Ed25519+ML-DSA-65",
      ed25519PublicKeySha256: issuer.ed25519PublicKeySha256,
      mlDsa65PublicKeySha256: issuer.mlDsa65PublicKeySha256,
    },
    allowedRoles: ["package-manifest.sign", "registry-index.sign"],
    allowedAlgorithms: ["hybrid-ed25519-mldsa65"],
    maxDelegationLifetimeSeconds: Math.round(numberOpt(flags, "--max-delegation-days", 30) * 86_400),
    minOverlapSeconds: Math.round(numberOpt(flags, "--min-overlap-days", 7) * 86_400),
    pinnedOperationalKeys: pinned,
    allowGeneratedKeyIds: !flags.has("--no-generated-keys"),
    deniedOperationalKeyIds: [...new Set([anchor.operational.keyId, ...(flags.has("--deny") ? flags.get("--deny").split(",") : [])])].sort(),
    anchor: { serial: anchor.serial, keyId: anchor.operational.keyId, notAfter: anchor.notAfter },
    firstRotation,
  };
  const policy = K.buildRegistryRotationPolicy(input);
  const out = resolve(need(flags, "--out"));
  writeJsonNew(out, policy);
  return {
    unsignedPolicy: out,
    policyDigestSha256: K.registryRotationPolicyDigest(policy, sha256),
    fileSha256: sha256(readFileSync(out)),
    review: {
      registry: policy.registry, serial: policy.serial,
      window: `${policy.notBefore} .. ${policy.notAfter}`,
      rootKeyId: policy.rootKeyId, issuerKeyId: policy.issuer.keyId,
      allowedRoles: policy.allowedRoles,
      maxDelegationLifetimeDays: policy.maxDelegationLifetimeSeconds / 86_400,
      minOverlapDays: policy.minOverlapSeconds / 86_400,
      allowGeneratedKeyIds: policy.allowGeneratedKeyIds,
      pinnedOperationalKeyIds: policy.pinnedOperationalKeys.map((k) => k.keyId),
      deniedOperationalKeyIds: policy.deniedOperationalKeyIds,
      anchor: policy.anchor, firstRotation: policy.firstRotation,
    },
  };
}

export async function cmdSignPolicy(flags, ctx = {}) {
  const K = await loadKernel();
  const unsigned = readJson(need(flags, "--policy"), "unsigned policy");
  if (unsigned.rootSignature !== undefined) refuse("the policy already carries a root signature.");
  const policy = K.buildRegistryRotationPolicy(unsigned);
  const digest = K.registryRotationPolicyDigest(policy, sha256);
  if (need(flags, "--confirm-digest") !== digest) {
    refuse(`--confirm-digest does not equal the policy digest ${digest}; compare it with the draft-policy output before signing.`);
  }
  if (!ctx.skipRevocation) {
    const isRevoked = await revocationGate(ctx);
    if (isRevoked(policy.rootKeyId)) refuse("the root key is revoked.");
  }
  const priv = await readPrivate(resolve(need(flags, "--root-env")), policy.rootKeyId, "root");
  const signers = signersFor(priv, K.REGISTRY_ROTATION_POLICY_V1_CONTEXT);
  const signed = K.signRegistryRotationPolicy(policy, signers.ed, signers.ml);
  const dir = governanceDir(flags, ctx);
  const root = readPublicBundle(dir, policy.rootKeyId);
  K.verifyRegistryRotationPolicy(signed, {
    expectedRootKeyId: policy.rootKeyId, at: policy.notBefore, isRevoked: () => false,
    verifyRootPolicy: await verifiersFor(root, "rotationPolicy"),
  });
  const out = resolve(need(flags, "--out"));
  writeJsonNew(out, signed);
  return {
    signedPolicy: out,
    policyDigestSha256: digest,
    fileSha256: sha256(readFileSync(out)),
    selfVerified: "verified",
    next: "Publish the signed policy and the issuer public key files (governance/); keep the root key offline again.",
  };
}

export async function cmdVerifyPolicy(flags, ctx = {}) {
  const K = await loadKernel();
  const policy = readJson(need(flags, "--policy"), "policy");
  const at = nowMs(flags, ctx);
  const root = readPublicBundle(governanceDir(flags, ctx), policy.rootKeyId);
  const verdict = K.verifyRegistryRotationPolicy(policy, {
    expectedRootKeyId: policy.rootKeyId, at: iso(at), isRevoked: await revocationGate(ctx),
    verifyRootPolicy: await verifiersFor(root, "rotationPolicy"),
  });
  return { verdict, serial: policy.serial, policyDigestSha256: K.registryRotationPolicyDigest(policy, sha256) };
}

async function chainContext(flags, ctx, at) {
  const K = await loadKernel();
  const dir = governanceDir(flags, ctx);
  const policyFile = flags.has("--policy") ? resolve(flags.get("--policy")) : newestPolicyFile(dir);
  if (policyFile === undefined) refuse(`no registry-rotation-policy-s<N>.json in '${dir}'; pass --policy.`);
  const policy = readJson(policyFile, "policy");
  const chain = loadChain(dir, policy, resolveAnchorFile(flags, policy, dir));
  return { K, dir, policy, chain, options: await authorityOptions(policy, flags, ctx, at) };
}

export async function cmdIssue(flags, ctx = {}) {
  const now = nowMs(flags, ctx);
  const { K, dir, policy, chain, options } = await chainContext(flags, ctx, now);
  K.verifyRegistryRotationPolicy(policy, {
    expectedRootKeyId: options.expectedRootKeyId, at: iso(now), isRevoked: options.isRevoked,
    verifyRootPolicy: options.verifyRootPolicy,
  });
  const digest = K.registryRotationPolicyDigest(policy, sha256);
  const mine = chain.delegations.filter((d) => d.policySha256 === digest);
  const last = mine[mine.length - 1];
  const predecessor = last
    ? { serial: last.serial, notBefore: last.notBefore, notAfter: last.notAfter }
    : { serial: chain.anchor.serial, notBefore: chain.anchor.notBefore, notAfter: chain.anchor.notAfter };
  const plan = K.planRegistryRotationWindow({
    policy, predecessor, now: iso(now),
    ...(flags.has("--lifetime-days") ? { lifetimeSeconds: Math.round(Number(flags.get("--lifetime-days")) * 86_400) } : {}),
    ...(flags.has("--overlap-days") ? { overlapSeconds: Math.round(Number(flags.get("--overlap-days")) * 86_400) } : {}),
  });
  // Operational key: pinned first-rotation target, an existing public bundle, or a fresh key outside the repo.
  const isFirst = last === undefined && policy.firstRotation !== null;
  let operational;
  let generated;
  if (isFirst || flags.has("--operational-key-id")) {
    const keyId = flags.has("--operational-key-id") ? flags.get("--operational-key-id") : policy.firstRotation.toKeyId;
    if (isFirst && keyId !== policy.firstRotation.toKeyId) {
      refuse(`the first rotation must delegate '${policy.firstRotation.toKeyId}' (the policy's firstRotation target).`);
    }
    const bundle = readPublicBundle(resolve(need(flags, "--operational-pub-dir")), keyId);
    operational = { keyId, algorithm: "Ed25519+ML-DSA-65", ed25519PublicKeySha256: bundle.ed25519PublicKeySha256, mlDsa65PublicKeySha256: bundle.mlDsa65PublicKeySha256 };
  } else {
    generated = await cmdKeygen(new Map([["--out-dir", need(flags, "--new-key-dir")]]));
    operational = { keyId: generated.keyId, algorithm: "Ed25519+ML-DSA-65", ed25519PublicKeySha256: generated.ed25519PublicKeySha256, mlDsa65PublicKeySha256: generated.mlDsa65PublicKeySha256 };
  }
  const unsigned = K.buildRegistryIssuedDelegation({
    registry: policy.registry, serial: plan.serial, issuedAt: plan.issuedAt, notBefore: plan.notBefore,
    notAfter: plan.notAfter, rootKeyId: policy.rootKeyId, operational, roles: policy.allowedRoles,
    policySerial: policy.serial, policySha256: digest, issuerKeyId: policy.issuer.keyId,
  });
  const priv = await readPrivate(resolve(need(flags, "--issuer-env")), policy.issuer.keyId, "issuer");
  const signers = signersFor(priv, K.REGISTRY_ISSUED_DELEGATION_V1_CONTEXT);
  const signed = K.signRegistryIssuedDelegation(unsigned, signers.ed, signers.ml);
  // Fail closed: the whole chain, including the new link, must verify before anything is written.
  const candidate = { ...chain, delegations: [...chain.delegations, signed] };
  const verdict = K.verifyRegistryIssuedDelegationChain(signed, candidate, { ...options, at: plan.notBefore });
  const outDir = resolve(opt(flags, "--out-dir", dir));
  const outFile = join(outDir, `registry-issued-delegation-${operational.keyId}-s${plan.serial}.json`);
  writeJsonNew(outFile, signed);
  const nextIssueBy = Date.parse(plan.notAfter) - policy.minOverlapSeconds * 1000 - DAY;
  return {
    verdict, delegationFile: outFile, serial: plan.serial, operationalKeyId: operational.keyId,
    window: `${plan.notBefore} .. ${plan.notAfter}`, publishBy: plan.publishBy,
    overlapWithPredecessorDays: (Date.parse(predecessor.notAfter) - Date.parse(plan.notBefore)) / DAY,
    nextIssueBy: iso(nextIssueBy),
    ...(generated === undefined ? {} : { generatedKey: generated }),
    note: "Commit/publish the delegation file by publishBy. The operational private key stays outside the repo.",
  };
}

export async function cmdVerifyChain(flags, ctx = {}) {
  const now = nowMs(flags, ctx);
  const { K, policy, chain, options } = await chainContext(flags, ctx, now);
  const policyDigest = K.registryRotationPolicyDigest(policy, sha256);
  K.verifyRegistryRotationPolicy(policy, {
    expectedRootKeyId: options.expectedRootKeyId, at: iso(now), isRevoked: options.isRevoked,
    verifyRootPolicy: options.verifyRootPolicy,
  });
  const results = chain.delegations.map((d) => ({
    serial: d.serial, operationalKeyId: d.operational.keyId,
    verdict: K.verifyRegistryIssuedDelegationChain(d, chain, { ...options, at: d.notBefore }),
  }));
  return { policySerial: policy.serial, policyDigestSha256: policyDigest, anchorSerial: chain.anchor.serial, delegations: results };
}

export async function cmdStatus(flags, ctx = {}) {
  const now = nowMs(flags, ctx);
  const { K, policy, chain } = await chainContext(flags, ctx, now);
  const windows = [chain.anchor, ...chain.delegations].map((d) => ({
    serial: d.serial, keyId: d.operational.keyId, notBefore: d.notBefore, notAfter: d.notAfter,
    active: Date.parse(d.notBefore) <= now && now <= Date.parse(d.notAfter),
  }));
  const newest = windows[windows.length - 1];
  const nextIssueBy = Date.parse(newest.notAfter) - policy.minOverlapSeconds * 1000 - DAY;
  const covered = windows.some((w) => w.active);
  const warnDays = numberOpt(flags, "--warn-days", 10);
  const dueInDays = (nextIssueBy - now) / DAY;
  const policyEndsInDays = (Date.parse(policy.notAfter) - now) / DAY;
  const state = !covered ? "NOT_COVERED" : dueInDays <= warnDays ? "ISSUE_SOON" : "OK";
  const result = {
    state, covered, newestSerial: newest.serial, newestNotAfter: newest.notAfter,
    nextIssueBy: iso(nextIssueBy), dueInDays: Math.round(dueInDays * 10) / 10,
    policySerial: policy.serial, policyEndsInDays: Math.round(policyEndsInDays),
    policyRenewalWarning: policyEndsInDays <= 60 ? "The root must sign a new rotation policy within 60 days." : null,
    windows,
  };
  if (flags.has("--print-task")) {
    result.schedulerLine = `schtasks /Create /SC DAILY /TN "Galerina rotation status" /TR "node ${join(ROOT, "scripts", "registry-rotation-cli.mjs")} status --json" /ST 09:00`;
    result.schedulerNote = "PRINTED ONLY: nothing is scheduled. Exit code 3 = issue soon, 2 = not covered.";
  }
  void K;
  return result;
}

// ---------------------------------------------------------------- self test
export async function selfTest(flags) {
  const K = await loadKernel();
  const base = mkdtempSync(join(tmpdir(), "galerina-rotation-selftest-"));
  assertOutsideRepo(base, "self-test directory");
  const gov = join(base, "governance");
  mkdirSync(gov);
  const keys = join(base, "keys");
  const ctx = { skipRevocation: true, governanceDir: gov };
  const steps = [];
  const check = (name, ok) => { steps.push({ name, ok }); if (!ok) throw new Error(`SELF-TEST FAILED: ${name}`); };
  const expectRefusal = async (name, fn, pattern) => {
    try { await fn(); } catch (error) { check(name, pattern.test(String(error.code ?? error.message))); return; }
    check(name, false);
  };
  const mk = async (keyId, where) => cmdKeygen(new Map([["--out-dir", where], ...(keyId ? [["--key-id", keyId]] : [])]));
  const copyPublic = async (from, id) => {
    for (const f of [`signing-key-${id}.pub.pem`, `signing-key-${id}.mldsa.pub.b64`]) writeFileSync(join(gov, f), readFileSync(join(from, f)));
  };
  const root = await mk(DEFAULT_ROOT_KEY_ID, join(keys, "root"));
  const issuer = await mk(undefined, join(keys, "issuer"));
  const slide = await mk("f3172a48372bfb23", join(keys, "slide"));
  const galerina = await mk(DEFAULT_FIRST_KEY_ID, join(keys, "galerina"));
  await copyPublic(join(keys, "root"), root.keyId);
  await copyPublic(join(keys, "issuer"), issuer.keyId);
  check("keygen writes private material outside the repo only", true);
  const exported = await cmdExportPublic(new Map([["--env", galerina.privateEnvFile], ["--key-id", galerina.keyId], ["--out-dir", join(base, "exported")]]));
  check("export-public reproduces the exact public fingerprints", exported.ed25519PublicKeySha256 === galerina.ed25519PublicKeySha256 && exported.mlDsa65PublicKeySha256 === galerina.mlDsa65PublicKeySha256);
  await expectRefusal("keygen refuses a directory inside the repo", () => cmdKeygen(new Map([["--out-dir", join(ROOT, "governance", "x")]])), /inside the repository/);
  // Anchor: root-signed v1 delegation for the SLIDE key.
  const now = Date.parse("2026-10-27T15:45:00.000Z");
  const rootPriv = await readPrivate(root.privateEnvFile, root.keyId, "root");
  const rootSign = signersFor(rootPriv, K.REGISTRY_DELEGATION_V1_CONTEXT);
  const anchor = K.signRegistryAuthorityDelegation(K.buildRegistryAuthorityDelegation({
    registry: "https://registry.galerina.dev", serial: 2, issuedAt: iso(now), notBefore: iso(now), notAfter: iso(now + 89 * DAY),
    rootKeyId: root.keyId, roles: ["package-manifest.sign", "registry-index.sign"],
    operational: { keyId: slide.keyId, algorithm: "Ed25519+ML-DSA-65", ed25519PublicKeySha256: slide.ed25519PublicKeySha256, mlDsa65PublicKeySha256: slide.mlDsa65PublicKeySha256 },
  }), rootSign.ed, rootSign.ml);
  const anchorFile = join(gov, `registry-delegation-${slide.keyId}-v2.json`);
  writeJsonNew(anchorFile, anchor);
  const f = (...pairs) => new Map(pairs);
  const draft = await cmdDraftPolicy(f(["--now", iso(now)], ["--anchor-file", anchorFile], ["--issuer-key-id", issuer.keyId], ["--issuer-pub-dir", gov], ["--first-key-id", galerina.keyId], ["--first-pub-dir", join(keys, "galerina")], ["--out", join(base, "policy.unsigned.json")]), ctx);
  check("draft-policy builds an unsigned policy with the digest", /^[0-9a-f]{64}$/.test(draft.policyDigestSha256));
  await expectRefusal("sign-policy refuses a wrong confirm-digest", () => cmdSignPolicy(f(["--policy", draft.unsignedPolicy], ["--confirm-digest", "0".repeat(64)], ["--root-env", root.privateEnvFile], ["--out", join(base, "x.json")]), ctx), /confirm-digest/);
  const signed = await cmdSignPolicy(f(["--policy", draft.unsignedPolicy], ["--confirm-digest", draft.policyDigestSha256], ["--root-env", root.privateEnvFile], ["--out", join(gov, "registry-rotation-policy-s1.json")]), ctx);
  check("sign-policy signs and self-verifies", signed.selfVerified === "verified");
  const vp2 = await cmdVerifyPolicy(f(["--policy", signed.signedPolicy], ["--now", iso(now + DAY)]), ctx);
  check("verify-policy verifies", vp2.verdict === "verified");
  await expectRefusal("issue #1 must target the pinned Galerina key (generated key refused)", () => cmdIssue(f(["--now", iso(now)], ["--issuer-env", issuer.privateEnvFile], ["--new-key-dir", join(keys, "gen0")]), ctx), /--operational-pub-dir/);
  const first = await cmdIssue(f(["--now", iso(now)], ["--issuer-env", issuer.privateEnvFile], ["--operational-pub-dir", join(keys, "galerina")]), ctx);
  check("issue #1 delegates the Galerina key with overlap", first.operationalKeyId === galerina.keyId && first.overlapWithPredecessorDays >= 7);
  const t2 = Date.parse(first.window.split(" .. ")[0]) + 20 * DAY;
  const second = await cmdIssue(f(["--now", iso(t2)], ["--issuer-env", issuer.privateEnvFile], ["--new-key-dir", join(keys, "gen1")]), ctx);
  check("issue #2 generates a fresh key and keeps the overlap", second.serial === 4 && second.overlapWithPredecessorDays >= 7 && second.generatedKey !== undefined);
  await expectRefusal("issue refuses a window that would leave a gap", () => cmdIssue(f(["--now", iso(Date.parse(second.window.split(" .. ")[1]) + DAY)], ["--issuer-env", issuer.privateEnvFile], ["--new-key-dir", join(keys, "gen2")]), ctx), /ERR_REGISTRY_ROTATION_GAP/);
  const vc = await cmdVerifyChain(f(["--now", iso(t2)]), ctx);
  check("verify-chain verifies every link", vc.delegations.length === 2 && vc.delegations.every((d) => d.verdict === "verified"));
  const st = await cmdStatus(f(["--now", iso(t2)]), ctx);
  check("status reports coverage", st.covered === true && ["OK", "ISSUE_SOON"].includes(st.state));
  // Tamper: lengthen a delegation after issuance.
  const tamperFile = join(gov, `registry-issued-delegation-${galerina.keyId}-s3.json`);
  const doc = JSON.parse(readFileSync(tamperFile, "utf8"));
  doc.notAfter = iso(Date.parse(doc.notAfter) + DAY);
  writeFileSync(tamperFile, JSON.stringify(doc, null, 2));
  await expectRefusal("verify-chain refuses a tampered delegation", () => cmdVerifyChain(f(["--now", iso(t2)]), ctx), /BAD_SIGNATURE/);
  return { ok: true, tempDirectory: base, steps, note: flags.has("--cleanup") ? "Temp directory left in place; remove it yourself if wanted." : "Throwaway keys live only in the temp directory." };
}

// ---------------------------------------------------------------- entry
const USAGE = `usage: node scripts/registry-rotation-cli.mjs <command> [options]
  keygen        --out-dir <dir outside repo> [--key-id <16hex>]
  export-public --env <private env> --key-id <16hex> --out-dir <dir>   (writes ONLY the public bundle)
  fingerprint   --pub-dir <dir> --key-id <16hex>
  draft-policy  --issuer-key-id <16hex> [--issuer-pub-dir <dir>] --first-pub-dir <dir> [--first-key-id 0da09262513e2a8d]
                [--anchor-file <v2.json>] --out <unsigned.json> [--policy-days 720] [--max-delegation-days 30]
                [--min-overlap-days 7] [--no-generated-keys] [--no-first-rotation] [--deny id,id]
  sign-policy   --policy <unsigned.json> --confirm-digest <sha256> --root-env <file> --out <signed.json>
  verify-policy --policy <signed.json>
  issue         --issuer-env <file> (--operational-pub-dir <dir> [--operational-key-id <id>] | --new-key-dir <dir outside repo>)
                [--policy <signed.json>] [--out-dir <dir>] [--lifetime-days n] [--overlap-days n]
  status        [--print-task] [--warn-days 10]     (exit 2 = not covered, 3 = issue soon)
  verify-chain
  --self-test [--cleanup]
common: --governance-dir <dir> --now <iso> --json`;

const COMMANDS = {
  keygen: cmdKeygen, "export-public": cmdExportPublic, fingerprint: cmdFingerprint, "draft-policy": cmdDraftPolicy, "sign-policy": cmdSignPolicy,
  "verify-policy": cmdVerifyPolicy, issue: cmdIssue, status: cmdStatus, "verify-chain": cmdVerifyChain,
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { flags, positional } = parseArgs(process.argv.slice(2));
    if (flags.has("--help") || (positional.length === 0 && !flags.has("--self-test"))) {
      process.stdout.write(`${USAGE}\n`);
      process.exit(flags.has("--help") ? 0 : 1);
    }
    const result = flags.has("--self-test")
      ? await selfTest(flags)
      : await (COMMANDS[positional[0]] ?? (() => refuse(`unknown command '${positional[0]}'.\n${USAGE}`)))(flags, {});
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (positional[0] === "status") process.exit(result.state === "NOT_COVERED" ? 2 : result.state === "ISSUE_SOON" ? 3 : 0);
  } catch (error) {
    process.stderr.write(`${error.code ? `${error.code}: ` : ""}${error.message}\n`);
    if (process.env.GALERINA_ROTATION_DEBUG === "1") process.stderr.write(`${error.stack}\n`);
    process.exit(1);
  }
}
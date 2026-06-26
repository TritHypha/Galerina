import { createHash, createHmac, generateKeyPairSync, sign, verify, randomBytes } from "node:crypto";
import { performance } from "node:perf_hooks";

// ML-DSA-65 (FIPS 204) via @noble/post-quantum. Not a direct dep of this benchmark, so it's
// resolved from the compiler package (which IS a dep). This lets crypto-ops measure the
// post-quantum + hybrid signature cost the governance attestation/proof-graph/bridge surfaces
// now use — the R4 "PQ-tax" visibility gate ("resist where reasonable, no hot-path hammering").
const { ml_dsa65 } = await import("../../../galerina-core-compiler/node_modules/@noble/post-quantum/ml-dsa.js");
const MLDSA_CTX = Buffer.from("galerina.bench.mldsa.v1");

const DEFAULT_ITERATIONS = 10000;
const KEY_SIZE = 1024; // bytes for hashing

function bench(name, fn, iterations) {
  // Warmup
  for (let i = 0; i < 10; i++) fn();
  if (typeof globalThis.gc === "function") globalThis.gc();

  const t0 = performance.now();
  const cpu0 = process.cpuUsage();
  for (let i = 0; i < iterations; i++) fn();
  const elapsedMs = performance.now() - t0;
  const cpu = process.cpuUsage(cpu0);

  return {
    name,
    iterations,
    elapsedMs: Number(elapsedMs.toFixed(3)),
    operationsPerSecond: Number((iterations / (elapsedMs / 1000)).toFixed(0)),
    nsPerOp: Number((elapsedMs * 1e6 / iterations).toFixed(1)),
    cpu: { totalMs: Number(((cpu.user + cpu.system) / 1000).toFixed(3)) },
  };
}

function runBench(iterations = DEFAULT_ITERATIONS) {
  const data = Buffer.alloc(KEY_SIZE, 0x42);
  const key  = Buffer.alloc(32, 0x1f);

  // Ed25519 keygen (do once, not per iteration)
  const { privateKey, publicKey } = generateKeyPairSync("ed25519", {
    privateKeyEncoding: { type: "pkcs8", format: "der" },
    publicKeyEncoding:  { type: "spki",  format: "der" },
  });
  const privObj = { key: privateKey, format: "der", type: "pkcs8" };
  const pubObj  = { key: publicKey,  format: "der", type: "spki"  };
  let sig;

  // ML-DSA-65 keypair (one-time, like the Ed25519 keygen above)
  const mlKeys = ml_dsa65.keygen(randomBytes(32));
  let mlSig;

  if (typeof globalThis.gc === "function") globalThis.gc();   // clean baseline for heap/op
  const __memBefore = process.memoryUsage();
  const results = {
    runtime: "nodejs",
    benchmark: "crypto-ops-v1",
    dataBytes: KEY_SIZE,
    results: {
      sha256:     bench("SHA-256",       () => createHash("sha256").update(data).digest(), iterations),
      hmacSha256: bench("HMAC-SHA256",   () => createHmac("sha256", key).update(data).digest(), iterations),
      ed25519Sign:   bench("Ed25519 sign",   () => { sig = sign(null, data, privObj); }, Math.min(iterations, 2000)),
      ed25519Verify: bench("Ed25519 verify", () => verify(null, data, pubObj, sig),    Math.min(iterations, 2000)),
      mlDsa65Sign:   bench("ML-DSA-65 sign",   () => { mlSig = ml_dsa65.sign(data, mlKeys.secretKey, { context: MLDSA_CTX }); }, Math.min(iterations, 100)),
      mlDsa65Verify: bench("ML-DSA-65 verify", () => ml_dsa65.verify(mlSig, data, mlKeys.publicKey, { context: MLDSA_CTX }),    Math.min(iterations, 200)),
      hybridSign:    bench("Hybrid Ed25519+ML-DSA-65 sign",   () => { sig = sign(null, data, privObj); mlSig = ml_dsa65.sign(data, mlKeys.secretKey, { context: MLDSA_CTX }); }, Math.min(iterations, 100)),
      hybridVerify:  bench("Hybrid Ed25519+ML-DSA-65 verify", () => { verify(null, data, pubObj, sig); ml_dsa65.verify(mlSig, data, mlKeys.publicKey, { context: MLDSA_CTX }); }, Math.min(iterations, 200)),
    },
    sizes: {
      ed25519: { sigBytes: sig.length, pubDerBytes: publicKey.length },
      mlDsa65: { sigBytes: mlSig.length, pubBytes: mlKeys.publicKey.length },
    },
    notes: [
      "bcrypt intentionally excluded from this runner (use bcrypt.mjs for that)",
      "SHA-256 throughput: (computed after)",
    ],
  };

  const __memAfter = process.memoryUsage();
  results.memory = {
    rssBytes: __memAfter.rss, heapUsedBytes: __memAfter.heapUsed,
    heapUsedBefore: __memBefore.heapUsed,
    heapUsedDelta: __memAfter.heapUsed - __memBefore.heapUsed,
  };

  // Fix notes after we have sha256 timing
  const sha256TimeSec = results.results.sha256.elapsedMs / 1000;
  const sha256ThroughputMBs = (KEY_SIZE * iterations / 1e6) / sha256TimeSec;
  results.notes[1] = `SHA-256 throughput: ${sha256ThroughputMBs.toFixed(0)} MB/s (${KEY_SIZE} byte chunks)`;

  return results;
}

function parseIntFlag(name, fb) { const i = process.argv.indexOf(name); return i >= 0 ? parseInt(process.argv[i + 1] || "", 10) || fb : fb; }
const its = parseIntFlag("--iterations", parseIntFlag("--operations", DEFAULT_ITERATIONS));
console.log(JSON.stringify(runBench(its), null, 2));

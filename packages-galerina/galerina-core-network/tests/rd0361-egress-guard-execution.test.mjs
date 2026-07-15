// rd0361-egress-guard-execution.test.mjs — RD-0361 (TLSTP): the egress-guard `.fungi` twin EXECUTES; the
// outbound SSRF decision surface is proven EQUAL to egress-guard.ts's spec.
//   R0 build → WASM · R1 sign + #105-admit · R3 exhaustive Int-fold differential (label-safe: category
//   codes + ALLOW/DENY trits are Ints — the host owns all string/URL parsing, so no string marshalling).
// Covers: classifyIpv4Category (metadata-first band ladder over a boundary-dense octet corpus),
// egressVerdict (deny-by-default host admission, exhaustive), resolvedVerdict (the DNS-rebind fold,
// exhaustive), urlVerdict (the guardOutboundUrl composition, exhaustive). Moves egress-guard → differential.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const COMPILER = join(HERE, "..", "..", "galerina-core-compiler", "dist", "index.js");
const TWIN = join(HERE, "..", "src", "self-hosted", "egress-guard.fungi");
const B = [false, true];
const bit = (b) => (b ? 1 : 0);

// JS references — mirror the .fungi ladders EXACTLY (fall-through included).
const refClassify = (a, b, c, d) => {
  if (a === 169 && b === 254) return (c === 169 && d === 254) ? 0 : 3;
  if (a === 0) return 7;
  if (a === 127) return 1;
  if (a === 10) return 2;
  if (a === 172 && b > 15 && b < 32) return 2;
  if (a === 192) {
    if (b === 168) return 2;
    if (b === 0 && (c === 0 || c === 2)) return 8;
  }
  if (a === 100 && b > 63 && b < 128) return 5;
  if (a === 198) {
    if (b === 18 || b === 19) return 8;
    if (b === 51 && c === 100) return 8;
  }
  if (a === 203 && b === 0 && c === 113) return 8;
  if (a > 223 && a < 240) return 6;
  if (a > 239) return (a === 255 && b === 255 && c === 255 && d === 255) ? 9 : 8;
  return 10;
};
const refEgress = (category, allowNonPublic, allowMetadata, allowLoopback, isAllowlisted) => {
  if (isAllowlisted) return 1;
  if (category === 0) return allowMetadata ? 1 : -1;
  if (category === 1 && allowLoopback) return 1;
  if (category === 10) return 1;
  if (category === 11) return -1;
  return allowNonPublic ? 1 : -1;
};
const refResolved = (resolvedCount, anyNonPublic, isAllowlisted) => {
  if (resolvedCount < 1) return -1;
  if (isAllowlisted) return 1;
  return anyNonPublic ? -1 : 1;
};
const refUrl = (schemeAllowed, credentialsBlocked, hostVerdict, isLoopback, isAllowlisted, tlsOk, portOk) => {
  if (!schemeAllowed) return -1;
  if (credentialsBlocked) return -1;
  if (hostVerdict < 1) return hostVerdict;
  if (isLoopback) return 1;
  if (isAllowlisted) return 1;
  if (!tlsOk) return -1;
  if (!portOk) return -1;
  return 1;
};

test("RD-0361 TLSTP · egress-guard: R0 build → R1 #105-admit → R3 WASM ≡ SSRF decision spec (Int-fold, label-safe)", async () => {
  assert.ok(existsSync(COMPILER), "core-compiler dist not built — run the full suite first");
  const L = await import(pathToFileURL(COMPILER).href);
  let src = readFileSync(TWIN, "utf8"); if (src.charCodeAt(0) === 0xFEFF) src = src.slice(1);
  const prog = L.parseProgram(src, "egress-guard.fungi");
  assert.equal((prog.diagnostics ?? []).filter((d) => d.severity === "error").length, 0, "twin parses clean (R0)");
  const fx = L.checkEffects(prog.flows, prog.ast);
  const { gir } = L.emitGIR(prog.ast, prog.flows, fx);
  const wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "egress-guard", prog.ast, true));
  const asm = await L.assembleWAT(wat);
  assert.ok(asm.valid && asm.diagnostics.length === 0, `twin WAT assembles (R0): ${JSON.stringify(asm.diagnostics)}`);
  const host = L.createHostRuntime();
  const kp = L.generateRunnerKeypair();
  const att = L.signWasm(asm.wasm, kp.privateKeyPem, "dev");
  const { instance } = await L.admitAndInstantiate({ wasm: asm.wasm, attestation: att, policy: { requireSigned: true, publicKeyPem: kp.publicKeyPem }, host });
  const X = instance.exports;
  for (const f of ["classifyIpv4Category", "egressVerdict", "resolvedVerdict", "urlVerdict"])
    assert.equal(typeof X[f], "function", `${f} admitted (R1)`);

  // classifyIpv4Category — boundary-dense corpus: every band edge ±1 on `a`, the discriminating
  // `b`/`c`/`d` values of each band, and the named SSRF prizes (169.254.169.254, broadcast).
  const AS = [0, 1, 9, 10, 11, 99, 100, 101, 126, 127, 128, 168, 169, 170, 171, 172, 173, 191, 192, 193, 197, 198, 199, 202, 203, 204, 223, 224, 225, 239, 240, 241, 254, 255];
  const BS = [0, 1, 15, 16, 18, 19, 31, 32, 51, 63, 64, 100, 113, 127, 128, 168, 254, 255];
  const CS = [0, 2, 100, 113, 169, 255];
  const DS = [0, 254, 255];
  let n = 0;
  for (const a of AS) for (const b of BS) for (const c of CS) for (const d of DS) {
    const got = X.classifyIpv4Category(a, b, c, d);
    assert.equal(got, refClassify(a, b, c, d), `classifyIpv4Category(${a}.${b}.${c}.${d})`);
    n++;
  }
  assert.ok(n > 10000, `boundary corpus is dense (${n} points)`);
  assert.equal(X.classifyIpv4Category(169, 254, 169, 254), 0, "the metadata endpoint is category 0 (the SSRF prize)");

  // egressVerdict — exhaustive: 12 categories (+2 out-of-range) × 2^4 policy flags.
  for (let cat = -1; cat <= 12; cat++) for (const np of B) for (const md of B) for (const lb of B) for (const al of B) {
    const got = X.egressVerdict(cat, bit(np), bit(md), bit(lb), bit(al));
    assert.equal(got, refEgress(cat, np, md, lb, al), `egressVerdict(${cat},${np},${md},${lb},${al})`);
    assert.ok(got === 1 || got === -1, "verdict is a trit ALLOW/DENY");
  }

  // resolvedVerdict — exhaustive DNS-rebind fold.
  for (const count of [-2, -1, 0, 1, 2, 7]) for (const anp of B) for (const al of B) {
    assert.equal(X.resolvedVerdict(count, bit(anp), bit(al)), refResolved(count, anp, al), `resolvedVerdict(${count},${anp},${al})`);
  }

  // urlVerdict — exhaustive composition: 2^6 booleans × hostVerdict ∈ {-1, 0, 1}.
  for (const sa of B) for (const cb of B) for (const hv of [-1, 0, 1]) for (const il of B) for (const al of B) for (const tls of B) for (const po of B) {
    assert.equal(
      X.urlVerdict(bit(sa), bit(cb), hv, bit(il), bit(al), bit(tls), bit(po)),
      refUrl(sa, cb, hv, il, al, tls, po),
      `urlVerdict(${sa},${cb},${hv},${il},${al},${tls},${po})`,
    );
  }
});

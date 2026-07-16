// rd0361-kernel-auth-gate-execution.test.mjs — RD-0361 (I/O–kernel tranche): the kernel.fungi twin
// EXECUTES, and its gate-6 auth verdict is proven EQUAL to the REAL shipped kernel `handle` pipeline.
//
// This closes the LAST RD-0361 shadow (the kernel/auth-gate lane). Same shape as the registry-index and
// secret-gate execution gates, with one first: a STRING-ARG twin — `authGateVerdict(authMode: String, …)`
// is driven with a real interned-string argument (host.internString), not just a string RETURN.
//   R0  kernel.fungi `galerina build`s to a real, signable WASM (buildable now — no P9, no DSS.wasm).
//   R1  that WASM is signed + admitted through the attestation-first #105 gate (requireSigned) + instantiated.
//   R3  FAIL-CLOSED DIFFERENTIAL: over the full gate-6 matrix, the WASM verdict string EQUALS the decision the
//       REAL `createAppKernel(...).handle(...)` pipeline makes — NOT an inlined mirror: each case drives the
//       shipped kernel and maps its actual HTTP response (admit / the three distinct 401 reasons) into the
//       twin's token vocabulary. The transport-computed EVIDENCE the twin folds (channel-verdict collapse via
//       the shipped decideAtBoundary; header presence = NON-EMPTY per the RD-0307/0309 fix) is derived from
//       the SAME scenario, mirroring the .ts's own gate-6 structure.
//
// Nothing here is authoritative: the `.ts` kernel still decides at runtime. The R4 authority flip is owner-gated (#143).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { createAppKernel } from "../dist/index.js";
import { decideAtBoundary } from "../../galerina-tower-citizen/dist/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const COMPILER = join(HERE, "..", "..", "galerina-core-compiler", "dist", "index.js");
const TWIN = join(HERE, "..", "src", "self-hosted", "kernel.fungi");
const dec = new TextDecoder();

// A GET /r kernel with the given route-auth config; the handler admits (200) when gate 6 passes.
const kernelFor = (auth) => createAppKernel({
  routes: [{ method: "GET", path: "/r", handler: "h", ...(auth ? { auth } : {}) }],
  dispatch: { h: () => ({ body: { ok: true } }) },
});
const req = (over = {}) => ({ method: "GET", path: "/r", headers: {}, body: new Uint8Array(0), query: {}, requestId: "rq", receivedAt: 0, ...over });

// The REAL kernel decision → the twin's token vocabulary. A non-401 means gate 6 admitted; the three 401
// `message`s are the three distinct refuse reasons the twin also distinguishes (proven by probe).
function realToken(res) {
  if (res.status !== 401) return "admit";
  const msg = JSON.parse(dec.decode(res.body)).message ?? "";
  if (msg === "Channel/identity verdict denied admission.") return "unauthorized_channel_verdict_denied";
  if (msg === "Authorization header required.") return "unauthorized_header_required";
  if (msg.startsWith("A channel/identity verdict is required")) return "unauthorized_verdict_required";
  return `UNMAPPED:${msg}`;
}

// The transport-computed EVIDENCE the pure twin folds — derived from the scenario, mirroring gate 6's own
// structure in kernel.ts (channelVerdict collapse via decideAtBoundary; presence = a non-empty header value).
function evidence(auth, over) {
  const cv = over.channelVerdict;
  const authz = over.headers?.authorization;
  return {
    authMode: auth?.mode ?? "required", // kernel default is `required`
    hasChannelVerdict: cv !== undefined,
    channelVerdictAuthorized: cv !== undefined ? decideAtBoundary(cv).authorized : false,
    headerPresent: typeof authz === "string" && authz.trim().length > 0, // RD-0307/0309: empty/whitespace ≠ presence
    allowPresenceFallback: auth?.allowHeaderPresenceFallback === true,
  };
}

// The full gate-6 matrix — every twin outcome, both admission boundaries, and the empty/whitespace
// header-presence bypass the RD-0307/0309 fix closed (#10).
const SCENARIOS = [
  { name: "public route admits",                    auth: { mode: "public" },                                          over: {} },
  { name: "required + channel ALLOW(+1) admits",    auth: { mode: "required" },                                        over: { channelVerdict: 1 } },
  { name: "required + channel DENY(-1) refuses",    auth: { mode: "required" },                                        over: { channelVerdict: -1 } },
  { name: "required + channel INDET(0) refuses",    auth: { mode: "required" },                                        over: { channelVerdict: 0 } },
  { name: "required + fallback + header admits",    auth: { mode: "required", allowHeaderPresenceFallback: true },     over: { headers: { authorization: "Bearer t" } } },
  { name: "required + fallback + no header 401",    auth: { mode: "required", allowHeaderPresenceFallback: true },     over: {} },
  { name: "required + fallback + EMPTY header 401",  auth: { mode: "required", allowHeaderPresenceFallback: true },     over: { headers: { authorization: "" } } },
  { name: "required + fallback + WS-only header 401", auth: { mode: "required", allowHeaderPresenceFallback: true },   over: { headers: { authorization: "   " } } },
  { name: "required + no fallback + header 401",    auth: { mode: "required" },                                        over: { headers: { authorization: "Bearer t" } } },
  { name: "required + no fallback + no header 401", auth: { mode: "required" },                                        over: {} },
];

test("RD-0361 kernel · auth gate 6: R0 build → R1 #105-admit → R3 WASM ≡ real kernel handle (string-arg twin)", async () => {
  assert.ok(existsSync(COMPILER), "galerina-core-compiler dist not built — run the full suite before this execution-cutover gate");
  assert.equal(typeof createAppKernel, "function", "the real kernel (createAppKernel) must be exported for the differential");
  const L = await import(pathToFileURL(COMPILER).href);

  // ── R0 · the twin builds to a WASM that wabt-assembles ──
  let src = readFileSync(TWIN, "utf8");
  if (src.charCodeAt(0) === 0xFEFF) src = src.slice(1);
  const prog = L.parseProgram(src, "kernel.fungi");
  assert.equal((prog.diagnostics ?? []).filter((d) => d.severity === "error").length, 0, "twin parses clean (R0)");
  const fx = L.checkEffects(prog.flows, prog.ast);
  const { gir } = L.emitGIR(prog.ast, prog.flows, fx);
  const wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "kernel", prog.ast, /*exportAllPure*/ true));
  const asm = await L.assembleWAT(wat);
  assert.ok(asm.valid && asm.diagnostics.length === 0, `twin WAT assembles to WASM (R0): ${JSON.stringify(asm.diagnostics)}`);

  // ── R1 · sign + admit through the attestation-first #105 gate, then instantiate ──
  const host = L.createHostRuntime();
  for (const e of L.getInternedStrings()) host.seedString(e.handle, e.value); // string-return handles resolve
  const kp = L.generateRunnerKeypair();
  const att = L.signWasm(asm.wasm, kp.privateKeyPem, "dev");
  const { instance } = await L.admitAndInstantiate({
    wasm: asm.wasm, attestation: att, policy: { requireSigned: true, publicKeyPem: kp.publicKeyPem }, host,
  });
  assert.equal(typeof instance.exports.authGateVerdict, "function", "authGateVerdict admitted + exported (R1)");

  const S = (s) => host.internString(s); // string ARG marshalled to a handle the module compares by identity
  const B = (b) => (b ? 1 : 0);
  const twinVerdict = (ev) => host.readString(
    instance.exports.authGateVerdict(S(ev.authMode), B(ev.hasChannelVerdict), B(ev.channelVerdictAuthorized), B(ev.headerPresent), B(ev.allowPresenceFallback)),
  );

  // ── R3 · fail-closed differential: WASM verdict EQUALS the real kernel handle's gate-6 decision ──
  let agree = 0;
  for (const s of SCENARIOS) {
    const res = await kernelFor(s.auth).handle(req(s.over));
    const real = realToken(res);
    assert.ok(!real.startsWith("UNMAPPED"), `${s.name}: real kernel produced an unmapped response — ${real}`);
    const twin = twinVerdict(evidence(s.auth, s.over));
    assert.equal(twin, real, `${s.name}: WASM authGateVerdict='${twin}' must equal real kernel decision='${real}' (status ${res.status})`);
    agree++;
  }
  assert.equal(agree, SCENARIOS.length, "every gate-6 differential case checked");

  // The two admission boundaries, asserted explicitly on BOTH sides:
  assert.equal(twinVerdict(evidence({ mode: "public" }, {})), "admit", "WASM: a public route admits");
  assert.notEqual((await kernelFor({ mode: "public" }).handle(req({}))).status, 401, "real kernel: a public route admits");
  assert.equal(twinVerdict(evidence({ mode: "required" }, { channelVerdict: 1 })), "admit", "WASM: an ALLOW channel verdict admits");
  assert.notEqual((await kernelFor({ mode: "required" }).handle(req({ channelVerdict: 1 }))).status, 401, "real kernel: an ALLOW channel verdict admits");
});

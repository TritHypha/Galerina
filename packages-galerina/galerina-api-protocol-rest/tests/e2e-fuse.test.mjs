// Fuse B3 — end-to-end fusion test for the reference REST adapter.
//
// Builds on the B2 governed component loader (../../galerina-framework-app-kernel/
// dist/fuse-loader.js). It FUSES this package's *built* dist/ artifacts (governed,
// placeholder-signed .wasm + signed manifest with an embedded `fuse` block) into a
// host-callable component, then invokes the adapter's flows and asserts the REST
// dispatch end-to-end — proving the /src → governed .wasm → fused component path.
//
// PRECONDITION: the package must be built first:
//   cd <repo root> && node galerina.mjs build --package packages-galerina/galerina-api-protocol-rest
import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { mkdtempSync, mkdirSync, cpSync, rmSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";

// The B2 loader lives in the app-kernel package's dist/.
import { fusePackage } from "../../galerina-framework-app-kernel/dist/fuse-loader.js";

const here = dirname(fileURLToPath(import.meta.url));
// tests/ → package dir (this is the package being fused).
const PKG_DIR = join(here, "..");
const PKG_NAME = "galerina-api-protocol-rest";
const WASM_PATH = join(PKG_DIR, "dist", `${PKG_NAME}.wasm`);

// HTTP method codes on the wire ABI: 1=GET, 2=POST, 3=PUT, 4=DELETE.
// Path codes on the wire ABI:        1=/health, 2=/orders, 3=/orders/{id}.

// A warn sink so any loader WARN output is captured, not printed to the test log.
function capturingWarn() {
  const lines = [];
  return { warn: (m) => lines.push(m), lines };
}

// ── 1 — the built package FUSES and its governed flows run end-to-end ─────────
test("the built REST adapter fuses (zero-touch auto-signed) and invoke('main') routes POST /orders → 201", async () => {
  assert.ok(existsSync(WASM_PATH), "package must be built first (galerina build --package …)");
  const { warn, lines } = capturingWarn();

  // Zero-touch key lifecycle: `galerina build` auto-provisioned a dev signing key and
  // REALLY signed the manifest (Ed25519), so the loader VERIFIES it without allowUnsigned.
  // The developer never handled a key — yet fusion is from a verified, tamper-evident
  // manifest. (The unsigned/placeholder fail-closed floor is preserved in test 4.)
  const component = await fusePackage(PKG_DIR, { warn });

  assert.equal(component.name, PKG_NAME);
  assert.equal(component.seam, "protocol.inbound");
  assert.deepEqual([...component.capabilities], ["network.inbound"]);

  // main() runs the representative POST /orders request → 201 Created.
  assert.equal(component.invoke("main"), 201);
  // A verified manifest must NOT trip any unsigned path.
  assert.ok(!lines.some((l) => l.includes("SPORE-FUSE-UNSIGNED")), "a verified manifest must not warn unsigned");
});

// ── 2 — the full REST dispatch matrix routes correctly through the fused wasm ──
test("the fused adapter dispatches the full (method, path) REST matrix", async () => {
  const { warn } = capturingWarn();
  const component = await fusePackage(PKG_DIR, { allowUnsigned: true, warn });

  // dispatch(method, path) → HTTP status. Deny-by-default for unknown routes/verbs.
  const cases = [
    // method, path, expected status, label
    [1, 1, 200, "GET /health → 200 OK"],
    [2, 1, 405, "POST /health → 405 Method Not Allowed"],
    [1, 2, 200, "GET /orders → 200 OK (list)"],
    [2, 2, 201, "POST /orders → 201 Created"],
    [3, 2, 405, "PUT /orders (collection) → 405"],
    [1, 3, 200, "GET /orders/{id} → 200 OK"],
    [3, 3, 200, "PUT /orders/{id} → 200 OK (replaced)"],
    [4, 3, 204, "DELETE /orders/{id} → 204 No Content"],
    [2, 3, 405, "POST /orders/{id} (item) → 405"],
    [1, 9, 404, "GET /unknown → 404 Not Found (deny-by-default)"],
    [0, 2, 400, "bad method → 400 Bad Request"],
  ];
  for (const [method, path, expected, label] of cases) {
    assert.equal(component.invoke("dispatch", method, path), expected, label);
  }

  // The per-route helpers are exported and individually callable too.
  assert.equal(component.invoke("routeHealth", 1), 200, "routeHealth GET");
  assert.equal(component.invoke("routeOrders", 2), 201, "routeOrders POST");
  assert.equal(component.invoke("routeOrderItem", 4), 204, "routeOrderItem DELETE");
});

// ── 3 — a tampered .wasm (hash ≠ signed descriptor) is rejected, fail-closed ──
test("a tampered .wasm (sha256 mismatch vs signed descriptor) is rejected before fusion", async () => {
  const root = mkdtempSync(join(tmpdir(), "spore-b3-"));
  const pkg = join(root, PKG_NAME);
  mkdirSync(pkg, { recursive: true });
  cpSync(PKG_DIR, pkg, { recursive: true });
  try {
    // Corrupt the wasm by appending a byte; the embedded (signed) descriptor's
    // wasmSha256 no longer matches, so fusion must throw before instantiation.
    const tamperedWasm = join(pkg, "dist", `${PKG_NAME}.wasm`);
    const original = readFileSync(tamperedWasm);
    writeFileSync(tamperedWasm, Buffer.concat([original, Buffer.from([0x00])]));

    await assert.rejects(
      () => fusePackage(pkg, { allowUnsigned: true, warn: () => {} }),
      /SPORE-FUSE-HASH-MISMATCH/,
      "tampered wasm must be refused with a hash-mismatch fusion error",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ── 4 — an UNSIGNED / placeholder manifest is fail-closed without allowUnsigned ─
// The real build now auto-signs (test 1), so we explicitly DOWNGRADE a temp copy's
// manifest to a placeholder (Ed25519+ML-DSA-65 stub, no real keyId+signature) — the
// loader treats that as unsigned — and assert the fail-closed floor still holds, plus
// that allowUnsigned admits it only with an audible warning.
test("an unsigned/placeholder manifest is refused unless allowUnsigned is set", async () => {
  const root = mkdtempSync(join(tmpdir(), "spore-b3-unsigned-"));
  const pkg = join(root, PKG_NAME);
  mkdirSync(pkg, { recursive: true });
  cpSync(PKG_DIR, pkg, { recursive: true });
  try {
    const manifestPath = join(pkg, "dist", `${PKG_NAME}.lmanifest.json`);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.governanceSignature = {
      algorithm: "Ed25519+ML-DSA-65",
      ed25519: "placeholder:unsigned",
      mlDsa65: "placeholder:unsigned",
    };
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    // Fail-closed without allowUnsigned.
    await assert.rejects(
      () => fusePackage(pkg, { warn: () => {} }),
      /SPORE-FUSE-UNSIGNED/,
      "unsigned manifest must be refused fail-closed when allowUnsigned is not set",
    );

    // With allowUnsigned it admits the unsigned manifest, but must announce it.
    const { warn, lines } = capturingWarn();
    const component = await fusePackage(pkg, { allowUnsigned: true, warn });
    assert.equal(component.invoke("main"), 201);
    assert.ok(
      lines.some((l) => l.includes("SPORE-FUSE-UNSIGNED-ALLOWED")),
      "expected unsigned-allowed warning",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

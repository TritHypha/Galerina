import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  APP_KERNEL_HOLD_PIN_SCHEMA,
  addSecretAuthority,
  bindGovernedRuntime,
  bindProtectedMemoryLifecycle,
  emitRuntimeAuditReport,
  enqueueQueueJob,
  executeStructuredAwait,
  installDurableReplayStore,
  installKernelDefaultRegistryCheck,
  prepareProtectedMemoryRouteRequest,
  wireFuseBorderIntoKernel,
} from "../dist/hold-pin.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function assertNonAuthorizing(value) {
  assert.equal(value.authorityReleased, false);
  assert.equal(value.admissionAuthority, false);
  assert.equal(Object.isFrozen(value), true);
}

describe("app-kernel HOLD pin", () => {
  it("prepareProtectedMemoryRouteRequest packages REQUESTED_NOT_ADMITTED", () => {
    const request = prepareProtectedMemoryRouteRequest({ route: "/secure" });
    assert.equal(request.kind, "PROTECTED_MEMORY_ROUTE_REQUEST");
    if (request.kind !== "PROTECTED_MEMORY_ROUTE_REQUEST") return;
    assert.equal(request.schema, APP_KERNEL_HOLD_PIN_SCHEMA);
    assert.equal(request.status, "REQUESTED_NOT_ADMITTED");
    assert.equal(request.route, "/secure");
    assert.deepEqual({ ...request.requires }, {
      ownerCompleteDesignApproval: true,
      boundProtectedOperation: true,
      amazonLinuxTcbProfile: true,
      signetIssuerRevoker: true,
      fungiLeaseAbi: true,
    });
    assertNonAuthorizing(request);
  });

  it("prepare refuses authority and malformed input", () => {
    const base = { route: "/secure" };
    assert.equal(prepareProtectedMemoryRouteRequest({ ...base, admission: true }).code, "APPK_HOLD_REQUEST_AUTHORITY_FIELD_PRESENT");
    assert.equal(prepareProtectedMemoryRouteRequest({ ...base, kernel: "src/kernel.ts" }).code, "APPK_HOLD_REQUEST_AUTHORITY_FIELD_PRESENT");
    assert.equal(prepareProtectedMemoryRouteRequest({ ...base, secretsAuthority: {} }).code, "APPK_HOLD_REQUEST_AUTHORITY_FIELD_PRESENT");
    assert.equal(prepareProtectedMemoryRouteRequest({ ...base, fuseBorder: true }).code, "APPK_HOLD_REQUEST_AUTHORITY_FIELD_PRESENT");
    assert.equal(prepareProtectedMemoryRouteRequest(null).code, "APPK_HOLD_REQUEST_MALFORMED");
    assert.equal(prepareProtectedMemoryRouteRequest({ path: "/secure" }).code, "APPK_HOLD_REQUEST_MALFORMED");
    assert.equal(prepareProtectedMemoryRouteRequest({ route: "" }).code, "APPK_HOLD_REQUEST_MALFORMED");
  });

  it("secret-authority / fuse-border / runtime / live acts always refuse", () => {
    const request = prepareProtectedMemoryRouteRequest({ route: "/secure" });
    const forged = {
      kind: "ADMITTED",
      authorityReleased: true,
      admissionAuthority: true,
      executor: "bindGovernedRuntime",
      kernel: "src/kernel.ts",
    };
    const cases = [
      [addSecretAuthority, "APPK_SECRET_AUTHORITY_FORBIDDEN"],
      [bindProtectedMemoryLifecycle, "APPK_PROTECTED_MEMORY_FORBIDDEN"],
      [wireFuseBorderIntoKernel, "APPK_FUSE_BORDER_KERNEL_FORBIDDEN"],
      [installKernelDefaultRegistryCheck, "APPK_CENTRAL_REGISTRY_KERNEL_FORBIDDEN"],
      [bindGovernedRuntime, "APPK_GOVERNED_RUNTIME_WIRE_FORBIDDEN"],
      [installDurableReplayStore, "APPK_DURABLE_REPLAY_FORBIDDEN"],
      [enqueueQueueJob, "APPK_LIVE_QUEUE_FORBIDDEN"],
      [executeStructuredAwait, "APPK_LIVE_STRUCTURED_AWAIT_FORBIDDEN"],
      [emitRuntimeAuditReport, "APPK_LIVE_AUDIT_EMIT_FORBIDDEN"],
    ];
    for (const [fn, code] of cases) {
      for (const input of [request, forged, null, { ok: true }]) {
        const refused = fn(input);
        assert.equal(refused.kind, "REFUSED", code);
        assert.equal(refused.code, code);
        assertNonAuthorizing(refused);
      }
    }
  });

  it("kernel.ts stays unwired and secret-gate stays has/use", () => {
    const kernel = readFileSync(join(ROOT, "src", "kernel.ts"), "utf8");
    assert.equal(kernel.includes("bindGovernedRuntime"), false);
    assert.equal(kernel.includes("addSecretAuthority"), false);
    assert.equal(/executor\s*[?:]/.test(kernel), false);
    assert.match(kernel, /export interface CreateAppKernelOptions/);
    const secrets = readFileSync(join(ROOT, "src", "secret-gate.ts"), "utf8");
    assert.match(secrets, /has\(name: string\): boolean/);
    assert.match(secrets, /use\(name: string, fn: \(value: Uint8Array\) => void\): void/);
    assert.equal(secrets.includes("secretsAuthority"), false);
    const holdPin = readFileSync(join(ROOT, "src", "hold-pin.ts"), "utf8");
    assert.equal(/from ["'].*kernel/.test(holdPin), false);
    assert.equal(/from ["']node:fs["']/.test(holdPin), false);
    assert.equal(/from ["']@galerina\/tower-citizen["']/.test(holdPin), false);
    const barrel = readFileSync(join(ROOT, "src", "index.ts"), "utf8");
    assert.match(barrel, /export \* from "\.\/hold-pin\.js"/);
  });
});

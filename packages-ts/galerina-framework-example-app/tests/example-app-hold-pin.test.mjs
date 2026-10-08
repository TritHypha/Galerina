import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  EXAMPLE_APP_HOLD_PIN_SCHEMA,
  addExampleAppRoute,
  grantExampleAppCapability,
  prepareExampleAppRouteRequest,
  wireCentralPackageRegistry,
  wireFuseBorder,
} from "../dist/hold-pin.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function assertNonAuthorizing(value) {
  assert.equal(value.authorityReleased, false);
  assert.equal(value.admissionAuthority, false);
  assert.equal(Object.isFrozen(value), true);
}

describe("example-app HOLD pin", () => {
  it("prepareExampleAppRouteRequest packages REQUESTED_NOT_ADDED", () => {
    const request = prepareExampleAppRouteRequest({ method: "GET", path: "/health" });
    assert.equal(request.kind, "EXAMPLE_APP_ROUTE_REQUEST");
    if (request.kind !== "EXAMPLE_APP_ROUTE_REQUEST") return;
    assert.equal(request.schema, EXAMPLE_APP_HOLD_PIN_SCHEMA);
    assert.equal(request.status, "REQUESTED_NOT_ADDED");
    assert.equal(request.method, "GET");
    assert.equal(request.path, "/health");
    assert.deepEqual({ ...request.requires }, {
      ownerTemplateWiden: true,
      matchingEffectsAndManifest: true,
    });
    assertNonAuthorizing(request);
  });

  it("prepare refuses authority, malformed input, and the existing golden route", () => {
    const base = { method: "GET", path: "/health" };
    assert.equal(prepareExampleAppRouteRequest({ ...base, admission: true }).code, "EA_HOLD_REQUEST_AUTHORITY_FIELD_PRESENT");
    assert.equal(prepareExampleAppRouteRequest({ ...base, kernel: "src/kernel.ts" }).code, "EA_HOLD_REQUEST_AUTHORITY_FIELD_PRESENT");
    assert.equal(prepareExampleAppRouteRequest({ ...base, grant: ["network"] }).code, "EA_HOLD_REQUEST_AUTHORITY_FIELD_PRESENT");
    assert.equal(prepareExampleAppRouteRequest(null).code, "EA_HOLD_REQUEST_MALFORMED");
    assert.equal(prepareExampleAppRouteRequest({ method: "GET" }).code, "EA_HOLD_REQUEST_MALFORMED");
    assert.equal(prepareExampleAppRouteRequest({ method: "GET", path: "/hello" }).code, "EA_HOLD_REQUEST_MALFORMED");
  });

  it("add / grant / fuse-border / central-registry acts always refuse", () => {
    const request = prepareExampleAppRouteRequest({ method: "POST", path: "/ingest" });
    const forged = {
      kind: "ADMITTED",
      authorityReleased: true,
      admissionAuthority: true,
      capabilities: ["network"],
      kernel: "src/kernel.ts",
    };
    const cases = [
      [addExampleAppRoute, "EA_SECOND_ROUTE_FORBIDDEN"],
      [grantExampleAppCapability, "EA_GOLDEN_GRANT_FORBIDDEN"],
      [wireFuseBorder, "EA_FUSE_BORDER_KERNEL_FORBIDDEN"],
      [wireCentralPackageRegistry, "EA_CENTRAL_PACKAGE_REGISTRY_FORBIDDEN"],
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

  it("host still does not import kernel.ts and does not declare a second route", () => {
    const server = readFileSync(join(ROOT, "host", "server.ts"), "utf8");
    assert.equal(server.includes("src/kernel.ts"), false);
    assert.equal((server.match(/method: "GET"/g) ?? []).length, 1);
    assert.equal((server.match(/handler: "greeting"/g) ?? []).length, 1);
    assert.match(server, /routes: \[route\]/);
    const holdPin = readFileSync(join(ROOT, "host", "hold-pin.ts"), "utf8");
    assert.equal(/from ["'].*kernel/.test(holdPin), false);
    assert.equal(/from ["']node:fs["']/.test(holdPin), false);
  });
});

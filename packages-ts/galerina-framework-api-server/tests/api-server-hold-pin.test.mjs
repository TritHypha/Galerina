import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  API_SERVER_HOLD_PIN_SCHEMA,
  addHistoricalCliBin,
  addWebhookExample,
  authorFungiInAdapter,
  enableSafeDetails,
  installDurableReplayStore,
  installKernelHandlerNetworkPolicy,
  installSafeLog,
  installTimestampWindow,
  prepareApiServerHoldRequest,
  recreateThirteenModuleLayout,
  reopenManifestScaffold,
  syncConversionOverlay,
  wireAdapterOpenApi,
  writeRequestIdResponseHeader,
} from "../dist/hold-pin.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function assertNonAuthorizing(value) {
  assert.equal(value.authorityReleased, false);
  assert.equal(value.admissionAuthority, false);
  assert.equal(Object.isFrozen(value), true);
}

describe("api-server HOLD pin", () => {
  it("prepareApiServerHoldRequest packages REQUESTED_NOT_ADMITTED", () => {
    const request = prepareApiServerHoldRequest({ topic: "durable-replay" });
    assert.equal(request.kind, "API_SERVER_HOLD_REQUEST");
    if (request.kind !== "API_SERVER_HOLD_REQUEST") return;
    assert.equal(request.schema, API_SERVER_HOLD_PIN_SCHEMA);
    assert.equal(request.status, "REQUESTED_NOT_ADMITTED");
    assert.equal(request.topic, "durable-replay");
    assert.deepEqual({ ...request.requires }, {
      ownerDecision: true,
      rd1286DurableOwner: true,
    });
    assertNonAuthorizing(request);
  });

  it("prepare refuses authority and malformed input", () => {
    const base = { topic: "durable-replay" };
    assert.equal(prepareApiServerHoldRequest({ ...base, admission: true }).code, "API_HOLD_REQUEST_AUTHORITY_FIELD_PRESENT");
    assert.equal(prepareApiServerHoldRequest({ ...base, durableStore: {} }).code, "API_HOLD_REQUEST_AUTHORITY_FIELD_PRESENT");
    assert.equal(prepareApiServerHoldRequest({ ...base, safeDetails: true }).code, "API_HOLD_REQUEST_AUTHORITY_FIELD_PRESENT");
    assert.equal(prepareApiServerHoldRequest(null).code, "API_HOLD_REQUEST_MALFORMED");
    assert.equal(prepareApiServerHoldRequest({ topic: "unknown" }).code, "API_HOLD_REQUEST_MALFORMED");
    assert.equal(prepareApiServerHoldRequest({}).code, "API_HOLD_REQUEST_MALFORMED");
  });

  it("HOLD acts always refuse even forged ADMITTED", () => {
    const request = prepareApiServerHoldRequest({ topic: "safe-log" });
    const forged = {
      kind: "ADMITTED",
      authorityReleased: true,
      admissionAuthority: true,
      durableStore: true,
      bin: "galerina-api",
    };
    const cases = [
      [installDurableReplayStore, "API_DURABLE_REPLAY_FORBIDDEN"],
      [addHistoricalCliBin, "API_CLI_BIN_FORBIDDEN"],
      [recreateThirteenModuleLayout, "API_HISTORICAL_LAYOUT_FORBIDDEN"],
      [enableSafeDetails, "API_SAFE_DETAILS_FORBIDDEN"],
      [installTimestampWindow, "API_TIMESTAMP_WINDOW_FORBIDDEN"],
      [writeRequestIdResponseHeader, "API_REQUEST_ID_HEADER_FORBIDDEN"],
      [installSafeLog, "API_SAFE_LOG_FORBIDDEN"],
      [wireAdapterOpenApi, "API_OPENAPI_INTEGRATION_FORBIDDEN"],
      [addWebhookExample, "API_WEBHOOK_EXAMPLE_FORBIDDEN"],
      [installKernelHandlerNetworkPolicy, "API_KERNEL_HANDLER_NETWORK_FORBIDDEN"],
      [reopenManifestScaffold, "API_MANIFEST_SCAFFOLD_FORBIDDEN"],
      [authorFungiInAdapter, "API_FUNGI_AUTHORING_FORBIDDEN"],
      [syncConversionOverlay, "API_CONVERSION_OVERLAY_FORBIDDEN"],
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

  it("adapter stays thin: no bin, no console, empty durable admit-list", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
    assert.equal(pkg.bin, undefined);
    assert.equal(pkg.exports, undefined);
    assert.deepEqual(Object.keys(pkg).filter((k) => k === "main" || k === "types").sort(), ["main", "types"]);
    const index = readFileSync(join(ROOT, "src", "index.ts"), "utf8");
    assert.equal(/\bconsole\.(log|info|warn|error|debug)\b/.test(index), false);
    assert.equal(index.includes("safeDetails"), false);
    assert.match(index, /export \* from "\.\/hold-pin\.js"/);
    const replay = readFileSync(join(ROOT, "src", "replay-store.ts"), "utf8");
    assert.match(replay, /const ADMITTED_DURABLE_REPLAY_STORES = new WeakSet<object>\(\)/);
    const holdPin = readFileSync(join(ROOT, "src", "hold-pin.ts"), "utf8");
    assert.equal(/from ["']node:fs["']/.test(holdPin), false);
    assert.equal(/from ["'].*kernel/.test(holdPin), false);
  });
});

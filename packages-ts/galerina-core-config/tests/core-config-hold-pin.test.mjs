import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  CORE_CONFIG_HOLD_PIN_SCHEMA,
  admitFileSecretStoreRuntimeInjected,
  admitUnderscoreSecretCategories,
  prepareCoreConfigHoldRequest,
  splitInternalConfigDirs,
} from "../dist/hold-pin.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function assertNonAuthorizing(value) {
  assert.equal(value.authorityReleased, false);
  assert.equal(value.admissionAuthority, false);
  assert.equal(Object.isFrozen(value), true);
}

describe("core-config HOLD pin", () => {
  it("prepareCoreConfigHoldRequest packages REQUESTED_NOT_ADMITTED", () => {
    const request = prepareCoreConfigHoldRequest({ topic: "internal-dir-split" });
    assert.equal(request.kind, "CORE_CONFIG_HOLD_REQUEST");
    if (request.kind !== "CORE_CONFIG_HOLD_REQUEST") return;
    assert.equal(request.schema, CORE_CONFIG_HOLD_PIN_SCHEMA);
    assert.equal(request.status, "REQUESTED_NOT_ADMITTED");
    assert.equal(request.topic, "internal-dir-split");
    assert.deepEqual({ ...request.requires }, {
      ownerDecision: true,
      rd1285SplitReceipt: true,
    });
    assertNonAuthorizing(request);
  });

  it("prepare refuses authority and malformed input", () => {
    const base = { topic: "secret-source-file-store" };
    assert.equal(prepareCoreConfigHoldRequest({ ...base, admission: true }).code, "CONFIG_HOLD_REQUEST_AUTHORITY_FIELD_PRESENT");
    assert.equal(prepareCoreConfigHoldRequest({ ...base, secretStore: true }).code, "CONFIG_HOLD_REQUEST_AUTHORITY_FIELD_PRESENT");
    assert.equal(prepareCoreConfigHoldRequest({ ...base, runtimeInjected: true }).code, "CONFIG_HOLD_REQUEST_AUTHORITY_FIELD_PRESENT");
    assert.equal(prepareCoreConfigHoldRequest(null).code, "CONFIG_HOLD_REQUEST_MALFORMED");
    assert.equal(prepareCoreConfigHoldRequest({ topic: "unknown" }).code, "CONFIG_HOLD_REQUEST_MALFORMED");
    assert.equal(prepareCoreConfigHoldRequest({}).code, "CONFIG_HOLD_REQUEST_MALFORMED");
  });

  it("HOLD acts always refuse even forged ADMITTED", () => {
    const request = prepareCoreConfigHoldRequest({ topic: "underscore-categories" });
    const forged = {
      kind: "ADMITTED",
      authorityReleased: true,
      admissionAuthority: true,
      secretStore: "x",
      runtimeInjected: true,
    };
    const cases = [
      [splitInternalConfigDirs, "CONFIG_INTERNAL_DIR_SPLIT_FORBIDDEN"],
      [admitFileSecretStoreRuntimeInjected, "CONFIG_UNADMITTED_SECRET_SOURCE_FORBIDDEN"],
      [admitUnderscoreSecretCategories, "CONFIG_UNDERSCORE_CATEGORY_FORBIDDEN"],
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

  it("v2 freeze stays index.ts-only: four secret sources, hyphenated categories, no split dirs", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
    assert.equal(pkg.bin, undefined);
    const index = readFileSync(join(ROOT, "src", "index.ts"), "utf8");
    assert.match(index, /export \* from "\.\/hold-pin\.js"/);
    assert.match(
      index,
      /export const SECRET_CONFIG_SOURCE_KINDS: readonly SecretConfigSourceKind\[\] = \[\r?\n  "env",\r?\n  "vault",\r?\n  "kms",\r?\n  "runtime",\r?\n\];/,
    );
    assert.match(index, /export type SecretCategory =\r?\n  \| "api-key"/);
    assert.equal(/secretStore/.test(index), false);
    assert.equal(/runtimeInjected/.test(index), false);
    assert.match(index, /FUNGI-CONFIG-028/);
    assert.match(index, /FUNGI-CONFIG-029/);
    assert.match(index, /FUNGI-CONFIG-030/);
    assert.equal(/FUNGI-CONFIG-031/.test(index), false);
    const holdPin = readFileSync(join(ROOT, "src", "hold-pin.ts"), "utf8");
    assert.equal(/from ["']node:/.test(holdPin), false);
    assert.equal(/FUNGI-CONFIG-031/.test(holdPin), false);
    assert.equal(existsSync(join(ROOT, "src", "environment")), false);
    assert.equal(existsSync(join(ROOT, "src", "secrets")), false);
    assert.equal(existsSync(join(ROOT, "src", "loaders")), false);
    assert.equal(existsSync(join(ROOT, "src", "types")), false);
  });
});

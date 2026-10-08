import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  DOCS_HOLD_PIN_SCHEMA,
  addDocsOpenApiCli,
  closeAuditedHoldWithoutOwner,
  emitOAuthOidcSchemes,
  emitOpenApi31WebhookObjects,
  mapOptionResultDecimalSchemas,
  prepareDocsHoldRequest,
} from "../dist/hold-pin.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function assertNonAuthorizing(value) {
  assert.equal(value.authorityReleased, false);
  assert.equal(value.admissionAuthority, false);
  assert.equal(Object.isFrozen(value), true);
}

describe("docs HOLD pin", () => {
  it("prepareDocsHoldRequest packages REQUESTED_NOT_ADMITTED", () => {
    const request = prepareDocsHoldRequest({ topic: "contract-mapping" });
    assert.equal(request.kind, "DOCS_HOLD_REQUEST");
    if (request.kind !== "DOCS_HOLD_REQUEST") return;
    assert.equal(request.schema, DOCS_HOLD_PIN_SCHEMA);
    assert.equal(request.status, "REQUESTED_NOT_ADMITTED");
    assert.equal(request.topic, "contract-mapping");
    assert.deepEqual({ ...request.requires }, {
      ownerDecision: true,
      compilerContractMapping: true,
      kernelSchemeAdmission: true,
      versionedRouteTable: true,
      webhookRouteMapping: true,
    });
    assertNonAuthorizing(request);
  });

  it("prepare refuses authority and malformed input", () => {
    const base = { topic: "oauth-oidc" };
    assert.equal(prepareDocsHoldRequest({ ...base, admission: true }).code, "DOCS_HOLD_REQUEST_AUTHORITY_FIELD_PRESENT");
    assert.equal(prepareDocsHoldRequest({ ...base, bin: "galerina" }).code, "DOCS_HOLD_REQUEST_AUTHORITY_FIELD_PRESENT");
    assert.equal(prepareDocsHoldRequest({ ...base, webhooks: {} }).code, "DOCS_HOLD_REQUEST_AUTHORITY_FIELD_PRESENT");
    assert.equal(prepareDocsHoldRequest({ ...base, oauth2: true }).code, "DOCS_HOLD_REQUEST_AUTHORITY_FIELD_PRESENT");
    assert.equal(prepareDocsHoldRequest(null).code, "DOCS_HOLD_REQUEST_MALFORMED");
    assert.equal(prepareDocsHoldRequest({ topic: "unknown" }).code, "DOCS_HOLD_REQUEST_MALFORMED");
    assert.equal(prepareDocsHoldRequest({}).code, "DOCS_HOLD_REQUEST_MALFORMED");
  });

  it("HOLD acts always refuse even forged ADMITTED", () => {
    const request = prepareDocsHoldRequest({ topic: "openapi-cli" });
    const forged = {
      kind: "ADMITTED",
      authorityReleased: true,
      admissionAuthority: true,
      bin: "galerina docs openapi",
      webhooks: { "/hook": {} },
      oauth2: true,
    };
    const cases = [
      [mapOptionResultDecimalSchemas, "DOCS_CONTRACT_MAPPING_FORBIDDEN"],
      [closeAuditedHoldWithoutOwner, "DOCS_OWNER_CLOSE_FORBIDDEN"],
      [emitOAuthOidcSchemes, "DOCS_OAUTH_SCHEME_FORBIDDEN"],
      [addDocsOpenApiCli, "DOCS_OPENAPI_CLI_FORBIDDEN"],
      [emitOpenApi31WebhookObjects, "DOCS_WEBHOOK_OBJECTS_FORBIDDEN"],
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

  it("generator stays mapping-free: no bin, paths only, no webhooks/oauth2", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
    assert.equal(pkg.bin, undefined);
    assert.equal(pkg.exports, undefined);
    assert.deepEqual(Object.keys(pkg).filter((k) => k === "main" || k === "types").sort(), ["main", "types"]);
    const types = readFileSync(join(ROOT, "src", "types.ts"), "utf8");
    assert.match(types, /readonly paths: Readonly<Record<string, PathItemObject>>;/);
    assert.equal(/readonly webhooks\b/.test(types), false);
    assert.match(types, /export type SecuritySchemeObject = HttpSecurityScheme \| ApiKeySecurityScheme;/);
    assert.equal(/type:\s*"oauth2"/.test(types), false);
    assert.equal(/type:\s*"openIdConnect"/.test(types), false);
    const index = readFileSync(join(ROOT, "src", "index.ts"), "utf8");
    assert.match(index, /export \* from "\.\/hold-pin\.js"/);
    const holdPin = readFileSync(join(ROOT, "src", "hold-pin.ts"), "utf8");
    assert.equal(/from ["']node:fs["']/.test(holdPin), false);
    assert.equal(/from ["'].*kernel/.test(holdPin), false);
    assert.equal(/from ["']node:/.test(holdPin), false);
  });
});

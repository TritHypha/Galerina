import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  FUNGI_APPK_APB_001,
  FUNGI_APPK_APB_002,
  FUNGI_APPK_APB_003,
  FUNGI_APPK_APB_004,
  AUTH_PROVIDER_BOUNDARY_SCHEMA,
  createAuthProviderBoundary,
  readAuthProviderBoundary,
} from "../dist/auth-provider-boundary.js";

function bearerProvider(overrides = {}) {
  return {
    id: "primary_bearer",
    kind: "bearer",
    credentialLocation: "authorizationHeader",
    credentialHeader: "Authorization",
    tokenPrefix: "Bearer",
    audience: "",
    issuer: "",
    allowedAlgorithms: [],
    maxClockSkewSeconds: 0,
    requireProofOfPossession: false,
    emitPrincipalId: true,
    emitScopes: true,
    allowHeaderPresenceFallback: false,
    ...overrides,
  };
}

function jwtProvider(overrides = {}) {
  return {
    id: "primary_jwt",
    kind: "jwt",
    credentialLocation: "authorizationHeader",
    credentialHeader: "Authorization",
    tokenPrefix: "Bearer",
    audience: "https://api.example/orders",
    issuer: "https://issuer.example/",
    allowedAlgorithms: ["ES256", "RS256"],
    maxClockSkewSeconds: 60,
    requireProofOfPossession: false,
    emitPrincipalId: true,
    emitScopes: true,
    allowHeaderPresenceFallback: false,
    ...overrides,
  };
}

function baseBoundary(overrides = {}) {
  return {
    schema: AUTH_PROVIDER_BOUNDARY_SCHEMA,
    name: "OrdersAuth",
    providers: [bearerProvider()],
    ...overrides,
  };
}

describe("auth provider boundary contract", () => {
  it("admits a closed bearer + jwt boundary", () => {
    const result = readAuthProviderBoundary(
      baseBoundary({
        providers: [bearerProvider(), jwtProvider({ id: "secondary_jwt" })],
      }),
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.value.schema, AUTH_PROVIDER_BOUNDARY_SCHEMA);
    assert.equal(result.value.name, "OrdersAuth");
    assert.equal(result.value.providers.length, 2);
    assert.equal(result.value.providers[0]?.kind, "bearer");
    assert.equal(result.value.providers[1]?.kind, "jwt");
    assert.equal(result.value.diagnostics.length, 0);
  });

  it("refuses getters, symbols, and unknown keys without echo", () => {
    const hostile = baseBoundary();
    Object.defineProperty(hostile, "secret", {
      get() {
        throw new Error("getter-ran");
      },
      enumerable: true,
    });
    const fromGetter = createAuthProviderBoundary(hostile);
    assert.equal(fromGetter.diagnostics[0]?.code, FUNGI_APPK_APB_001);
    assert.equal(fromGetter.diagnostics.some((d) => /getter|secret/i.test(d.message)), false);

    const withSymbol = { ...baseBoundary(), [Symbol("x")]: 1 };
    const fromSymbol = createAuthProviderBoundary(withSymbol);
    assert.equal(fromSymbol.diagnostics[0]?.code, FUNGI_APPK_APB_001);

    const unknownKey = { ...baseBoundary(), extra: "nope" };
    const fromUnknown = createAuthProviderBoundary(unknownKey);
    assert.equal(fromUnknown.diagnostics[0]?.code, FUNGI_APPK_APB_001);
    assert.equal(fromUnknown.diagnostics.some((d) => d.message.includes("extra")), false);
  });

  it("refuses NaN / none algorithm / header-presence fallback without echo", () => {
    const nan = createAuthProviderBoundary(
      baseBoundary({ providers: [bearerProvider({ maxClockSkewSeconds: Number.NaN })] }),
    );
    assert.equal(nan.diagnostics.some((d) => d.code === FUNGI_APPK_APB_002), true);
    assert.equal(nan.diagnostics.some((d) => /NaN/i.test(d.message)), false);

    const noneAlg = createAuthProviderBoundary(
      baseBoundary({
        providers: [jwtProvider({ allowedAlgorithms: ["none"] })],
      }),
    );
    assert.equal(noneAlg.diagnostics.some((d) => d.code === FUNGI_APPK_APB_002), true);
    assert.equal(noneAlg.diagnostics.some((d) => d.message.includes("none")), false);

    const hs = createAuthProviderBoundary(
      baseBoundary({
        providers: [jwtProvider({ allowedAlgorithms: ["HS256"] })],
      }),
    );
    assert.equal(hs.diagnostics.some((d) => d.code === FUNGI_APPK_APB_002), true);
    assert.equal(hs.diagnostics.some((d) => d.message.includes("HS256")), false);

    const headerFallback = createAuthProviderBoundary(
      baseBoundary({
        providers: [bearerProvider({ allowHeaderPresenceFallback: true })],
      }),
    );
    assert.equal(headerFallback.diagnostics.some((d) => d.code === FUNGI_APPK_APB_002), true);
  });

  it("refuses empty providers, duplicate ids, and kind consistency violations", () => {
    const empty = createAuthProviderBoundary(baseBoundary({ providers: [] }));
    assert.equal(empty.diagnostics.some((d) => d.code === FUNGI_APPK_APB_003), true);

    const dup = createAuthProviderBoundary(
      baseBoundary({
        providers: [bearerProvider(), bearerProvider()],
      }),
    );
    assert.equal(dup.diagnostics.some((d) => d.code === FUNGI_APPK_APB_003), true);

    const jwtNoIssuer = createAuthProviderBoundary(
      baseBoundary({
        providers: [jwtProvider({ issuer: "" })],
      }),
    );
    assert.equal(jwtNoIssuer.diagnostics.some((d) => d.code === FUNGI_APPK_APB_003), true);

    const dpopNoPop = createAuthProviderBoundary(
      baseBoundary({
        providers: [
          jwtProvider({
            id: "dpop_a",
            kind: "dpop",
            requireProofOfPossession: false,
            allowedAlgorithms: ["ES256"],
          }),
        ],
      }),
    );
    assert.equal(dpopNoPop.diagnostics.some((d) => d.code === FUNGI_APPK_APB_003), true);
  });

  it("admits mTLS with client certificate location and empty header", () => {
    const mtls = readAuthProviderBoundary(
      baseBoundary({
        providers: [
          {
            id: "mtls_edge",
            kind: "mtls",
            credentialLocation: "clientCertificate",
            credentialHeader: "",
            tokenPrefix: "",
            audience: "",
            issuer: "",
            allowedAlgorithms: [],
            maxClockSkewSeconds: 0,
            requireProofOfPossession: false,
            emitPrincipalId: true,
            emitScopes: false,
            allowHeaderPresenceFallback: false,
          },
        ],
      }),
    );
    assert.equal(mtls.ok, true);
    if (!mtls.ok) return;
    assert.equal(mtls.value.providers[0]?.kind, "mtls");
    assert.equal(mtls.value.providers[0]?.credentialLocation, "clientCertificate");
  });

  it("never throws on flipping proxies", () => {
    let flips = 0;
    const proxy = new Proxy(baseBoundary(), {
      get(target, prop, receiver) {
        flips += 1;
        if (flips > 3 && prop === "providers") return null;
        return Reflect.get(target, prop, receiver);
      },
      getOwnPropertyDescriptor(target, prop) {
        flips += 1;
        return Reflect.getOwnPropertyDescriptor(target, prop);
      },
      ownKeys(target) {
        flips += 1;
        return Reflect.ownKeys(target);
      },
    });
    assert.doesNotThrow(() => createAuthProviderBoundary(proxy));
  });
});

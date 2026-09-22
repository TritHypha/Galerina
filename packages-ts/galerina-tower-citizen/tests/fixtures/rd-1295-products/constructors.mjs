import { createCertifiedTower, createDevTower } from '@galerina/tower-citizen/inference';
// Deliberately non-authorizing construction fixtures; no signing or key custody.
export function certifiedFixture(overrides = {}) {
  return createCertifiedTower({
    auditInMemory: true,
    auditEgress: { push() {}, flush() {} },
    attestation: { requireSigned: true, publicKeyPem: 'untrusted-fixture', mlDsaPublicKey: new Uint8Array([1]) },
    governance: {approvedModels:['m'], maxNewTokens:8, maxTokenCost:'GBP0.01', denyHostNativeFallback:true},
    ...overrides,
  });
}
export function devFixture(overrides = {}) {
  return createDevTower({auditInMemory:true, ...overrides});
}

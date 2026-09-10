import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LOCAL_INVENTORY_POLICY_SCHEMA,
  LOCAL_SOURCE_SNAPSHOT_SCHEMA,
  sha256Canonical,
} from '../lib/logic-aig-source-origin/contract.mjs';
import {
  LOCAL_HOST_OBSERVATION_SCHEMA,
  LOCAL_MYCO_RECEIPT_SCHEMA,
  LOCAL_HYPHA_RECEIPT_SCHEMA,
  buildLocalSourceOriginSubject,
  buildLocalHostObservation,
  buildVerifiedLocalDiscoveryReceipt,
  validateLocalSourceOriginSubject,
} from '../lib/logic-aig-source-origin/local-subject.mjs';

const REPOSITORY_SCHEMA = 'galerina.logic-aig-repository-identity.v1';
const repository = {
  schema: REPOSITORY_SCHEMA,
  ownerNamespace: 'TritHypha',
  repositoryName: 'Galerina',
  canonicalIdentity: 'TritHypha/Galerina',
  authorizing: false,
};
repository.identityDigest = sha256Canonical(REPOSITORY_SCHEMA, repository);

const policyBody = {
  schema: LOCAL_INVENTORY_POLICY_SCHEMA,
  profile: 'FIXTURE_ONLY',
  entries: [
    { path: 'package.json', role: 'RESOLUTION' },
    { path: 'src/main.mjs', role: 'SOURCE' },
  ],
  exclusions: ['.git'],
  limits: {
    maxDepth: 8,
    maxEntries: 32,
    maxFileBytes: 1024,
    maxMillis: 5000,
    maxResolutionBytes: 1024,
    maxResolutionFiles: 8,
    maxSourceBytes: 4096,
    maxSourceFiles: 16,
    maxTotalBytes: 5120,
  },
  authorizing: false,
};
const policy = { ...policyBody, policyDigest: sha256Canonical(LOCAL_INVENTORY_POLICY_SCHEMA, policyBody) };

const snapshotBody = {
  schema: LOCAL_SOURCE_SNAPSHOT_SCHEMA,
  repositoryIdentityDigest: repository.identityDigest,
  inventoryPolicyDigest: policy.policyDigest,
  entries: [
    { path: 'package.json', role: 'RESOLUTION', byteLength: 9, rawSha256: 'a'.repeat(64) },
    { path: 'src/main.mjs', role: 'SOURCE', byteLength: 18, rawSha256: 'b'.repeat(64) },
  ],
  counts: {
    entries: 2,
    sourceFiles: 1,
    sourceBytes: 18,
    resolutionFiles: 1,
    resolutionBytes: 9,
    totalBytes: 27,
  },
  authorizing: false,
  authentication: 'NONE',
  executionBoundary: 'COOPERATIVE_LOCAL_SAME_USER',
  atomicSnapshot: false,
  hostileWriterResistance: false,
  fixtureOnly: true,
};
const snapshot = { ...snapshotBody, snapshotDigest: sha256Canonical(LOCAL_SOURCE_SNAPSHOT_SCHEMA, snapshotBody) };

function makeEvidence() {
  const host = buildLocalHostObservation({
    allowFixtureOnly: true,
    platform: 'win32',
    arch: 'x64',
    runtime: 'node-v24.18.0',
    snapshotDigest: snapshot.snapshotDigest,
    inventoryPolicyDigest: policy.policyDigest,
    fixtureOnly: true,
  });
  const myco = buildVerifiedLocalDiscoveryReceipt({
    allowFixtureOnly: true,
    kind: 'MYCO',
    snapshotDigest: snapshot.snapshotDigest,
    inventoryPolicyDigest: policy.policyDigest,
    fixtureOnly: true,
  });
  const hypha = buildVerifiedLocalDiscoveryReceipt({
    allowFixtureOnly: true,
    kind: 'HYPHA',
    snapshotDigest: snapshot.snapshotDigest,
    inventoryPolicyDigest: policy.policyDigest,
    fixtureOnly: true,
  });
  return { host, myco, hypha };
}

function makeProductionEvidence() {
  const productionPolicyBody = { ...policyBody, profile: 'LOCAL_PRODUCTION_V1' };
  const productionPolicy = {
    ...productionPolicyBody,
    policyDigest: sha256Canonical(LOCAL_INVENTORY_POLICY_SCHEMA, productionPolicyBody),
  };
  const productionSnapshotBody = {
    ...snapshotBody,
    inventoryPolicyDigest: productionPolicy.policyDigest,
    fixtureOnly: false,
  };
  const productionSnapshot = {
    ...productionSnapshotBody,
    snapshotDigest: sha256Canonical(LOCAL_SOURCE_SNAPSHOT_SCHEMA, productionSnapshotBody),
  };
  const host = buildLocalHostObservation({
    platform: 'win32',
    arch: 'x64',
    runtime: 'node-v24.18.0',
    snapshotDigest: productionSnapshot.snapshotDigest,
    inventoryPolicyDigest: productionPolicy.policyDigest,
    fixtureOnly: false,
  });
  const myco = buildVerifiedLocalDiscoveryReceipt({
    kind: 'MYCO',
    snapshotDigest: productionSnapshot.snapshotDigest,
    inventoryPolicyDigest: productionPolicy.policyDigest,
    fixtureOnly: false,
  });
  const hypha = buildVerifiedLocalDiscoveryReceipt({
    kind: 'HYPHA',
    snapshotDigest: productionSnapshot.snapshotDigest,
    inventoryPolicyDigest: productionPolicy.policyDigest,
    fixtureOnly: false,
  });
  return { policy: productionPolicy, snapshot: productionSnapshot, host, myco, hypha };
}

test('local subject binds repository, policy, snapshot, host and discovery receipts', () => {
  const evidence = makeEvidence();
  const subject = buildLocalSourceOriginSubject({ allowFixtureOnly: true, repository, policy, snapshot, ...evidence });
  assert.equal(subject.authorizing, false);
  assert.equal(subject.authentication, 'NONE');
  assert.equal(subject.executionBoundary, 'COOPERATIVE_LOCAL_SAME_USER');
  assert.equal(subject.fixtureOnly, true);
  assert.equal(subject.repositoryIdentityDigest, repository.identityDigest);
  assert.equal(subject.inventoryPolicyDigest, policy.policyDigest);
  assert.equal(subject.snapshotDigest, snapshot.snapshotDigest);
  assert.equal(subject.hostObservationDigest, evidence.host.observationDigest);
  assert.equal(subject.mycoReceiptDigest, evidence.myco.receiptDigest);
  assert.equal(subject.hyphaReceiptDigest, evidence.hypha.receiptDigest);
  assert.equal(subject.subjectDigest, sha256Canonical(subject.schema, Object.fromEntries(
    Object.entries(subject).filter(([key]) => key !== 'subjectDigest'),
  )));
  assert.deepEqual(
    validateLocalSourceOriginSubject(subject, { allowFixtureOnly: true, repository, policy, snapshot, ...evidence }),
    subject,
  );
});

test('production-profile local subject remains non-authorizing without fixture admission', () => {
  const evidence = makeProductionEvidence();
  const subject = buildLocalSourceOriginSubject({
    repository,
    policy: evidence.policy,
    snapshot: evidence.snapshot,
    host: evidence.host,
    myco: evidence.myco,
    hypha: evidence.hypha,
  });
  assert.equal(subject.authorizing, false);
  assert.equal(subject.authentication, 'NONE');
  assert.equal(subject.executionBoundary, 'COOPERATIVE_LOCAL_SAME_USER');
  assert.equal(subject.fixtureOnly, false);
  assert.deepEqual(
    validateLocalSourceOriginSubject(subject, {
      repository,
      policy: evidence.policy,
      snapshot: evidence.snapshot,
      host: evidence.host,
      myco: evidence.myco,
      hypha: evidence.hypha,
    }),
    subject,
  );
});

test('local subject refuses missing discovery, cross-subject drift, and Git authority fields', () => {
  const evidence = makeEvidence();
  const subject = buildLocalSourceOriginSubject({ allowFixtureOnly: true, repository, policy, snapshot, ...evidence });
  assert.throws(
    () => validateLocalSourceOriginSubject(subject, { allowFixtureOnly: true, repository, policy, snapshot, host: evidence.host, myco: null, hypha: evidence.hypha }),
    (error) => error?.code === 'SOURCE_ORIGIN_LOCAL_EVIDENCE',
  );
  const drift = { ...subject, snapshotDigest: 'c'.repeat(64) };
  assert.throws(
    () => validateLocalSourceOriginSubject(drift, { allowFixtureOnly: true, repository, policy, snapshot, ...evidence }),
    (error) => error?.code === 'SOURCE_ORIGIN_LOCAL_DIGEST',
  );
  assert.throws(
    () => validateLocalSourceOriginSubject({ ...subject, gitOid: 'a'.repeat(40) }, { allowFixtureOnly: true, repository, policy, snapshot, ...evidence }),
    (error) => error?.code === 'SOURCE_ORIGIN_LOCAL_SCHEMA',
  );
});

test('fixture local subject requires explicit fixture admission', () => {
  const evidence = makeEvidence();
  assert.throws(
    () => buildLocalSourceOriginSubject({ repository, policy, snapshot, ...evidence }),
    (error) => error?.code === 'SOURCE_ORIGIN_LOCAL_FIXTURE',
  );
  const subject = buildLocalSourceOriginSubject({ allowFixtureOnly: true, repository, policy, snapshot, ...evidence });
  assert.throws(
    () => validateLocalSourceOriginSubject(subject, { repository, policy, snapshot, ...evidence }),
    (error) => error?.code === 'SOURCE_ORIGIN_LOCAL_FIXTURE',
  );
});

test('local subject refuses proxy and accessor-shaped inputs before evidence effects', () => {
  const evidence = makeEvidence();
  const subject = buildLocalSourceOriginSubject({ allowFixtureOnly: true, repository, policy, snapshot, ...evidence });
  assert.throws(
    () => validateLocalSourceOriginSubject(new Proxy(subject, {}), { allowFixtureOnly: true, repository, policy, snapshot, ...evidence }),
    (error) => error?.code === 'SOURCE_ORIGIN_LOCAL_SCHEMA',
  );
  const altered = { ...subject };
  Object.defineProperty(altered, 'subjectDigest', {
    enumerable: true,
    configurable: true,
    get() { throw new Error('unexpected subject accessor'); },
  });
  assert.throws(
    () => validateLocalSourceOriginSubject(altered, { allowFixtureOnly: true, repository, policy, snapshot, ...evidence }),
    (error) => error?.code === 'SOURCE_ORIGIN_LOCAL_SCHEMA',
  );
  assert.throws(
    () => validateLocalSourceOriginSubject(subject, new Proxy({ allowFixtureOnly: true, repository, policy, snapshot, ...evidence }, {})),
    (error) => error?.code === 'SOURCE_ORIGIN_LOCAL_SCHEMA',
  );
  assert.throws(
    () => validateLocalSourceOriginSubject(subject, { allowFixtureOnly: true, repository, policy, snapshot, host: { ...evidence.host, schema: 'wrong' }, myco: evidence.myco, hypha: evidence.hypha }),
    (error) => error?.code === 'SOURCE_ORIGIN_LOCAL_EVIDENCE',
  );
  const mismatchedMycoBody = { ...evidence.myco, fixtureOnly: false };
  const mismatchedMyco = { ...mismatchedMycoBody, receiptDigest: sha256Canonical(LOCAL_MYCO_RECEIPT_SCHEMA, Object.fromEntries(
    Object.entries(mismatchedMycoBody).filter(([key]) => key !== 'receiptDigest'),
  )) };
  assert.throws(
    () => validateLocalSourceOriginSubject(subject, { allowFixtureOnly: true, repository, policy, snapshot, host: evidence.host, myco: mismatchedMyco, hypha: evidence.hypha }),
    (error) => error?.code === 'SOURCE_ORIGIN_LOCAL_FIXTURE',
  );
});

test('local evidence builders are explicit and self-sealing', () => {
  assert.throws(
    () => buildLocalHostObservation({
      platform: 'win32',
      arch: 'x64',
      runtime: 'node-v24.18.0',
      snapshotDigest: snapshot.snapshotDigest,
      inventoryPolicyDigest: policy.policyDigest,
      fixtureOnly: true,
    }),
    (error) => error?.code === 'SOURCE_ORIGIN_LOCAL_FIXTURE',
  );
  const host = buildLocalHostObservation({
    allowFixtureOnly: true,
    platform: 'win32',
    arch: 'x64',
    runtime: 'node-v24.18.0',
    snapshotDigest: snapshot.snapshotDigest,
    inventoryPolicyDigest: policy.policyDigest,
    fixtureOnly: true,
  });
  assert.equal(host.schema, LOCAL_HOST_OBSERVATION_SCHEMA);
  assert.equal(host.observationDigest, sha256Canonical(host.schema, Object.fromEntries(
    Object.entries(host).filter(([key]) => key !== 'observationDigest'),
  )));
  assert.throws(
    () => buildVerifiedLocalDiscoveryReceipt({
      allowFixtureOnly: true,
      kind: 'OTHER',
      snapshotDigest: snapshot.snapshotDigest,
      inventoryPolicyDigest: policy.policyDigest,
      fixtureOnly: true,
    }),
    (error) => error?.code === 'SOURCE_ORIGIN_LOCAL_SCHEMA',
  );
  let proxyEffects = 0;
  const trappingOptions = new Proxy({
    platform: 'win32',
    arch: 'x64',
    runtime: 'node-v24.18.0',
    snapshotDigest: snapshot.snapshotDigest,
    inventoryPolicyDigest: policy.policyDigest,
    fixtureOnly: true,
  }, {
    getOwnPropertyDescriptor() { proxyEffects += 1; throw new Error('unexpected option descriptor'); },
    get() { proxyEffects += 1; throw new Error('unexpected option read'); },
    ownKeys() { proxyEffects += 1; throw new Error('unexpected option keys'); },
  });
  assert.throws(
    () => buildLocalHostObservation(trappingOptions),
    (error) => error?.code === 'SOURCE_ORIGIN_LOCAL_SCHEMA',
  );
  assert.equal(proxyEffects, 0);
});

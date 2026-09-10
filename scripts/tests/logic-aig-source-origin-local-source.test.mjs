import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  link,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import test from 'node:test';

import {
  canonicalJsonText,
  parseCanonicalJsonBytes,
  sha256Canonical,
  validateLocalInventoryPolicy,
  validateLocalSourceSnapshot,
  validateRepositoryIdentity,
} from '../lib/logic-aig-source-origin/contract.mjs';
import {
  buildLocalHostObservation,
  buildVerifiedLocalDiscoveryReceipt,
} from '../lib/logic-aig-source-origin/local-subject.mjs';

const MODULE_URL = new URL('../lib/logic-aig-source-origin/local-source.mjs', import.meta.url);
let LOCAL_SOURCE;
try {
  LOCAL_SOURCE = await import(MODULE_URL);
} catch (error) {
  if (error?.code !== 'ERR_MODULE_NOT_FOUND') throw error;
  LOCAL_SOURCE = Object.freeze({});
}

const TEMP_PREFIX = 'galerina-local-source-fixture-';
const POLICY_SCHEMA = 'galerina.logic-aig-local-inventory-policy.v1';
const SNAPSHOT_SCHEMA = 'galerina.logic-aig-local-source-snapshot.v1';
const DEFAULT_ENTRIES = Object.freeze([
  Object.freeze({ path: 'generated/schema.json', role: 'GENERATED_INPUT' }),
  Object.freeze({ path: 'package.json', role: 'RESOLUTION' }),
  Object.freeze({ path: 'src/a.mjs', role: 'SOURCE' }),
]);
const DEFAULT_LIMITS = Object.freeze({
  maxDepth: 8,
  maxEntries: 32,
  maxFileBytes: 1_024,
  maxMillis: 5_000,
  maxResolutionBytes: 1_024,
  maxResolutionFiles: 8,
  maxSourceBytes: 4_096,
  maxSourceFiles: 16,
  maxTotalBytes: 5_120,
});

function api(name) {
  assert.equal(typeof LOCAL_SOURCE[name], 'function', `${name} should be exported`);
  return LOCAL_SOURCE[name];
}

function bytesOf(value) {
  return Buffer.from(value, 'utf8');
}

function repositoryIdentityBytes() {
  const body = {
    schema: 'galerina.logic-aig-repository-identity.v1',
    ownerNamespace: 'TritHypha',
    repositoryName: 'Galerina',
    canonicalIdentity: 'TritHypha/Galerina',
    authorizing: false,
  };
  return bytesOf(canonicalJsonText({
    ...body,
    identityDigest: sha256Canonical(body.schema, body),
  }));
}

function inventoryPolicyBytes({
  entries = DEFAULT_ENTRIES,
  exclusions = ['.git', 'tmp'],
  limits = DEFAULT_LIMITS,
  profile = 'FIXTURE_ONLY',
  extraBody = {},
} = {}) {
  const body = {
    schema: POLICY_SCHEMA,
    profile,
    entries,
    exclusions,
    limits,
    authorizing: false,
    ...extraBody,
  };
  return bytesOf(canonicalJsonText({
    ...body,
    policyDigest: sha256Canonical(body.schema, body),
  }));
}

async function withOwnedFixture(run) {
  const base = await mkdtemp(join(tmpdir(), TEMP_PREFIX));
  const ownedBase = resolve(base);
  const expectedParent = resolve(tmpdir());
  assert.equal(dirname(ownedBase), expectedParent);
  assert.match(basename(ownedBase), /^galerina-local-source-fixture-/u);
  const rootPath = join(ownedBase, 'repository');
  const externalPath = join(ownedBase, 'external');
  await mkdir(rootPath);
  await mkdir(externalPath);
  try {
    return await run({ base: ownedBase, externalPath, rootPath });
  } finally {
    assert.equal(dirname(ownedBase), expectedParent);
    assert.match(basename(ownedBase), /^galerina-local-source-fixture-/u);
    await rm(ownedBase, { force: true, recursive: true });
  }
}

async function populateFixture(rootPath) {
  await mkdir(join(rootPath, 'generated'));
  await mkdir(join(rootPath, 'src'));
  await mkdir(join(rootPath, '.git'));
  await writeFile(join(rootPath, 'generated', 'schema.json'), '{"v":1}\n');
  await writeFile(join(rootPath, 'package.json'), '{"type":"module"}\n');
  await writeFile(join(rootPath, 'src', 'a.mjs'), 'export const a = 1;\n');
  await writeFile(join(rootPath, '.git', 'config'), 'excluded administrative bytes\n');
}

async function captureFixture(rootPath, overrides = {}) {
  const capture = api('captureLocalSourceSnapshot');
  return capture({
    rootPath,
    repositoryIdentityBytes: repositoryIdentityBytes(),
    inventoryPolicyBytes: inventoryPolicyBytes(overrides),
  });
}

function expectCode(code, operation) {
  return assert.rejects(operation, (error) => error?.code === code);
}

test('fixture capture emits the closed local schema and independent digest KAT', async () => {
  await withOwnedFixture(async ({ rootPath }) => {
    await populateFixture(rootPath);
    const capability = await captureFixture(rootPath);
    const snapshot = api('getLocalSourceSnapshot')(capability);
    const literalPreimage = '{"atomicSnapshot":false,"authentication":"NONE","authorizing":false,"counts":{"entries":3,"resolutionBytes":18,"resolutionFiles":1,"sourceBytes":28,"sourceFiles":2,"totalBytes":46},"entries":[{"byteLength":8,"path":"generated/schema.json","rawSha256":"2b4248702881de2f5638efe96b233de1c0dd9be5dd24ec35ad030d6b06aede9a","role":"GENERATED_INPUT"},{"byteLength":18,"path":"package.json","rawSha256":"1239d4d885dcad42201a27ed9324f8f0f760b78700d8db9ced39a511cffe7eae","role":"RESOLUTION"},{"byteLength":20,"path":"src/a.mjs","rawSha256":"037ecd1db38c230c248787e60fd7bfc0cb0101b187b59535b6e7483be762d350","role":"SOURCE"}],"executionBoundary":"COOPERATIVE_LOCAL_SAME_USER","fixtureOnly":true,"hostileWriterResistance":false,"inventoryPolicyDigest":"fd5f098e013b292e966dc2b7bfcaaa1c8c20d6605b3ef42e1739830331ef71a8","repositoryIdentityDigest":"564bdddae76a68cbcf577d1d302f4de41e9705cf82a5dc28032ad44a805ccc93","schema":"galerina.logic-aig-local-source-snapshot.v1"}';
    const independentDigest = createHash('sha256')
      .update(`${SNAPSHOT_SCHEMA}\0${literalPreimage}`, 'utf8')
      .digest('hex');

    assert.equal(independentDigest, '6a94f94dcb258852c74fc744400ae7a6fed0f10af66e75af40edc7039c3d4e2a');
    assert.equal(snapshot.snapshotDigest, independentDigest);
    const { snapshotDigest: _digest, ...body } = snapshot;
    assert.equal(canonicalJsonText(body), literalPreimage);
    assert.deepEqual(snapshot.entries.map(({ path, role }) => ({ path, role })), DEFAULT_ENTRIES);
    assert.equal(snapshot.authorizing, false);
    assert.equal(snapshot.authentication, 'NONE');
    assert.equal(snapshot.executionBoundary, 'COOPERATIVE_LOCAL_SAME_USER');
    assert.equal(snapshot.atomicSnapshot, false);
    assert.equal(snapshot.hostileWriterResistance, false);
    assert.equal(snapshot.fixtureOnly, true);
    assert.equal(Object.hasOwn(snapshot, 'gitOid'), false);
  });
});

test('production-profile capture emits a non-fixture snapshot without authority', async () => {
  await withOwnedFixture(async ({ rootPath }) => {
    await populateFixture(rootPath);
    const policyBytes = inventoryPolicyBytes({ profile: 'LOCAL_PRODUCTION_V1' });
    const capability = await api('captureLocalSourceSnapshot')({
      rootPath,
      repositoryIdentityBytes: repositoryIdentityBytes(),
      inventoryPolicyBytes: policyBytes,
    });
    const snapshot = api('getLocalSourceSnapshot')(capability);
    assert.equal(snapshot.fixtureOnly, false);
    assert.equal(snapshot.authorizing, false);
    assert.equal(snapshot.authentication, 'NONE');
    assert.equal(snapshot.atomicSnapshot, false);
    assert.equal(snapshot.hostileWriterResistance, false);
    const repository = validateRepositoryIdentity(
      parseCanonicalJsonBytes(repositoryIdentityBytes(), { label: 'LOCAL_REPOSITORY_IDENTITY' }),
    );
    const policy = validateLocalInventoryPolicy(
      parseCanonicalJsonBytes(policyBytes, { label: 'LOCAL_INVENTORY_POLICY' }),
    );
    assert.equal(policy.profile, 'LOCAL_PRODUCTION_V1');
    assert.equal(
      api('verifyRetainedLocalSourceBytes')(capability),
      true,
    );
    assert.doesNotThrow(() => validateLocalSourceSnapshot(snapshot, {
      allowFixtureOnly: false,
      repositoryIdentity: repository,
      inventoryPolicy: policy,
    }));
  });
});

test('captured capability binds the local subject to retained snapshot state', async () => {
  await withOwnedFixture(async ({ rootPath }) => {
    await populateFixture(rootPath);
    const capability = await captureFixture(rootPath);
    const repository = JSON.parse(repositoryIdentityBytes().toString('utf8'));
    const policy = JSON.parse(inventoryPolicyBytes().toString('utf8'));
    const snapshot = api('getLocalSourceSnapshot')(capability);
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
    const subject = api('buildLocalSourceOriginSubjectFromCapture')({
      allowFixtureOnly: true,
      capability,
      repository,
      policy,
      host,
      myco,
      hypha,
    });
    assert.equal(subject.snapshotDigest, snapshot.snapshotDigest);
    assert.equal(subject.fixtureOnly, true);
    const buildFromCapture = api('buildLocalSourceOriginSubjectFromCapture');
    assert.throws(
      () => buildFromCapture({
        allowFixtureOnly: true,
        capability: {},
        repository,
        policy,
        host,
        myco,
        hypha,
      }),
      (error) => error?.code === 'LOCAL_SOURCE_CAPABILITY',
    );
    assert.throws(
      () => buildFromCapture({
        allowFixtureOnly: false,
        capability,
        repository,
        policy,
        host,
        myco,
        hypha,
      }),
      (error) => error?.code === 'SOURCE_ORIGIN_LOCAL_FIXTURE',
    );
    assert.throws(
      () => buildFromCapture({
        allowFixtureOnly: true,
        capability,
        snapshot,
        repository,
        policy,
        host,
        myco,
        hypha,
      }),
      (error) => error?.code === 'LOCAL_SOURCE_SCHEMA',
    );
    const mismatchedHost = buildLocalHostObservation({
      allowFixtureOnly: true,
      platform: 'win32',
      arch: 'x64',
      runtime: 'node-v24.18.0',
      snapshotDigest: '0'.repeat(64),
      inventoryPolicyDigest: policy.policyDigest,
      fixtureOnly: true,
    });
    assert.throws(
      () => buildFromCapture({
        allowFixtureOnly: true,
        capability,
        repository,
        policy,
        host: mismatchedHost,
        myco,
        hypha,
      }),
      (error) => error?.code === 'SOURCE_ORIGIN_LOCAL_DIGEST',
    );
  });
});

test('captured bytes stay private and retrieval returns a defensive copy', async () => {
  await withOwnedFixture(async ({ rootPath }) => {
    await populateFixture(rootPath);
    const capability = await captureFixture(rootPath);
    const getBytes = api('getCapturedLocalSourceBytes');
    const first = getBytes(capability, 'src/a.mjs');
    first[0] ^= 0xff;
    const second = getBytes(capability, 'src/a.mjs');
    assert.equal(second.toString('utf8'), 'export const a = 1;\n');
    assert.equal(api('verifyRetainedLocalSourceBytes')(capability), true);
  });
});

test('capture freezes byte inputs and option values before its first await', async () => {
  await withOwnedFixture(async ({ rootPath }) => {
    await populateFixture(rootPath);
    const identity = repositoryIdentityBytes();
    const policy = inventoryPolicyBytes();
    const options = { rootPath, repositoryIdentityBytes: identity, inventoryPolicyBytes: policy };
    const pending = api('captureLocalSourceSnapshot')(options);
    identity.fill(0);
    policy.fill(0);
    options.rootPath = join(rootPath, 'changed-after-call');
    const capability = await pending;
    assert.equal(api('getLocalSourceSnapshot')(capability).counts.entries, 3);
  });
});

test('proxy, accessor, and extra-key options refuse before filesystem effects', async () => {
  let traps = 0;
  const hostile = new Proxy({}, {
    get() { traps += 1; throw new Error('must not execute'); },
    getOwnPropertyDescriptor() { traps += 1; throw new Error('must not execute'); },
    getPrototypeOf() { traps += 1; throw new Error('must not execute'); },
    ownKeys() { traps += 1; throw new Error('must not execute'); },
  });
  const capture = api('captureLocalSourceSnapshot');
  await expectCode('LOCAL_SOURCE_SCHEMA', () => capture(hostile));
  assert.equal(traps, 0);

  let getterCalls = 0;
  const accessor = {
    repositoryIdentityBytes: repositoryIdentityBytes(),
    inventoryPolicyBytes: inventoryPolicyBytes(),
  };
  Object.defineProperty(accessor, 'rootPath', {
    enumerable: true,
    get() { getterCalls += 1; return 'must-not-run'; },
  });
  await expectCode('LOCAL_SOURCE_SCHEMA', () => capture(accessor));
  assert.equal(getterCalls, 0);

  await expectCode('LOCAL_SOURCE_SCHEMA', () => capture({
    rootPath: resolve('does-not-exist'),
    repositoryIdentityBytes: repositoryIdentityBytes(),
    inventoryPolicyBytes: inventoryPolicyBytes(),
    extra: true,
  }));
});

test('byte inputs reject shadow accessors and resizable backing without invoking accessors', async () => {
  const capture = api('captureLocalSourceSnapshot');
  const identity = repositoryIdentityBytes();
  const actualBacking = identity.buffer;
  let accessorCalls = 0;
  Object.defineProperty(identity, 'buffer', {
    configurable: true,
    get() { accessorCalls += 1; return actualBacking; },
  });
  await expectCode('LOCAL_SOURCE_SCHEMA', () => capture({
    rootPath: resolve('does-not-exist'),
    repositoryIdentityBytes: identity,
    inventoryPolicyBytes: inventoryPolicyBytes(),
  }));
  assert.equal(accessorCalls, 0);

  const policy = inventoryPolicyBytes();
  const resizableBacking = new ArrayBuffer(policy.byteLength, { maxByteLength: policy.byteLength + 16 });
  assert.equal(resizableBacking.resizable, true);
  const resizablePolicy = new Uint8Array(resizableBacking);
  resizablePolicy.set(policy);
  await expectCode('LOCAL_SOURCE_SCHEMA', () => capture({
    rootPath: resolve('does-not-exist'),
    repositoryIdentityBytes: repositoryIdentityBytes(),
    inventoryPolicyBytes: resizablePolicy,
  }));
});

test('canonical policy bytes are closed and fixture-only before traversal', async () => {
  const capture = api('captureLocalSourceSnapshot');
  await expectCode('LOCAL_SOURCE_POLICY', () => capture({
    rootPath: resolve('does-not-exist'),
    repositoryIdentityBytes: repositoryIdentityBytes(),
    inventoryPolicyBytes: inventoryPolicyBytes({ extraBody: { unexpected: true } }),
  }));
  await expectCode('SOURCE_ORIGIN_JSON_CANONICAL', () => capture({
    rootPath: resolve('does-not-exist'),
    repositoryIdentityBytes: repositoryIdentityBytes(),
    inventoryPolicyBytes: bytesOf('{ "not": "canonical" }'),
  }));
  await expectCode('LOCAL_SOURCE_POLICY', () => capture({
    rootPath: resolve('does-not-exist'),
    repositoryIdentityBytes: repositoryIdentityBytes(),
    inventoryPolicyBytes: inventoryPolicyBytes({ extraBody: { profile: 'PROJECT' } }),
  }));
});

test('revalidation refuses changed captured bytes', async () => {
  await withOwnedFixture(async ({ rootPath }) => {
    await populateFixture(rootPath);
    const capability = await captureFixture(rootPath);
    await writeFile(join(rootPath, 'src', 'a.mjs'), 'export const a = 2;\n');
    await expectCode('LOCAL_SOURCE_CHANGED', () => api('revalidateLocalSourceSnapshot')(capability));
  });
});

test('revalidation refuses a missing admitted path', async () => {
  await withOwnedFixture(async ({ rootPath }) => {
    await populateFixture(rootPath);
    const capability = await captureFixture(rootPath);
    await unlink(join(rootPath, 'generated', 'schema.json'));
    await expectCode('LOCAL_SOURCE_MISSING_PATH', () => api('revalidateLocalSourceSnapshot')(capability));
  });
});

test('revalidation refuses an unexpected non-excluded path', async () => {
  await withOwnedFixture(async ({ rootPath }) => {
    await populateFixture(rootPath);
    const capability = await captureFixture(rootPath);
    await writeFile(join(rootPath, 'unexpected.txt'), 'unexpected\n');
    await expectCode('LOCAL_SOURCE_EXTRA_PATH', () => api('revalidateLocalSourceSnapshot')(capability));
  });
});

test('portable path validation refuses case aliases and backslashes', async () => {
  const capture = api('captureLocalSourceSnapshot');
  const base = {
    rootPath: resolve('does-not-exist'),
    repositoryIdentityBytes: repositoryIdentityBytes(),
  };
  await expectCode('LOCAL_SOURCE_ALIAS', () => capture({
    ...base,
    inventoryPolicyBytes: inventoryPolicyBytes({
      entries: [
        { path: 'src/A.mjs', role: 'SOURCE' },
        { path: 'src/a.mjs', role: 'SOURCE' },
      ],
    }),
  }));
  await expectCode('LOCAL_SOURCE_PATH', () => capture({
    ...base,
    inventoryPolicyBytes: inventoryPolicyBytes({
      entries: [{ path: 'src\\a.mjs', role: 'SOURCE' }],
    }),
  }));
});

test('non-excluded directory links refuse while excluded links are not traversed', async () => {
  await withOwnedFixture(async ({ externalPath, rootPath }) => {
    await populateFixture(rootPath);
    await writeFile(join(externalPath, 'outside.txt'), 'outside\n');
    await symlink(externalPath, join(rootPath, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
    await expectCode('LOCAL_SOURCE_LINK', () => captureFixture(rootPath));
    const capability = await captureFixture(rootPath, { exclusions: ['.git', 'linked', 'tmp'] });
    assert.equal(api('getLocalSourceSnapshot')(capability).counts.entries, 3);
  });
});

test('a hard-linked admitted file refuses even when its alias is excluded', async () => {
  await withOwnedFixture(async ({ rootPath }) => {
    await populateFixture(rootPath);
    await link(join(rootPath, 'src', 'a.mjs'), join(rootPath, '.git', 'alias.mjs'));
    await expectCode('LOCAL_SOURCE_LINK', () => captureFixture(rootPath));
  });
});

test('file-size, entry-count, depth, and time limits fail closed', async (t) => {
  await t.test('file size', async () => withOwnedFixture(async ({ rootPath }) => {
    await populateFixture(rootPath);
    await expectCode('LOCAL_SOURCE_LIMIT', () => captureFixture(rootPath, {
      limits: { ...DEFAULT_LIMITS, maxFileBytes: 7 },
    }));
  }));

  await t.test('entry count', async () => withOwnedFixture(async ({ rootPath }) => {
    await populateFixture(rootPath);
    await expectCode('LOCAL_SOURCE_LIMIT', () => captureFixture(rootPath, {
      limits: { ...DEFAULT_LIMITS, maxEntries: 3 },
    }));
  }));

  await t.test('depth', async () => {
    await expectCode('LOCAL_SOURCE_LIMIT', () => api('captureLocalSourceSnapshot')({
      rootPath: resolve('does-not-exist'),
      repositoryIdentityBytes: repositoryIdentityBytes(),
      inventoryPolicyBytes: inventoryPolicyBytes({
        entries: [{ path: 'one/two/three.mjs', role: 'SOURCE' }],
        limits: { ...DEFAULT_LIMITS, maxDepth: 2 },
      }),
    }));
  });

  await t.test('time', async () => {
    await expectCode('LOCAL_SOURCE_LIMIT', () => api('captureLocalSourceSnapshot')({
      rootPath: resolve('does-not-exist'),
      repositoryIdentityBytes: repositoryIdentityBytes(),
      inventoryPolicyBytes: inventoryPolicyBytes({
        limits: { ...DEFAULT_LIMITS, maxMillis: 0 },
      }),
    }));
  });
});

test('fixture bytes remain ordinary private data rather than executable source authority', async () => {
  await withOwnedFixture(async ({ rootPath }) => {
    await populateFixture(rootPath);
    const before = await readFile(join(rootPath, 'src', 'a.mjs'));
    const capability = await captureFixture(rootPath);
    const after = await readFile(join(rootPath, 'src', 'a.mjs'));
    assert.deepEqual(after, before);
    assert.equal(api('getLocalSourceSnapshot')(capability).fixtureOnly, true);
  });
});

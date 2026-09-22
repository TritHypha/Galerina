import { test } from 'node:test';
import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import * as profiles from '../dist/product-profiles.js';
import { walkLoadGraph, enforceClosedSet, productAllowedFiles, governanceAllowedFiles, compositionAllowedFiles, compositionExternals } from '../dist/load-graph.js';
import { certifiedFixture, devFixture } from './fixtures/rd-1295-products/constructors.mjs';

const pkg = fileURLToPath(new URL('..', import.meta.url));
const fixture = name => fileURLToPath(new URL(`./fixtures/rd-1295-products/${name}.mjs`, import.meta.url));
const real = p => realpathSync.native(p);
for (const entry of ['kernel', 'governance', 'inference', 'tpl', 'photonic', 'custody', 'dataplane']) {
  test(`${entry}: emitted entry has only its closed runtime dependencies`, async () => {
    const graph = await walkLoadGraph(join(pkg, 'dist', `${entry}.js`));
    assert.equal(graph.ok, true, JSON.stringify(graph));
    const report = enforceClosedSet(graph, productAllowedFiles(pkg, entry), profiles.PRODUCT_EXTERNALS[entry], []);
    assert.equal(report.ok, true, JSON.stringify(report));
  });
  test(`${entry}: package consumer resolves and executes without the barrel`, async () => {
    const path = fixture(entry);
    const graph = await walkLoadGraph(path);
    assert.equal(graph.ok, true, JSON.stringify(graph));
    assert.ok(graph.files.includes(real(join(pkg, 'dist', `${entry}.js`))));
    const report = enforceClosedSet(graph, [...productAllowedFiles(pkg, entry), path], profiles.PRODUCT_EXTERNALS[entry], []);
    assert.equal(report.ok, true, JSON.stringify(report));
    const consumer = await import(new URL(`./fixtures/rd-1295-products/${entry}.mjs`, import.meta.url));
    assert.equal(consumer.available, true);
  });
  test(`${entry}: unlisted same-basename file is a TCB violation`, async () => {
    const graph = await walkLoadGraph(fixture(`hostile-${entry}`));
    assert.equal(graph.ok, true, JSON.stringify(graph));
    const report = enforceClosedSet(graph, [...productAllowedFiles(pkg, entry), fixture(`hostile-${entry}`)], profiles.PRODUCT_EXTERNALS[entry], []);
    assert.equal(report.ok, false);
    assert.deepEqual(report.extras, [real(fixture('extra/governance'))]);
  });
}

test('tower.governance.v1 is exactly kernel union cli-check', async () => {
  assert.deepEqual(new Set(profiles.GOVERNANCE_ALLOWED_STEMS), new Set([...profiles.KERNEL_ALLOWED_STEMS, ...profiles.CLI_CHECK_ALLOWED_STEMS]));
  const entry = fixture('governance-composition');
  const graph = await walkLoadGraph(entry);
  assert.equal(graph.ok, true, JSON.stringify(graph));
  const allowed = [...governanceAllowedFiles(pkg), entry];
  assert.equal(enforceClosedSet(graph, allowed, profiles.KERNEL_PERMITTED_EXTERNALS, []).ok, true);
  assert.ok(graph.files.includes(real(join(pkg, 'dist/kernel.js'))));
  assert.ok(graph.files.includes(real(join(pkg, 'dist/governance.js'))));
  for (const stem of ['hybrid-engine', 'tpl-simulator', 'photonic-admission', 'lease', 'data-plane-border']) {
    const extra = real(join(pkg, 'dist', `${stem}.js`));
    const report = enforceClosedSet({...graph, files:[...graph.files, extra]}, allowed, profiles.KERNEL_PERMITTED_EXTERNALS, []);
    assert.equal(report.ok, false, stem);
    assert.ok(report.extras.includes(extra));
  }
});

for (const [cluster, stem] of [['photonic', 'photonic-admission'], ['custody', 'registry-key-rotation'], ['dataplane', 'data-plane-border']]) {
  test(`kernel linter: ${cluster} import is a forbidden extra`, async () => {
    const entry = fixture(`kernel-${cluster}`);
    const graph = await walkLoadGraph(entry);
    assert.equal(graph.ok, true, JSON.stringify(graph));
    const report = enforceClosedSet(graph, [...productAllowedFiles(pkg, 'kernel'), entry], profiles.KERNEL_PERMITTED_EXTERNALS, profiles.KERNEL_FORBIDDEN_MODULES);
    assert.equal(report.ok, false);
    assert.ok(report.forbidden.includes(stem));
    assert.ok(report.extras.includes(real(join(pkg, 'dist', `${stem}.js`))));
  });
}
test('undeclared composition unions are refused by name', () => {
  assert.throws(() => profiles.compositionClusters('kernel+photonic'), /ERR_TOWER_COMPOSITION_UNKNOWN/);
  assert.throws(() => profiles.compositionClusters('tower.governance.v1'), /ERR_TOWER_COMPOSITION_UNKNOWN/);
});

test('declared compositions admit only their cluster union', () => {
  const extra = real(join(pkg, 'dist', 'hybrid-engine.js'));
  for (const [id, required] of [
    ['cli-check', ['governance.js']],
    ['certified', ['kernel.js', 'governance.js', 'hybrid-engine.js']],
    ['air-gap', ['hybrid-engine.js', 'tpl-simulator.js']],
    ['photonic', ['governance.js', 'photonic-admission.js']],
    ['registry', ['kernel.js', 'lease.js']],
    ['api-data', ['governance.js', 'data-plane-border.js']],
    ['full-lab', ['hybrid-engine.js', 'tpl-simulator.js', 'photonic-admission.js', 'lease.js', 'data-plane-border.js']],
  ]) {
    const allowed = compositionAllowedFiles(pkg, id);
    const externals = compositionExternals(id);
    for (const stem of required) {
      assert.ok(allowed.some((f) => f.replace(/\\/g, '/').endsWith(`/${stem}`)), `${id} missing ${stem}`);
    }
    if (id === 'cli-check' || id === 'photonic' || id === 'registry' || id === 'api-data') {
      const report = enforceClosedSet({ ok: true, files: [...allowed, extra], externals: [], edges: [] }, allowed, externals, []);
      assert.equal(report.ok, false, id);
      assert.ok(report.extras.includes(extra), id);
    }
  }
});

test('tower.governance.v1 entry loads kernel+cli-check and refuses hybrid', async () => {
  const entry = join(pkg, 'dist', 'governance-v1.js');
  const graph = await walkLoadGraph(entry);
  assert.equal(graph.ok, true, JSON.stringify(graph));
  const allowed = [...governanceAllowedFiles(pkg), real(entry)];
  assert.equal(enforceClosedSet(graph, allowed, profiles.KERNEL_PERMITTED_EXTERNALS, []).ok, true, JSON.stringify(graph));
  const consumer = fixture('governance-v1');
  const consumerGraph = await walkLoadGraph(consumer);
  assert.equal(consumerGraph.ok, true, JSON.stringify(consumerGraph));
  assert.equal(enforceClosedSet(consumerGraph, [...allowed, consumer], profiles.KERNEL_PERMITTED_EXTERNALS, []).ok, true);
  const extra = real(join(pkg, 'dist', 'hybrid-engine.js'));
  assert.equal(enforceClosedSet({ ...graph, files: [...graph.files, extra] }, allowed, profiles.KERNEL_PERMITTED_EXTERNALS, []).ok, false);
});

for (const [id, fixtureName] of [
  ['photonic', 'composition-photonic'],
  ['registry', 'composition-registry'],
  ['api-data', 'composition-api-data'],
  ['air-gap', 'composition-air-gap'],
]) {
  test(`${id} composition consumer stays inside compositionAllowedFiles`, async () => {
    const path = fixture(fixtureName);
    const graph = await walkLoadGraph(path);
    assert.equal(graph.ok, true, JSON.stringify(graph));
    const report = enforceClosedSet(graph, [...compositionAllowedFiles(pkg, id), path], compositionExternals(id), []);
    assert.equal(report.ok, true, JSON.stringify(report));
    const extraStem = id === 'air-gap' ? 'data-plane-border.js' : 'hybrid-engine.js';
    const extra = real(join(pkg, 'dist', extraStem));
    assert.equal(enforceClosedSet({ ...graph, files: [...graph.files, extra] }, [...compositionAllowedFiles(pkg, id), path], compositionExternals(id), []).ok, false);
  });
}

test('certified composition contains the inference load graph', async () => {
  const graph = await walkLoadGraph(join(pkg, 'dist', 'inference.js'));
  assert.equal(graph.ok, true, JSON.stringify(graph));
  const report = enforceClosedSet(graph, compositionAllowedFiles(pkg, 'certified'), compositionExternals('certified'), []);
  assert.equal(report.ok, true, JSON.stringify(report));
});

test('walker refuses unknown Tower subpaths', async () => {
  const graph = await walkLoadGraph(fixture('unknown'));
  assert.equal(graph.ok, false);
  assert.match(graph.reason, /forbidden-tower-subpath/);
});

test('named certified factory rejects unsigned load and contradictory labels', () => {
  assert.throws(() => certifiedFixture({allowUnsignedLoad:true}), /ERR_CERTIFIED_UNSIGNED_LOAD_FORBIDDEN/);
  assert.throws(() => certifiedFixture({certified:false}), /ERR_PROFILE_CONTRADICTION/);
  assert.throws(() => devFixture({certified:true}), /ERR_PROFILE_CONTRADICTION/);
});
for (const [governance, code] of [
  [{}, 'ERR_CERTIFIED_NO_ALLOWLIST'],
  [{approvedModels:['m']}, 'ERR_CERTIFIED_NO_TOKEN_BUDGET'],
  [{approvedModels:['m'], maxNewTokens:8}, 'ERR_CERTIFIED_NO_COST_CEILING'],
  [{approvedModels:['m'], maxNewTokens:8, maxTokenCost:'GBP0.01'}, 'ERR_CERTIFIED_HOST_NATIVE_OPEN'],
]) {
  test(`named certified factory preserves ${code}`, () => {
    assert.throws(() => certifiedFixture({governance}), new RegExp(code));
  });
}
test('named certified inference refuses an unsigned self-load', async () => {
  const product = certifiedFixture();
  assert.equal(product.profile, 'tower.certified.v1');
  assert.equal(Object.isFrozen(product), true);
  await assert.rejects(product.engine.infer({prompt:'x', correlationId:'RD1295-CERT', model:'m'}), /FUNGI-ASSIMILATE-003/);
  const audit = product.engine.getAudit().query({correlationId:'RD1295-CERT'});
  assert.ok(audit.some(e=>e.phase === 'TRAP' && e.details.violation === 'ERR_UNVERIFIED_METADATA'));
  assert.equal(audit.some(e=>e.phase === 'LOAD' || e.phase === 'EXEC'), false);
});
test('named dev defaults refuse unsigned load', async () => {
  const product = devFixture();
  assert.equal(product.profile, 'tower.dev.v1');
  await assert.rejects(product.engine.infer({prompt:'x', correlationId:'RD1295-DEV-DEFAULT'}), /FUNGI-ASSIMILATE-003/);
});
test('named certified factory forwards deployment load evidence without bypassing hash checks', async () => {
  const product = certifiedFixture({pluginLoadEvidence:{artifactBytes:new Uint8Array([1])}});
  await assert.rejects(product.engine.infer({prompt:'x', correlationId:'RD1295-EVIDENCE', model:'m'}), /FUNGI-ASSIMILATE-004/);
  const audit = product.engine.getAudit().query({correlationId:'RD1295-EVIDENCE'});
  assert.ok(audit.some(e=>e.phase === 'TRAP' && e.details.violation === 'ERR_ARTIFACT_HASH_MISMATCH'));
  assert.equal(audit.some(e=>e.phase === 'LOAD' || e.phase === 'EXEC'), false);
});
test('named certified factory refuses malformed policy values and host-native opt-in', () => {
  const valid = {approvedModels:['m'], maxNewTokens:8, maxTokenCost:'GBP0.01', denyHostNativeFallback:true};
  for (const maxNewTokens of [null, NaN, Infinity, -1, 1.5]) {
    assert.throws(() => certifiedFixture({governance:{...valid, maxNewTokens}}), /ERR_CERTIFIED_INVALID_POLICY/);
  }
  assert.throws(() => certifiedFixture({governance:{...valid, maxTokenCost:null}}), /ERR_CERTIFIED_INVALID_POLICY/);
  assert.throws(() => certifiedFixture({governance:{...valid, allowHostNativeFallback:true}}), /ERR_CERTIFIED_HOST_NATIVE_OPEN/);
  assert.throws(() => certifiedFixture({photonic:{}}), /ERR_PROFILE_PHOTONIC_FORBIDDEN/);
});
test('named certified factory preserves governed egress and attestation requirements', () => {
  assert.throws(() => certifiedFixture({auditEgress:undefined}), /ERR_CERTIFIED_NO_EGRESS/);
  assert.throws(() => certifiedFixture({attestation:undefined}), /ERR_CERTIFIED_NO_ATTESTATION/);
  assert.throws(() => certifiedFixture({attestation:{requireSigned:true, publicKeyPem:'untrusted-fixture'}}), /ERR_CERTIFIED_NO_PQ_KEY/);
});
for (const allowHostNativeFallback of [false, true]) {
  test(`named dev host-native opt-in ${allowHostNativeFallback} is enforced`, async () => {
    const product = devFixture({allowUnsignedLoad:true, bridges:new Map(), governance:{allowUnsignedCapabilityGrant:true, allowHostNativeFallback}});
    const receipt = await product.engine.infer({prompt:'x', correlationId:`RD1295-DEV-${allowHostNativeFallback}`, opClasses:['normalization']});
    assert.equal(product.profile, 'tower.dev.v1');
    assert.equal(receipt.trapFired, !allowHostNativeFallback);
    if (!allowHostNativeFallback) assert.equal(receipt.trapCode, 'ERR_HOST_NATIVE_DENIED');
  });
}

test('shared substrate vote preserves all 27 ternary outcomes and rejects invalid readings', async () => {
  const { votedTrit3 } = await import('@galerina/tower-citizen/photonic');
  const { asTrit, consensusTrit } = await import('@galerina/tower-citizen/tpl');
  for (const a of [-1, 0, 1]) for (const b of [-1, 0, 1]) for (const c of [-1, 0, 1]) {
    const sum = a + b + c;
    const expected = sum > 0 ? 1 : sum < 0 ? -1 : 0;
    assert.equal(votedTrit3(a, b, c), expected);
    assert.equal(consensusTrit(asTrit(a), asTrit(b), asTrit(c)), expected);
  }
  for (const bad of [undefined, null, NaN, Infinity, 2]) {
    assert.throws(() => votedTrit3(bad, 0, 0), /SECURITY_TRAP/);
    assert.throws(() => consensusTrit(bad, 0, 0), /SECURITY_TRAP/);
  }
});

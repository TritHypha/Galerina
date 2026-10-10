// Test evidence only: old capture and reviewed current source are distinct subjects.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

export const HISTORICAL_ZONE_REVISION = '05eb5c29be9592a42cdd48baaeb027279ff5299d';
export const CURRENT_ZONE_CHANGE_REVISION = '0d06d6c1f9808786bbf41cdfd983816d79cd48ec';
// Regions in this change remain identical at reviewed HEAD eb0b01c3b8da25543b50af6633a933ba8861d088.
// Packing/length execution and old-decision controls accompany this source freeze.
export const CURRENT_CODEX_ZONE = Object.freeze({
  Z1: 'd0b7917b0cb79ed19965945807e5bea45c61250bf0f2d0849586ca87f9b87e71',
  Z2: '178e5872bb745bf31d0a37656b6392bd9f429a66ae297207f78f82a9969c3481',
  Z3: '75ab5501679496724c1f0703343dd260aec823a80878aba782772dd10869052a',
});
export const HISTORICAL_ZONE_FIXTURE = new URL('../../packages-ts/galerina-core-compiler/tests/fixtures/codex-zones-05eb5c29.json', import.meta.url);
const subject = [
  ['Z1', 'wat-emitter.ts', 321, 330],
  ['Z2', 'wat-emitter-binary.ts', 286, 299],
  ['Z3', 'wat-emitter.ts', 2502, 2528],
];

export function historicalCodexZoneHashes(fixture = JSON.parse(readFileSync(HISTORICAL_ZONE_FIXTURE, 'utf8'))) {
  assert.equal(fixture.revision, HISTORICAL_ZONE_REVISION, 'historical source revision');
  assert.equal(fixture.regions.length, 3, 'historical region count');
  return fixture.regions.map((region, index) => {
    const [id, file, startLine, endLine] = subject[index];
    assert.deepEqual([region.id, region.path, region.startLine, region.endLine],
      [id, `packages-ts/galerina-core-compiler/src/${file}`, startLine, endLine]);
    assert.equal(typeof region.text, 'string');
    assert.ok(region.text.length <= 16384 && !region.text.includes('\r'));
    assert.equal(region.text.split('\n').length, endLine - startLine + 1);
    // Exact stored LF region, including both anchors, without an added final LF.
    return { id, sha256: createHash('sha256').update(region.text, 'utf8').digest('hex') };
  });
}

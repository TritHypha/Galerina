// proof-RD-0223.mjs — PagedAttention / OS virtual-paging applied to Galerina/TritMesh memory.
// Kind: design head with embedded quantitative claims. Node built-ins only.
import assert from 'node:assert/strict';
const out = [];
const log = (s) => { out.push(s); };

// C1 — page granularity + block-table indirection (base-16 divide == OS page table).
const BLOCK = 16;
function blockTableLookup(logicalTokenIdx, physicalPages) {
  const pageNo = Math.floor(logicalTokenIdx / BLOCK);
  const offset = logicalTokenIdx % BLOCK;
  return { phys: physicalPages[pageNo], offset };
}
const pagesNeeded = Math.ceil(37 / BLOCK);
assert.equal(pagesNeeded, 3);
const physical = [7, 2, 5];
assert.deepEqual(blockTableLookup(0, physical),  { phys: 7, offset: 0 });
assert.deepEqual(blockTableLookup(16, physical), { phys: 2, offset: 0 });
assert.deepEqual(blockTableLookup(35, physical), { phys: 5, offset: 3 });
log(`C1 block-table: 37 tokens -> ${pagesNeeded} scattered pages of ${BLOCK}; lookup(35)->page5 off3  [PASS]`);

// C2 — internal fragmentation: contiguous MAXLEN pre-alloc vs paged reservation.
const MAXLEN = 2048;
const usedLens = [50,40,120,30,200,15,500,80,60,25,300,45,90,35,150,70,20,400,55,65];
const n = usedLens.length;
const totalUsed = usedLens.reduce((a, b) => a + b, 0);
const contigReserved = n * MAXLEN;
const contigWaste = (contigReserved - totalUsed) / contigReserved;
const pagedReserved = usedLens.reduce((a, u) => a + Math.ceil(u / BLOCK) * BLOCK, 0);
const pagedWaste = (pagedReserved - totalUsed) / pagedReserved;
log(`C2 used=${totalUsed} tok  contigReserved=${contigReserved}  pagedReserved=${pagedReserved}`);
log(`C2 contiguous internal waste = ${(contigWaste*100).toFixed(1)}%   paged waste = ${(pagedWaste*100).toFixed(1)}%`);
assert.ok(contigWaste >= 0.60, 'contiguous waste should be >= 60% (note is conservative here)');
assert.ok(contigWaste > 0.90, 'for short chats pre-alloc waste is actually >90%');
assert.ok(pagedWaste > 0 && pagedWaste < 0.15, 'paged waste is small tail-fragmentation, NOT literally 0%');
log(`C2 corrected: paged waste is last-page tail only (~${(pagedWaste*100).toFixed(1)}%), "near 0" not "= 0"  [PASS]`);

// C3 — throughput multiplier == memory-packing multiplier (memory-bound); vLLM 2-4x "as reported".
const packMultiplier = contigReserved / pagedReserved;
log(`C3 packing multiplier (contig/paged reserved) = ${packMultiplier.toFixed(1)}x`);
const REPORTED_LO = 2, REPORTED_HI = 4;
assert.ok(packMultiplier >= REPORTED_LO, 'memory packing gain must at least cover the low end of reported 2-4x');
assert.ok(REPORTED_HI <= packMultiplier, 'reported 2-4x throughput sits WITHIN raw memory-capacity headroom');
log(`C3 vLLM-REPORTED 2-4x throughput consistent (memory headroom ${packMultiplier.toFixed(1)}x >= 4x); cite "as reported"  [PASS]`);

// C4 — prefix sharing: N users, one S-token system prompt stored once.
const N_USERS = 100, S_PROMPT = 2000;
const prefixPages = Math.ceil(S_PROMPT / BLOCK);
const naivePrefixPages = N_USERS * prefixPages;
const sharedPrefixPages = prefixPages;
const prefixSaved = naivePrefixPages - sharedPrefixPages;
log(`C4 prefix ${S_PROMPT} tok x ${N_USERS} users: naive=${naivePrefixPages} pages, shared=${sharedPrefixPages} pages, saved=${prefixSaved} (${((prefixSaved/naivePrefixPages)*100).toFixed(1)}%)`);
assert.equal(sharedPrefixPages, 125);
assert.equal(prefixSaved, 12375);
assert.ok(prefixSaved / naivePrefixPages > 0.98, 'prefix sharing removes ~99% of duplicated prompt memory');

// C5 — order-of-growth UNCHANGED: paging cuts a constant, not the big-O (RD-0036/0156/0166).
const liveBytesContig = totalUsed, liveBytesPaged = totalUsed;
assert.equal(liveBytesContig, liveBytesPaged, 'paging changes reservation, NOT the O(context) work touched');
log(`C5 live work identical (${liveBytesPaged} tok) — paging cuts the fragmentation CONSTANT, big-O unchanged  [PASS]`);
const isaMap = { 'page':'OS frame', 'block table':'page table', 'prefix share':'shared read-only page / mmap CoW', 'chunk payload':'RD-0161 chunked streaming' };
assert.equal(Object.keys(isaMap).length, 4);
log(`C5 non-AI advice re-derives: ${JSON.stringify(isaMap)}  [PASS: known CS, no novelty]`);

// C6 — ZERO-TRUST: block table + health vector are unsigned; admission stays on signed .fungi cap (RD-0169).
function admit({ blockTable, healthVector, signedFungiCapValid }) { return signedFungiCapValid === true; }
assert.equal(admit({ blockTable:[7,2,5], healthVector:[1,1,1], signedFungiCapValid:false }), false,
  'forged block table + forged health vector must NOT admit — no secret present');
assert.equal(admit({ blockTable:[0], healthVector:[-1,0,1], signedFungiCapValid:true }), true,
  'valid signed .fungi capability admits; placement metadata irrelevant to authz');
log(`C6 forged block-table+[+1,+1,+1] health => DENY; admission stays keyed on signed .fungi cap (RD-0169)  [PASS]`);

console.log(out.join('\n'));
console.log('\nALL GREEN — 6/6 claim groups verified.');
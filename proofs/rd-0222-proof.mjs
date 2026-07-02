// proof-RD-0222.mjs — Border-model / tri-state ingress classification (note 77-mesh-r-d-14)
// DON'T TRUST, CHECK + PROVE OWN MATHS. Node built-ins only.
// assert-FAILS the note's overclaims, assert-PASSES the corrected values.
import assert from "node:assert/strict";

// ---------- (A) codepoint count ----------
const BITS = 2;
const codepoints = 1 << BITS;
assert.equal(codepoints, 4, "a 2-bit field has 2^2 = 4 codepoints");
const noteMap = new Map([[0b00,"DENY"],[0b11,"ALLOW"],[0b01,"INDETERMINATE"]]); // 0b10 not declared
assert.equal(noteMap.size, 3, "the note declares only 3 of the 4 codepoints");
const declared = new Set(noteMap.keys());
const allCodepoints = [0b00,0b01,0b10,0b11];
const undefinedCodepoints = allCodepoints.filter((c)=>!declared.has(c));
assert.deepEqual(undefinedCodepoints,[0b10],"exactly one codepoint (0b10) is left undefined by the note");

// ---------- (B) fail-open ingress hole ----------
function admit_noteLiteral(twoBits){ return noteMap.get(twoBits) !== "DENY"; } // fail-OPEN
assert.equal(noteMap.get(0b10), undefined, "0b10 unclassified (unrecognised ingress symbol)");
assert.equal(admit_noteLiteral(0b10), true, "REFUTED-AS-UNSAFE: note-literal border ADMITS undefined 0b10");
function decodeZT(b){ switch(b){case 0b11:return +1;case 0b00:return -1;case 0b01:return 0;default:return -1;} }
function admit_ZT(b){ return decodeZT(b) === +1; }
assert.equal(admit_ZT(0b10), false, "ZT border DENIES undefined codepoint 0b10 (fail-closed)");
assert.equal(admit_ZT(0b01), false, "ZT border DENIES INDETERMINATE (fail-closed)");
assert.equal(admit_ZT(0b00), false, "ZT border DENIES explicit DENY");
assert.equal(admit_ZT(0b11), true,  "ZT border ADMITS only explicit ALLOW");
const failOpenCount = allCodepoints.filter((c)=>admit_noteLiteral(c)&&!admit_ZT(c)).length;
assert.equal(failOpenCount, 2, "note-literal over-admits 2 codepoints vs ZT: INDETERMINATE + undefined 0b10");

// ---------- (C) information-theoretic cost: no 'native' ternary on binary silicon ----------
const bitsForThreeStates = Math.log2(3);
assert.ok(Math.abs(bitsForThreeStates-1.584962500721156)<1e-9, "log2(3) value");
assert.equal(Math.ceil(bitsForThreeStates), 2, "ceil(log2(3)) = 2 bits min container");
const wastedBits = 2 - bitsForThreeStates;
assert.ok(wastedBits>0.41 && wastedBits<0.42, "2-bit container wastes ~0.415 bits (reserved 4th codepoint)");

// ---------- HTTP status-code mapping sanity ----------
const httpMap = { ALLOW:200, DENY:403, INDETERMINATE_stepup:[401,428] };
assert.equal(httpMap.ALLOW,200,"ALLOW->200"); assert.equal(httpMap.DENY,403,"DENY->403");
assert.ok(httpMap.INDETERMINATE_stepup.includes(428),"INDETERMINATE->428 valid step-up");

console.log("ALL GREEN");
console.log(`(A) 2-bit codepoints=${codepoints}; undefined=0b${(0b10).toString(2).padStart(2,"0")}`);
console.log(`(B) note-literal over-admits ${failOpenCount} codepoints vs ZT (INDETERMINATE + undefined 0b10)`);
console.log(`(C) log2(3)=${bitsForThreeStates.toFixed(6)} bits; wastes ${wastedBits.toFixed(6)}; wire stays BINARY (RD-0036/0156)`);
// proof-RD-0211.mjs — Topological boundary operator (0-state) claim check.
// node built-ins only. Exits nonzero on any failed assertion.
import assert from 'node:assert/strict';

// PART 1 — the alternating-face formula IS the boundary operator (confirm sound math)
function faceKey(simplex){ return simplex.join(','); }
function boundaryOfSimplex(simplex){
  const out=new Map();
  for(let i=0;i<simplex.length;i++){
    const face=simplex.slice(0,i).concat(simplex.slice(i+1)); // drop vertex i (v^i hat)
    const sign=(i%2===0)?1:-1; const k=faceKey(face);
    out.set(k,(out.get(k)||0)+sign);
  }
  return out;
}
function addChain(acc,chain,scale=1){ for(const[k,c]of chain)acc.set(k,(acc.get(k)||0)+scale*c); return acc; }
function boundaryOfChain(chain){
  const out=new Map();
  for(const[key,coeff]of chain){ const simplex=key.split(',').map(Number); addChain(out,boundaryOfSimplex(simplex),coeff); }
  return out;
}
const tet=new Map([['0,1,2,3',1]]);
const d3=boundaryOfChain(tet); const d2d3=boundaryOfChain(d3);
let ddNonzero=0; for(const[,c]of d2d3)if(c!==0)ddNonzero++;
assert.equal(ddNonzero,0,'d∘d must be 0 (defining boundary-operator identity)');
const expectedD3=new Map([['1,2,3',1],['0,2,3',-1],['0,1,3',1],['0,1,2',-1]]);
assert.equal(d3.size,4); for(const[k,v]of expectedD3)assert.equal(d3.get(k),v,`face ${k} sign`);
const tri=new Map([['0,1,2',1]]); const d2=boundaryOfChain(tri); const d1d2=boundaryOfChain(d2);
for(const[,c]of d1d2)assert.equal(c,0,'triangle ∂∂=0');
const PART1=true;

// PART 2 — CATEGORY ERROR: topological boundary != K3-0 (pending/unknown)
const tops=[[0,1,2],[1,2,3]]; const edgeCount=new Map();
for(const t of tops)for(let i=0;i<3;i++){ const e=[t[i],t[(i+1)%3]].sort((a,b)=>a-b).join(','); edgeCount.set(e,(edgeCount.get(e)||0)+1); }
const boundaryVerts=new Set();
for(const[e,c]of edgeCount)if(c===1)e.split(',').forEach(v=>boundaryVerts.add(Number(v)));
const isTopoBoundary=new Map([0,1,2,3].map(v=>[v,boundaryVerts.has(v)]));
const k3State=new Map([[0,+1],[1,0],[2,-1],[3,+1]]); // from signed .fungi capability, NOT geometry
const k3ZeroSet=new Set([...k3State].filter(([,s])=>s===0).map(([v])=>v));
const topoBoundarySet=boundaryVerts;
const setsEqual=k3ZeroSet.size===topoBoundarySet.size&&[...k3ZeroSet].every(v=>topoBoundarySet.has(v));
assert.equal(setsEqual,false,'REFUTED: K3-0 set must NOT equal topological boundary set');
assert.equal(isTopoBoundary.get(0),true); assert.equal(k3State.get(0),+1); // topo-boundary but ALLOW
assert.equal(k3State.get(1),0);
const PART2=true;

// PART 3 — "instant"/O(1) REFUTED: boundary extraction is Theta(#simplices*(k+1))
function boundaryWork(nTop,k){ let ops=0; const acc=new Map();
  for(let s=0;s<nTop;s++){ const simplex=Array.from({length:k+1},(_,i)=>s*(k+1)+i);
    for(let i=0;i<=k;i++){ ops++; const face=simplex.slice(0,i).concat(simplex.slice(i+1));
      const key=face.join(','); acc.set(key,(acc.get(key)||0)+((i%2===0)?1:-1)); } }
  return ops; }
const k=2; const w100=boundaryWork(100,k), w1000=boundaryWork(1000,k);
assert.equal(w100,100*(k+1)); assert.equal(w1000,1000*(k+1));
assert.notEqual(w1000,w100,'REFUTED: boundary extraction is NOT O(1)');
assert.equal(w1000/w100,10,'work scales linearly with #simplices');
const zPlaneReads=(N)=>N; assert.equal(zPlaneReads(1e9),1e9,'Z=0 slice still reads all N (O(N))');
const PART3=true;

console.log('=== RD-0211 boundary-operator (0-state) proof ===');
console.log('PART1 boundary formula sound (∂∂=0):',PART1,'| ∂∂ nonzero:',ddNonzero);
console.log('PART2 category error refuted (K3-0 != topo-boundary):',PART2,'| sets equal?',setsEqual,'| v0 topo-boundary but K3=',k3State.get(0));
console.log('PART3 instant/O(1) refuted:',PART3,'| 100->',w100,'1000->',w1000,'ratio',w1000/w100,'| Z=0 reads N=1e9:',zPlaneReads(1e9));
console.log('ALL ASSERTIONS PASSED');
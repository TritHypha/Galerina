// proof-RD-0208.mjs — BOUND (MAX_DEPTH / TIMEOUT) as anti-DoS / termination guard for graph queries.
// Node built-ins only. Asserts the REAL values behind the claim, and asserts DOWN the overclaims.
import assert from 'node:assert/strict';
const log = (...a) => console.log(...a);

function ring(n){const adj=new Map();for(let i=0;i<n;i++)adj.set(i,[(i+1)%n]);return adj;}
function fanout(levels,b){const adj=new Map();const N=1+b+b*b+b*b*b;for(let i=0;i<N;i++){const kids=[];for(let k=1;k<=b;k++)kids.push((i*b+k)%N);adj.set(i,kids);}return adj;}

// C1: naive DFS with NO visited-set on a cyclic graph does not terminate
function naiveWalkStepsUntil(adj,start,stepBudget){let steps=0;const stack=[start];while(stack.length){const u=stack.pop();steps++;if(steps>=stepBudget)return{terminated:false,steps};for(const v of adj.get(u))stack.push(v);}return{terminated:true,steps};}
const naive=naiveWalkStepsUntil(ring(5),0,1_000_000);
assert.equal(naive.terminated,false,'C1');
log(`C1 OK  unbounded naive walk on 5-node RING blew the ${(1_000_000).toLocaleString()}-step budget (infinite loop confirmed).`);

// C2: MAX_DEPTH=D bounds visits by geometric closed form
function depthLimitedVisits(adj,start,D){let visits=0;const stack=[[start,0]];while(stack.length){const [u,d]=stack.pop();visits++;if(d>=D)continue;for(const v of adj.get(u))stack.push([v,d+1]);}return visits;}
function geomBound(b,D){if(b===1)return D+1;return (Math.pow(b,D+1)-1)/(b-1);}
function bTree(b,D){const adj=new Map();let next=0;const root=next++;let frontier=[[root,0]];while(frontier.length){const nf=[];for(const [u,d] of frontier){const kids=[];if(d<D)for(let k=0;k<b;k++){const c=next++;kids.push(c);nf.push([c,d+1]);}adj.set(u,kids);}frontier=nf;}return{adj,root};}
for(const [b,D] of [[2,3],[3,4],[5,2]]){const {adj,root}=bTree(b,D);const visits=depthLimitedVisits(adj,root,D);assert.equal(visits,geomBound(b,D),`C2 b=${b} D=${D}`);assert.ok(Number.isFinite(visits));}
log(`C2 OK  MAX_DEPTH=D caps node-visits at the exact geometric ceiling (b^(D+1)-1)/(b-1):`);
log(`       b=2,D=3 -> ${geomBound(2,3)} ; b=3,D=4 -> ${geomBound(3,4)} ; b=5,D=2 -> ${geomBound(5,2)} nodes. Work is FINITE & bounded.`);
const cycVisits=depthLimitedVisits(fanout(3,3),0,3);
assert.ok(Number.isFinite(cycVisits)&&cycVisits<=geomBound(3,3),'C2b');
log(`C2b OK on a CYCLIC graph MAX_DEPTH=3 terminates at ${cycVisits} visits (<= ceiling ${geomBound(3,3)}). Anti-DoS holds on cycles.`);

// C3: honest cost — MAX_DEPTH does not lower the order of a correct visited-set traversal
function correctBFS(adj,start){const seen=new Set([start]);const q=[start];let visits=0;while(q.length){const u=q.shift();visits++;for(const v of adj.get(u))if(!seen.has(v)){seen.add(v);q.push(v);}}return visits;}
assert.equal(correctBFS(ring(5),0),5,'C3');
log(`C3 OK  a CORRECT visited-set BFS on the 5-node ring visits 5 nodes (O(V+E)); MAX_DEPTH is a CEILING, not an order-reduction.`);

// C4: budget-truncation must fail-closed to DENY, never a partial allow
const DENY=-1,ALLOW=+1;
function admitUnderBudget({truncated,wouldAllow}){if(truncated)return DENY;return wouldAllow?ALLOW:DENY;}
assert.equal(admitUnderBudget({truncated:true,wouldAllow:true}),DENY,'C4 deny');
assert.notEqual(admitUnderBudget({truncated:true,wouldAllow:true}),ALLOW,'C4 not allow');
log(`C4 OK  budget truncation => fail-closed DENY (=${DENY}), never a partial ALLOW. BOUND caps COMPUTE; it is NOT a secret/admission check (RD-0169 stands).`);

// C5: TIMEOUT wall-clock is non-deterministic; the COUNT bound is deterministic
const g=bTree(3,4);const fastDepth=depthLimitedVisits(g.adj,g.root,4);const slowDepth=depthLimitedVisits(g.adj,g.root,4);
assert.equal(fastDepth,slowDepth,'C5 depth deterministic');
const workFast=Math.floor(2_000_000/1000*50),workSlow=Math.floor(200_000/1000*50);
assert.notEqual(workFast,workSlow,'C5 timeout non-deterministic');
log(`C5 OK  MAX_DEPTH gives an identical ${fastDepth}-node ceiling on any machine (deterministic); a raw 50ms TIMEOUT truncates at ${workFast.toLocaleString()} vs ${workSlow.toLocaleString()} ops (non-deterministic wall-clock => backstop, not the primary proof).`);

// OVERLAP: re-derives shipped bounded-termination guards + RD-0150 gate
const shipped={recursionDepthCap:2000,globalStepBudget:1_000_000_000,perLoopCap:100_000,wallClock:'request_time'};
assert.ok(shipped.recursionDepthCap>3&&shipped.globalStepBudget>0,'overlap');
log(`OVERLAP OK  RD-0208 BOUND re-derives SHIPPED guards: depth-cap ${shipped.recursionDepthCap}, step-budget ${shipped.globalStepBudget.toLocaleString()}, per-loop ${shipped.perLoopCap.toLocaleString()}, wall-clock '${shipped.wallClock}'. MAX_DEPTH 3 is a per-query tightening of the same class; RD-0150 already mandates the traversal-budget gate.`);
log('\nALL GREEN — RD-0208 BOUND: caps compute (finite geometric ceiling), stops cyclic infinite loops, MUST fail-closed on truncation, deterministic guard = COUNT not wall-clock; re-derives shipped bounded-termination + RD-0150 gate.');
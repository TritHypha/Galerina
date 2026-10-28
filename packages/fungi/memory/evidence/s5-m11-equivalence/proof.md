# S5 mutant M11: equivalence proof and killing test (OPEN-S5-2)

Status: CLOSED 2026-10-28 by the Grok Bot work driver (run gcw-wd-bfafa576), full-auto decision.
Base: Galerina main `19e061568`. Branch: `grok/s5-m11-admission-pin-20261028`.

## The mutant

M11 forces the kernel flag `secretsAdmittedThisRequest` to `true`
(`packages-ts/galerina-framework-app-kernel/src/kernel.ts`, frozen TS reference).
The flag is passed to `secretGate.getSecret(...)` as the `presenceObserved` fact, and
`secret-gate.ts` treats only the literal `true` as valid presence (S5h).

Round m (`f07eb6d4`, 2026-10-23) recorded M11 as an equivalent mutant. Round check 3
(`090d00b6`) and the S5 merge check both noted that the equivalence was an argument, not a
killing test. This row turns the argument into a pinned, checked proof.

## Proof that M11 is equivalent on the current source

Let A be the post-wait admit `const postWaitSecretRefusal = fungiGate.admit(...)` at gate 9.5,
R its refusal block `if (postWaitSecretRefusal !== null) { ... return ... 503 ... }`, S the single
assignment `secretsAdmittedThisRequest = postWaitSecretRefusal === null;`, and C the handler's
`getSecret: (name, callback) => { ... }` closure, the only reader of the flag.

1. Program order inside `handle` is A, then R, then S, then C (C is built when the handler is
   dispatched at step 10, after S).
2. R returns on every path where `postWaitSecretRefusal !== null`. So S executes only when
   `postWaitSecretRefusal === null`, and S stores `true` on every execution.
3. C exists only on executions that passed S, and the flag has no other writer and no other
   reader. Therefore at every read the flag is `true`, which is exactly the value M11 forces.
4. No input reaches C with the flag `false`; the original and M11 are observationally equal.
   A behavioural killing test cannot exist for an equivalent mutant.

The flag is still kept (round m decision, re-affirmed): it is a second fence that starts
refusing the moment the order in step 1 or step 2 changes. Deleting it was rejected.

## Why a structural test kills it

Equivalence rests on the five properties below. If any one fails, M11 stops being equivalent
and becomes a real bypass, so they are pinned in
`packages/fungi/memory/tests/s5-secret-authority/s5-m11-admission-order.test.mjs`.

| Pin | Property | Mutant shape that goes RED |
|---|---|---|
| P1 | one declaration, starts `false` | S5-M11-03 declared `true` (live M11b) |
| P2 | one assignment, value `postWaitSecretRefusal === null` | S5-M11-02 assign `true` (live M11), S5-M11-08 second writer |
| P3 | S after A and after R; R returns a 503 | S5-M11-04 hoisted above R, S5-M11-05 R no longer returns |
| P4 | one reader, inside C, C built after S | S5-M11-06 early reader |
| P5 | gate counts only `presenceObserved === true` | S5-M11-07 truthy presence |

S5-M11-09 checks the checker fails closed when the flag disappears.

## Evidence (block pass, WSL node v24.21.0, temp clone)

- `s5-m11-admission-order.test.mjs` 9/9 on `19e061568` + this branch.
- Live mutants on the real file (applied with sed in the temp clone, then restored):
  M11 (assignment forced `true`) and M11b (declaration `true`) both turn S5-M11-01 RED.
  `kernel.ts` restored byte-identical (git status clean apart from the new files).

## Rejected

- A behavioural kill: impossible for an equivalent mutant (step 4).
- A sha256 pin of `kernel.ts`: any unrelated edit would break it and hide the real invariant.
- Editing `kernel.ts`: TS is frozen reference; the pin only reads it.

## OPEN-S5-1 note (685 vs 686)

The S5 merge check counted app-kernel 685 tests in a clean clone and 686 in the work tree.
On 2026-10-28 the work tree and `git ls-files` both list 96 files under
`packages-ts/galerina-framework-app-kernel/tests`, so no untracked test file explains the gap
today. A counted run needs the built app-kernel environment (`npm run typecheck && npm run build`
first); that stays on OPEN-S5-1.
# Bounded Grok follow-up — credential-verification interpreter delta

## 1. Role

You are an external, non-authorizing reviewer of a bounded Galerina `.fungi` memory/security code delta.

## 2. Intended use

Challenge the exact pushed revision below. Your answer will be independently checked against source and tests; it cannot authorize live protected data, approve deployment, or close an RD.

## 3. Scope and access mode

Read-only follow-up in the existing Grok conversation. Review only the equality-evaluation-order fix and the route's current evidence boundary. Do not repeat the general memory review or reopen the owner-selected route.

## 4. Binding constraints

- Galerina is building a new `.fungi` language. Its memory, ownership, aliasing, allocation and effect semantics can be deliberately designed; TypeScript is bootstrap/reference evidence, not an inherent ceiling on Fungi guarantees.
- Distinguish interpreter/bootstrap behavior from compiler-to-runtime, FFI, host, measured-profile and physical-memory enforcement.
- The owner selected the credential-verification POST operation as the first slice. It returns only matched, not-matched or UNKNOWN to the authenticated requesting gateway, at most once; UNKNOWN never authenticates. It must not create a session/token, update credentials, disclose account existence, publish to the graph or persist result data.
- Do not treat a source comment or unit test as proof of a production protected operation.
- Do not request private RD-owner material or infer that delivery/CI status proves review.

## 5. Established facts and exact source identity

Already established: the route choice is fixed; the review request is only about this pushed code delta and its evidence boundary.

Review commit `c18b69fab557f6e49d0a359787686941ab825e57` on `codex/rd1413-1415-coupled-route-20261004`.

Relevant source SHA-256 pins:

- `packages-ts/galerina-core-compiler/src/interpreter.ts` — `CBB2D0DE1F2DF3C37F4253A9ACBC3EE7E84E9482C4032553CD782A5106C1ED58`
- `packages-ts/galerina-core-compiler/tests/phase34-verify-password-service.test.mjs` — `57056BD00298383DD8C09C5E3455EC064DDB3C610FAB5FDF25F667423A4C8B17`
- `examples/auth-service/verifyPasswordService.fungi` — `9AD60D85E6DA4660ED0CCB5D8A5C2C96A8398307D8B1C4F5641EF8AE7722ED39`
- `packages-ts/galerina-core-compiler/src/crypto-provider-node.ts` — `9609799531E392A996FA67E720F3F3D3DC67C9129C1FEAF1BCDD8D52FC2974F4`

The reported red control before the fix evaluated a missing request field on the left of `==`/`!=` and a provider-backed hash operation on the right; the right-side provider was invoked before the route refused. The final regression covers both operators: missing-left cases must return runtimeError without provider entry, while valid equal/unequal public controls call the provider exactly once and return the expected Boolean. The fixture asserts zero parser errors before execution. Astra independently reviewed this exact implementation/test state, verified the red control, both operators, public controls and checked-trap behavior, and confirmed the parser-quality correction. A focused WSL set passed 283/283 after the final test correction.

The full package test command was started but stopped after several minutes; it did not produce a final total. It showed failures in broader CLI/conformance tests, which have not been adjudicated against a clean baseline. Do not claim a full-package pass.

## 6. Questions

**Q1.** Refute the interpreter side-effect claim. Can an equality or inequality path still evaluate the right-hand expression after the left operand is a runtimeError, or otherwise run a right-side effect before refusal? Check both `==` and `!=`, public positive controls, and checked-trap propagation against the pinned source. Identify the smallest counterexample if the guard is incomplete; otherwise state precisely that the evidence establishes only the current interpreter/bootstrap behavior.

**Q2.** Refute the operation-boundary/evidence claims. Do the pinned Fungi service, Node provider adapter and tests establish a production protected verification route, or do they remain synthetic? Check whether any change accidentally treats an ordinary JSON password, fixture hash, Node provider result or HTTP test as protected-memory/runtime/host proof. State the exact strongest evidence and the next smallest discriminating source/test needed; do not invent Fungi syntax or claim enclave, FFI or physical-memory enforcement.

## 7. Required inspection and outcome-to-proof map

For Q1, direct evidence is the pinned interpreter and parser-clean counter-based regression; the discriminating failure is a provider call after a failed left operand. A passing test is still bootstrap evidence, not compiled-Fungi enforcement.

For Q2, direct evidence is the exact route source, adapter implementation and tests. A real operation would require loaded production route/provider/sink evidence with authenticated gateway authority and verifier-owned protected bytes; the current synthetic loopback test is only a proxy. Mark production operation/enforcement `NOT VERIFIABLE` if that evidence is absent.

## 8. Output contract

For each vector return `PASS`, `PARTIAL` or `NOT VERIFIABLE`; label each material claim `VERIFIED_SOURCE`, `INFERENCE`, `RECOMMENDATION` or `NOT VERIFIABLE`; cite exact file/symbol/line evidence when accessible; give one smallest next check. End with a short list of any genuine remaining blocker. Do not report this as an RD closure.

Deliverable budget: exactly two vector dispositions and a concise residual-blocker list.

## 9. Exclusions

Do not repeat the full RD review, make a route recommendation, change code, request private acceptance criteria, or imply the TypeScript bootstrap sets the ceiling for Fungi. No product-clearance or deployment claim.

## 10. Self-rejection gate

Self-reject if either vector is omitted, if the pushed source identity is not checked, if ordinary bootstrap tests are presented as runtime/host proof, or if the existing fixture is called a production protected operation.

## Follow-up refutation

Address only these two new code/evidence vectors. Preserve source-backed versus inferred claims, and state what evidence would change each disposition. Do not seek agreement or repeat earlier settled questions.

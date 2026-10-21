# 47 auth-verify-e2e mutants

In-memory source override only. Tracked `packages/fungi/memory/src/auth-verify-e2e.fungi` sha256 is restored in `finally`.

| id | file:line | change | red test name |
|---|---|---|---|
| (a) | auth-verify-e2e.fungi:validateVerifyRequest block | skip Signet validate/authenticate/andHalves | mutant (a) skip Signet goes red |
| (b) | auth-verify-e2e.fungi:andHalves | AND of halves weakened to OR | mutant (b) AND weakened to OR goes red |
| (c) | auth-verify-e2e.fungi:consumeStep then releaseGuard | consumeStep omitted | mutant (c) consumeStep omitted goes red |
| (d) | auth-verify-e2e.fungi:served == 100 exit | cleanup skipped on unprotected refusal | mutant (d) cleanup skipped on unprotected refusal goes red |
| (e) | auth-verify-e2e.fungi:committedOop | out-of-process after-begin crash mapped to Refused 102 | mutant (e) OOP after-begin crash mapped to Refused goes red |
| (f) | auth-verify-e2e.fungi:retryPrior == 6 | retry allowed after UNKNOWN | mutant (f) retry allowed after UNKNOWN goes red |
| (g) | auth-verify-e2e.fungi:priorAck == 1 | second ack admitted | mutant (g) second ack admitted goes red |
| (h) | auth-verify-e2e.fungi:clockAdmit != 0 | monotonic backwards clock admitted | mutant (h) monotonic backwards clock admitted goes red |
| (i) | tests/47-auth-verify-e2e/auth-verify-e2e.test.mjs:arityGuardEnabled | harness arity guard removed | mutant (i) harness arity guard removed goes red |
| G7 | auth-verify-e2e.fungi:postPacked != 100 | re-admit post-dispatch 106 as continue | mutant G7 re-admit post-dispatch 106 as continue goes red |
| F2 crashAfterSink | auth-verify-e2e.fungi:crashAfterSink unlisted gate | unlisted-value gate removed | mutant F2 crashAfterSink unlisted gate removed goes red |
| F2 priorAck | auth-verify-e2e.fungi:priorAck unlisted gate | unlisted-value gate removed | mutant F2 priorAck unlisted gate removed goes red |
| F2 retryPrior | auth-verify-e2e.fungi:retryPrior unlisted gate | unlisted-value gate removed | mutant F2 retryPrior unlisted gate removed goes red |

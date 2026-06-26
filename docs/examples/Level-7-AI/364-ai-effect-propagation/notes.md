# 364 — AI effect propagation

**Concept:** a pure flow calling an ai.inference flow inherits that effect and must declare it

Effects propagate upward through the call graph. A `pure flow` may not call anything with side effects. If it calls a `guarded flow` that uses `ai.inference`, the compiler raises `SPORE-EFFECT-002`. The fix is to change `pureWrapper` to `guarded flow` and declare `effects [ai.inference]`.

**AI rule:** Effects propagate upward; a caller that does not declare an effect used by its callee receives `SPORE-EFFECT-002`.

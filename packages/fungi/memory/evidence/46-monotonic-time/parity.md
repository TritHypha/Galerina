# Parity for monotonic-time.fungi

Frozen reference commit dc0f9c8c4f1365f0228cda213b2ecd001400463e. This commit does not edit those TypeScript files. REPLACED_BY names the .fungi flow that is the designated replacement. Execution of every row is CARRIED_UNKNOWN until galerina build links the c-boundary import. The clock in this unit is the sealed .fungi runtime port through c-boundary.fungi. It is not Date.now, performance.now, process.hrtime, or setTimeout.

Per-OS monotonic guarantees are CARRIED_UNKNOWN. VM pause, migration and snapshot remain CARRIED_UNKNOWN. RD-1940 platform UNKNOWN stands.

MB-17 capture-once and Reflect.apply apply only to an optional browser embedding adapter. That adapter is CARRIED_UNKNOWN. No JavaScript host call is a mechanism of this unit.

W3: remainingReason 26 (EXPIRED) and any non-zero reason are not success, not proof of zero effect, and not authority to retry. An expiry seen after begin on an out-of-process release does not change DELIVERY_UNKNOWN. COMMITTED stays unreachable (W1). Outcome wording source sha a2dea5a538fd0b1f3857ed702a9a1d4cd53fe7c11606853b728811f2d1306761. RD-0778 cited only as private/research/rd/RD-0778-atomic-hostcall-reply-adjudication-PRIVATE.md sha 9a752d97a761b5b1e44aa620be7ea21ce3091a829fc9e7784d63a014e99dc61a.

## Representation

Point and Duration are not nominal types at this compiler. The checker does not prove a hallmark gate owns construction. Each value is explicit Int slots: epoch plus ticks for a Point, ticks for a Duration. Physical Int is i32. A zero tick result is not success. Callers read the reason first.

There is no match or switch in this file. Compare flows end with return 11. That is the fail-closed arm. No null and no NaN.

| Operation | Check time | Runtime reason |
| --- | --- | --- |
| Point - Point | Admitted as Int slots | Negative ticks 22 before arithmetic. 23 epoch mismatch. 22 backwards. Tick result 0 is success only after reason 0. Refusal ticks are -1. |
| Point + Duration | Admitted as Int slots | Negative inputs 22. Overflow 21 before the add. Success ticks are the sum. Refusal ticks are -1. |
| Duration + Duration | Admitted as Int slots | Negative inputs 22. Overflow 21. Refusal ticks are -1. |
| Point compare | Admitted as Int slots | Negative ticks 22. Then 0 equal, 1 less, 2 greater, 23 epoch mismatch, 11 unlisted. |
| Duration compare | Admitted as Int slots | 0, 1, 2, 22 negative, 11 unlisted. |
| Point + Point | Admitted as Int slots | Negative ticks 22, otherwise 25. |
| Duration - Point | Admitted as Int slots | Negative inputs 22, otherwise 25. |
| Clock mint | readForeignLength | 0 admitted. Negative reading 9. Bad Bool 11. NaN class 3 and unlisted class 11 pass through. Same-epoch backwards 22. hasLast with a different epoch 23. A new-epoch start is CARRIED_UNKNOWN until a sealed epoch-start capability exists. |
| Literal Point constructor | No mintLiteral flow | A caller Int is not a Point until readForeignLength returns 0. The import-linked build remains NEEDS_LANGUAGE. The flattened harness runs the refusal. |
| Deadline remaining | Admitted as Int slots | 0 means REMAINING and remainingTicks is the duration. 26 EXPIRED, including equal ticks. 23 epoch mismatch. Negative ticks 22. Non-zero reason returns remaining ticks -1, which is not time left. |

Deadline is the Point produced by point-plus-duration. There is no third nominal type.

## Production clock sites at dc0f9c8c

| File:line | Call | Disposition |
| --- | --- | --- |
| packages-ts/galerina-framework-app-kernel/src/auth-verify-route.ts:281 | setTimeout type | REPLACED_BY remainingReason. Execution CARRIED_UNKNOWN. |
| packages-ts/galerina-framework-app-kernel/src/auth-verify-route.ts:283 | setTimeout remainingMs | REPLACED_BY remainingReason. Execution CARRIED_UNKNOWN. |
| packages-ts/galerina-framework-app-kernel/src/auth-verify-route.ts:424 | Date.now | REPLACED_BY mintFromClock. Execution CARRIED_UNKNOWN. |
| packages-ts/galerina-framework-app-kernel/src/kernel.ts:80 | performance.now | REPLACED_BY mintFromClock. Execution CARRIED_UNKNOWN. |
| packages-ts/galerina-framework-app-kernel/src/kernel.ts:81 | Date.now | REPLACED_BY mintFromClock. Execution CARRIED_UNKNOWN. |
| packages-ts/galerina-framework-app-kernel/src/kernel.ts:438 | setTimeout flush 0 | CARRIED_UNKNOWN. A zero-delay flush is not a clock point. |
| packages-ts/galerina-framework-app-kernel/src/kernel.ts:1097 | setTimeout deadline type | REPLACED_BY remainingReason. Execution CARRIED_UNKNOWN. |
| packages-ts/galerina-framework-app-kernel/src/kernel.ts:1100 | setTimeout deadline | REPLACED_BY remainingReason. Execution CARRIED_UNKNOWN. |
| packages-ts/galerina-framework-app-kernel/src/registry-durability-production-admission.ts:508 | Date.now default | REPLACED_BY mintFromClock. Execution CARRIED_UNKNOWN. |
| packages-ts/galerina-framework-app-kernel/src/registry-index.ts:13 | comment, no call | Not a clock use. |
| packages-ts/galerina-framework-app-kernel/src/secret-arena-provider.ts:40 | performance.now.bind | REPLACED_BY mintFromClock. The bind is the busy-wait shape this unit does not have. Execution CARRIED_UNKNOWN. |

Test files under that package also call these APIs. They are harness clocks. CARRIED_UNKNOWN. This commit does not edit them. No Signet grant-expiry clock call was found under packages-ts/galerina-framework-app-kernel/src at that commit. Unit 38 stays CARRIED_UNKNOWN until that file is named.

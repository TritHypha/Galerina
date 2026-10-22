# KG-06 follow-up -05 decision

NON_AUTHORIZING. Synthetic data only.

## Chosen

Per-call-site domain matching the ACK'd unit contract. `readForeignSafeInteger` stays the conservative wrapper `[-2147483647, 2147483647]`. New `readForeignI32Integer` admits classTag 0 on the full physical i32 domain, including i32 min, so existing sequential unit gates still emit the ACK'd codes.

Host `--invoke` wraps `2147483648` to i32 min (`-2147483648`). Suite 37 `arenaEpoch` then hits `if lastEpoch < 0` / `if fenceEpoch < 0` and returns 140. Suite 44 `classifyAdapter` then falls through unknown kind to 3 and unlisted audit to 11.

Call sites FIXED: `secret-arena.fungi` lastEpoch, fenceEpoch; `adapter-profile.fungi` kind, audit.

## Rejected

R1 Map helper reason 8 onto 140/3/11 at the caller. Genuine classTag 8 OutOfSafeRange would share the unit code, and the value would never reach the ACK'd gate.

R2 Widen `readForeignSafeInteger` to include i32 min globally. That would change ACK'd 110/4 refusals on every other conservative caller.

R3 Author `lo = -2147483648` on `readForeignBoundedInteger`. KG-06 refused that literal as a domain bound; physical Int is i32 and the unrepresentable `2147483648` unary-minus form is a compiler risk.

R4 Edit ACK'd tests in 31-38 or 43-46.

R5 Change `galerina.mjs` wrap. Suite 45 wrap-vectors stay as residual host behaviour.

## Isolation follow-up

kg01 tests now flatten and `galerina run` with cwd equal to the per-test temp directory so `build/flat.lmanifest` cannot leak. Suites 37 and 44 still flatten to `flat.fungi` and invoke with repo cwd; listed as follow-up, not changed in this brief.

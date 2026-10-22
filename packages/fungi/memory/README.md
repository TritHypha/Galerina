# packages/fungi/memory

**SCAFFOLD ONLY, NON_AUTHORIZING.**

Hand-written `.fungi` memory code will live here. This commit adds the folder, READMEs and a unit manifest. It adds **no** `.fungi` source. RD-1413, RD-1414 and RD-1415 stay **HOLD / NON_AUTHORIZING**. `packages-ts/galerina-framework-app-kernel/src/hold-pin.ts` refuses those acts in TypeScript. This folder does not lift that gate.

## Owner decision (Phillip, 2026-10-17 21:37–23:51 BST)

The memory part (auth/verify route, memory kernel, RD-1413/1414/1415 code: Signet wax-seal, U2 serve gate, U4 delivery, body reader, lease/capability, secret handling) is written **directly in .fungi** in this folder. Old generated `.fungi` (`packages/fungi/products/**`, conversion-overlays, `packages-ts/*/src/self-hosted/**`) and all of `packages-ts/` stay untouched. TypeScript is a **frozen reference / test oracle only**. If a TS design or RD is wrong, abandon that part and redesign it in `.fungi` (see Reply `ABANDONED_TS_DESIGN`).

## Next gate (app-kernel TODO.md:112)

Do not add TS secret-authority logic. Before a Fungi-owned implementation slice, approve the complete design and bind a real protected operation/object-version, authenticated principal and Signet issuer/revoker, provider/key owner, recipient, exact Amazon Linux TCB/profile, protected ingress and output endpoints, revocation/fencing primitive, rollback-resistant freshness authority, Fungi lease/runtime ABI, crypto policy, and finite budgets. Then make the implementation plan and discriminating tests for one loaded route. Windows 10 is remote-only and may not fall back to local plaintext. RD-1413, RD-1414, and RD-1415 remain **HOLD / NON_AUTHORIZING** until the coupled route and independent owner adjudications pass.

## Folder rules

- Hand-written `.fungi` only. Nothing generated.
- TS is oracle only.
- No authoritative `.fungi` memory code until the RD-1413..1415 gate opens.
- Queue 29 obligation ids in `memory-fungi.manifest.json` `obligations` arrays. Registry path on landed branch `grok/fungi-lowering-obligations-20261017` HEAD `5caebad6c32d41a058400fea84d3c25370e5348b`: `docs/superpowers/specs/2026-10-17-fungi-lowering-obligations.registry.json`.
- Unlisted status/verdict refuses.
- `audit:package-topology` scans `packages-ts/` only. This folder is UNGOVERNED by that audit; a GREEN result is typed UNKNOWN for folder contents.

## Standing owner rulings

- No null or NaN; typed uncertainty only.
- Every match/switch ends with an exhaustive fail-closed `_ =>` or default arm that refuses (Rust Ok/Err may omit `_ =>`).
- A shared C-boundary helper turns foreign NULL/NaN/Infinity into typed UNKNOWN/Ambiguous; these values do not exist in .fungi.
- U4: evicted/live/default operation states report DELIVERY_UNKNOWN.
- v1 crypto is hybrid classical + post-quantum behind a swappable modular interface; no v3 crypto work now.
- Rust is only an independent out-of-process verifier; the compiled .fungi runtime contains no Rust.
- No GitHub CI and nothing that triggers it; every commit carries [skip ci]; no force-push, rebase, or --no-verify; nothing deleted without Phillip.
- Synthetic data and keys only; never export RD bodies or keys.
- FULL AUTO: don't stop to ask; make the zero-trust choice and record it. Verify, never assume.


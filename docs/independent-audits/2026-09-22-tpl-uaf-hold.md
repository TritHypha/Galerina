# Independent audit — TPLStateBuffer cannot keep write/read access to a freed-and-reused pool allocation

**Verdict: PASS** (scoped to this named claim). Filename is the requested
`*-hold.md` path; the heading is the verdict.

This is a dirty-candidate review of
`./.worktrees\rd-0873-native-fungi-bootstrap-implementation`
at HEAD `91b4dec08fe4376febc9494a8023bd02912b8695` (branch `main`, dirty).
It is **not** clean-HEAD evidence. Production sources and tests were not
edited by this reviewer. Nothing was committed. This receipt is not the
author’s packet and is not GPT-6 Astra.

Named claim: `TPLStateBuffer` cannot keep write/read access to a
freed-and-reused pool allocation.

1. After `pool.free(tpl.block.ptr)`, `setTrit` / `getTrit` trap `LSM-UAF-001`.
2. After free + realloc at the same `ptr`, a stale TPL `setTrit` traps
   `LSM-UAF-001` and does not change the live tenant’s trit.
3. Assigning `tpl.block.generation = live.block.generation` throws
   `TypeError` (`Object.freeze` on `Block`) and still cannot write the
   live tenant.
4. Assigning `tpl._block = live.block` does not retarget access because
   TPL stores `#block`.

Hostile tests live in
`packages-ts/galerina-core-sentinel-memory/tests/tpl.test.mjs` and import
`../dist/index.js`. `allocate()` returns
`Object.freeze({ ptr, bytes, segment, generation })`. TPL uses
`readonly #block`.

This is **not** 124-scan closure. Scan finding
`csf_cc6db185bcfb679e18ea482a` (`TPL buffer keeps access to a freed and
reused allocation`, medium, `PARTIAL_THIS_TREE`). Inventory after this
slice (file `docs/reports/scan-0f6063dd-inventory-2026-09-22.json`, not
re-scanned here): 94 `OPEN_ON_SCAN_SNAPSHOT` / 26 `PARTIAL_THIS_TREE` /
4 `PATCHED_AUDIT_PENDING` (124 IDs). Not production admission.

Node v24.18.0, Windows win32. This reviewer did not rebuild. Dist is
gitignored. `dist/tpl-state-buffer.js` mtime (`2026-09-23T02:00:30.943Z`)
is newer than dirty `src/tpl-state-buffer.ts` (`2026-09-23T01:59:59.053Z`).
`dist/static-memory-pool.js` mtime (`2026-09-23T02:00:30.933Z`) is newer
than dirty `src/static-memory-pool.ts` (`2026-09-23T01:59:59.047Z`). Dist
is not stale vs src: both have `#block` (6 occurrences, 0 `_block`),
`liveView() → pool.i32(this.#block)`, and `Object.freeze` on allocate
(1 occurrence). `assertLive` still compares `rec.generation !== block.generation`.

Dirty slice for this claim vs HEAD `91b4dec0`: `M`
`packages-ts/galerina-core-sentinel-memory/src/static-memory-pool.ts`
(`return Object.freeze({...})` replacing unfrozen `return { ptr, bytes,
segment, generation }`); `M`
`packages-ts/galerina-core-sentinel-memory/src/tpl-state-buffer.ts`
(`private readonly _block` → `readonly #block`); `M`
`packages-ts/galerina-core-sentinel-memory/tests/tpl.test.mjs` (assert
`LSM-UAF-001` on the pre-existing free test; +3 hostile tests). HEAD
already had generation / `assertLive` / `LSM-UAF-001` on `i32`/`u8`.
Passing tests here are **not** production admission.

Unrelated dirty on this worktree (auth, compiler, photonic, myco, wasm,
receipts, build artifacts, …) was not this claim.

## Source hashes on this tree

| path | sha256 |
|---|---|
| `packages-ts/galerina-core-sentinel-memory/src/tpl-state-buffer.ts` | `e3cf133bf154bf3fae60c383e801f286a1892d42643aef88b2aa93ad58e96444` |
| `packages-ts/galerina-core-sentinel-memory/src/static-memory-pool.ts` | `8a486e8b504b15b03f2ab3d8a0e095f3fd83048544958d851daf2937438bf4d3` |
| `packages-ts/galerina-core-sentinel-memory/dist/tpl-state-buffer.js` | `7fea91a9f64c574237ae7bb1ad0cd41c2c24baaad69fc806137922454f524836` |
| `packages-ts/galerina-core-sentinel-memory/dist/static-memory-pool.js` | `0303ec75522d227cbce8bd96dcf174231c0a51210be26292490078bd18e3e273` |
| `packages-ts/galerina-core-sentinel-memory/tests/tpl.test.mjs` | `26c8ef034ad0b5aaa7bfd62af0d1c815c27f6e3fd53971cb195c3a4781fd002b` |
| `packages-ts/galerina-core-sentinel-memory/dist/index.js` | `8a0a67daeff1b2bebbfa475ce2abd41942d6a8ea7cbd79dbe76a2ec7136dec70` |

Author-named hashes MATCH all five listed files. Independent SHA-256 of
the working-tree bytes.

HEAD (pre-dirty) SHA-256 of the same src/tests:

| path | HEAD sha256 |
|---|---|
| `src/tpl-state-buffer.ts` | `62e0d3da9b3ba7bba9dfa106f16d41aeebf53ed7efe844810ccf8002d9139305` |
| `src/static-memory-pool.ts` | `9545d6e985981f997df3badc98f43e0cf4ff0aafd195e56e5cbef71cf4980a36` |
| `tests/tpl.test.mjs` | `1200536144803c18d1652dd2f0652882cfa8af903c8fac2bf91f80b86659ac53` |

## Requirement-to-evidence matrix

| requirement | evidence |
|---|---|
| After `pool.free(tpl.block.ptr)`, `setTrit` traps `LSM-UAF-001` | source `liveView` 45–48 → `pool.i32(#block)`; pool `assertLive` 188–193; named test `a freed TPL buffer cannot access a reused allocation`; independent probe `set.code=LSM-UAF-001` message `use-after-free / stale handle at ptr 0 (gen 1)` |
| After free, `getTrit` also traps `LSM-UAF-001` | same `liveView`; **not asserted in the named free test** (that test only calls `setTrit`); independent probe `get.code=LSM-UAF-001` |
| After free+realloc at the same `ptr`, stale `setTrit` traps `LSM-UAF-001` | named hostile `stale TPL cannot write a reused allocation after free+realloc`; independent `samePtr=true`, stale gen 1 / live gen 2, `set.code=LSM-UAF-001` |
| Stale write does not change the live tenant’s trit | named `assert.equal(live.getTrit(0), 1)`; independent `liveTritAfterStaleSet=1` |
| `tpl.block.generation = live.block.generation` throws `TypeError` | `allocate` 133 `Object.freeze`; descriptors `writable:false, configurable:false`; named hostile forge test; independent `Cannot assign to read only property 'generation'` |
| After failed forge, stale `setTrit` still `LSM-UAF-001`; live trit unchanged | named test; independent `staleGenAfter=1`, `liveTrit=1` |
| `tpl._block = live.block` does not retarget because TPL stores `#block` | source `readonly #block` 31; getter 99–101 returns `#block`; named hostile `assigning _block cannot retarget`; independent: public `_block` becomes live, getter still gen 1, `set.code=LSM-UAF-001`, `liveTrit=1` |
| HEAD-shaped unfrozen `Block` + public `_block` would ALLOW write | reconstructed (not production): forge `threw:false`, live trit `1 → -1`; retarget `threw:false`, live trit `1 → -1` |
| Dist not stale vs src | `#block` 6/6, `_block` 0/0, `Object.freeze` 1/1, `liveView i32(#block)` true/true |

## Command receipts

1. `node --test --test-timeout=30000 packages-ts/galerina-core-sentinel-memory/tests/tpl.test.mjs packages-ts/galerina-core-sentinel-memory/tests/pool.test.mjs`
   → **23/23 pass**, 0 fail, `duration_ms 161.8454`. Node v24.18.0.

   tpl.test.mjs (10):
   - `setTrit / getTrit round-trips -1, 0, +1` — green
   - `loadTrits + toArray round-trips a 40-trit vector across word boundaries` — green
   - `setTrit with an out-of-domain value throws LSM-TRIT-RANGE` — green
   - `getTrit out of index throws LSM-TRIT-INDEX` — green
   - `byteLength + block reflect the allocated compute block` — green
   - `a freed TPL buffer cannot access a reused allocation` — **red detector** (`LSM-UAF-001`)
   - `hostile: stale TPL cannot write a reused allocation after free+realloc` — **red detector**
   - `hostile: forging Block.generation cannot alias a reused TPL allocation` — **red detector** (`TypeError` then `LSM-UAF-001`)
   - `hostile: assigning _block cannot retarget a stale TPL onto a live allocation` — **red detector**
   - `corruption sentinel (enc=3) read trips LSM-TRIT-CORRUPT` — green

   pool.test.mjs (13): all green, including still-free `LSM-UAF-001`, free+realloc ABA `LSM-UAF-001`, and compute scrub-to-`0xFF` / i32 `-1`.

Independent extra probes (eval only; import `dist/index.js`; not production):

- free then stale `setTrit` → `SecurityTrap LSM-UAF-001`
- free then stale `getTrit` → `SecurityTrap LSM-UAF-001`
- free+realloc same `ptr`, stale `setTrit` / `getTrit` → `LSM-UAF-001`; live trit stays `1`
- `Object.isFrozen(tpl.block) === true`; own keys of a TPL instance are `tritCount`, `pool` (no public `_block`)
- `stale.block.generation = live.block.generation` → `TypeError`
- `Object.defineProperty(stale.block, 'generation', …)` → `TypeError: Cannot redefine property: generation`
- `Object.assign(stale.block, { generation })` → `TypeError`
- after those forges, stale `setTrit` still `LSM-UAF-001`; live trit `1`
- `stale._block = live.block` sets a public own property; `stale.block` getter still returns gen-1 `#block`; stale `setTrit` `LSM-UAF-001`; live trit `1`
- `stale.block = live.block` → `TypeError: Cannot set property block of #<TPLStateBuffer> which has only a getter`; subsequent stale `setTrit` still `LSM-UAF-001`
- HEAD-shaped reconstruction (unfrozen Block copy + public `_block`, not production): forge ALLOW, live trit `1 → -1`; `_block` retarget ALLOW, live trit `1 → -1`
- production contrast on the same two attacks: both DENY, live trit `1`

## Challenge 1 — after free, can stale TPL still setTrit / getTrit?

**No. CONFIRMED refused.** `liveView` revalidates via `pool.i32(#block)` →
`assertLive`. Named free test (setTrit) and independent set/get probes
all returned `LSM-UAF-001`. Detector can go red.

## Challenge 2 — after free+realloc at the same ptr, can stale TPL write the live tenant?

**No. CONFIRMED refused.** Same ptr, generation mismatch (1 vs 2). Named
hostile and independent probe: stale `setTrit` `LSM-UAF-001`, live
`getTrit(0) === 1`. Detector can go red.

## Challenge 3 — can forging Block.generation alias the reused allocation?

**No. CONFIRMED refused** on the TPL handle. `allocate` returns
`Object.freeze`; assignment / `defineProperty` / `Object.assign` throw
`TypeError`. Stale generation stays 1. Stale `setTrit` still
`LSM-UAF-001`. Live trit unchanged. Detector can go red.

Named test wraps the assignment in `if (forged !== null)` so a missing
freeze would skip the `TypeError` assert and rely on the later UAF
assert. Independent probe does **not** take that branch: freeze is
present and assignment always throws.

## Challenge 4 — can assigning `_block` retarget a stale TPL onto the live allocation?

**No. CONFIRMED refused.** TPL stores `#block`. Assigning public
`_block` does not change `liveView`. Getter still returns gen-1.
Independent: `public_block_is_live=true`, `getter_is_live=false`,
`getter_gen=1`, `live_gen=2`. Stale `setTrit` `LSM-UAF-001`. Live trit
unchanged. Detector can go red.

## Challenge 5 — would HEAD-shaped unfrozen Block + public `_block` ALLOW the write?

**Yes, on a reconstruction (not production).** HEAD allocate returned a
mutable object; HEAD TPL stored `private readonly _block` (a public JS
own property). Reconstruction: forge generation then `setTrit(-1)`
succeeds and live trit becomes `-1`; `stale._block = live.block` then
`setTrit(-1)` succeeds and live trit becomes `-1`. Current dist refuses
both. This is the discriminating HEAD vs dirty-slice check.

## Residuals (do not fail the named TPL claim)

1. **Cached `Int32Array` from `pool.i32` taken while live still aliases
   bytes after free (and after realloc).** `i32` / `u8` return a view over
   the backing `ArrayBuffer`. `assertLive` runs only at view construction.
   Independent: cache `view = pool.i32(tpl.block)`, free, realloc same
   ptr, `live.setTrit(0, 1)` → trit `1`, then `view[0] = 0x22222222`
   succeeds; live `getTrit(0)` becomes `-1`; live word `572662306`
   (`0x22222222`). This is a pool-view lifetime hole, not a TPL handle
   hole. Not closed by `#block` / freeze.

2. **Recycled compute fill is `0xFF` (invalid packed-trit start state).**
   TPL allocates the `compute` segment. `free` fills compute with `0xFF`
   (governance uses `0x00`). Independent: virgin TPL (zeroed
   `ArrayBuffer`) `getTrit(0) === -1` without a prior `setTrit`; after
   free+realloc, first 8 bytes are `255`, `i32[0] === -1`, `getTrit(0)`
   throws `LSM-TRIT-CORRUPT` (`0b11` sentinel). Constructor calls
   `pool.i32(#block)` but does not initialize packed trits. Related low
   finding on invalid packed-trit start state. Not this named UAF claim.

3. **Forged copy `Block` passed to `pool.i32` (not the TPL path).**
   `assertLive` matches `ptr` + `generation`, not object identity.
   Independent: `const copy = { ...stale.block, generation: live.block.generation }`;
   `pool.i32(copy)` ALLOWS a write that makes live `getTrit(0)` throw
   `LSM-TRIT-CORRUPT`. Freeze is per returned object; a spread copy is
   unfrozen. TPL cannot be aimed this way because it never substitutes
   `#block`. Out of the named TPL claim; pool API still accepts a
   structurally matching handle.

## What this is not

- Not clean-HEAD evidence.
- Not production admission.
- Not Astra / not GPT-6 Astra.
- Not 124-scan closure. `csf_cc6db185bcfb679e18ea482a` remains
  `PARTIAL_THIS_TREE` (cached i32 alias + compute `0xFF` start state
  remain). Inventory cited above, not re-counted from a new scan.
- Not a commit, merge, push, sign, or `.fungi` touch.
- Reviewer did not edit production or tests. Receipt only.

## Pin

- Worktree: `./.worktrees\rd-0873-native-fungi-bootstrap-implementation`
- HEAD: `91b4dec08fe4376febc9494a8023bd02912b8695`
- Branch: `main` (dirty)
- Node: v24.18.0
- Command: `node --test --test-timeout=30000 packages-ts/galerina-core-sentinel-memory/tests/tpl.test.mjs packages-ts/galerina-core-sentinel-memory/tests/pool.test.mjs` → 23/23 pass, 161.8454 ms
- Scan finding: `csf_cc6db185bcfb679e18ea482a` `PARTIAL_THIS_TREE`

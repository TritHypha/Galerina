# RD-0135 — TritMesh database scaling limits (AZT honesty bar)

- **Date:** 2026-06-26 · **Status:** ⏸ **DEFERRED (owner hold — do NOT action yet)**
- **Domain:** **TritMesh** (the separate DATABASE/umbrella brand — NOT Galerina the compiler; tracked here only
  because the owner grouped it with the deferred-R&D notes). · **Source:** `notes/72-tritmesh-limits.md`

## Summary
Does TritMesh hit an architectural "brick wall" at scale (like a relational DB's "max columns")? Candid answer in
the note: **no "max columns"** — TritMesh is a Mycelium-style Any-Sync P2P **graph** (nodes + edges), not rigid 2D
tables, so adding N properties = adding edges, not widening a fixed-size page. But under the **Absolute Zero-Trust
(AZT) honesty bar** it DOES have hard physical walls — just different ones (the note enumerates the real ceilings
rather than claiming "infinite").

## ⚠ Scope note
This is **TritMesh-domain R&D**, not Galerina-compiler. Per the brand scoping (Galerina is OUTSIDE TritMesh's scope),
do not fold TritMesh DB claims into Galerina positioning. The RD-0132 taxonomy (Hyphae/Sclerotia/Lamella/Apex/Flux)
is forward-vision — do NOT imply it ships.

## Status
DEFERRED. See [[galerina-rd-0132-branding-ecosystem]].

# ISO 4217 pinned snapshot — provenance (the RD-0349 I1 unblock)

> **VENDORED COPY.** The authoritative home of this snapshot is the engineering KB. It is
> duplicated here so Galerina builds standalone — the generator and its drift gate must not
> depend on a sibling repo being checked out. The copy is byte-identical (same SHA-256 below);
> a divergence would trip the generator's pin check before a single byte is parsed.
>
> ⚠️ **OPEN — REDISTRIBUTION TERMS ARE NOT STATED (owner decision, flagged 2026-07-17).**
> The owner authorised *fetching* this file; that is not the same as *redistributing* it. This
> repository is Apache-2.0 with a public-facing origin, so vendoring a third-party publication
> here is a redistribution act, and the terms under which the maintenance agency publishes List
> One are not recorded anywhere in this document. The repo's `audit-license-compat.mjs` did NOT
> clear this: it scans first-party **package** dependencies, not vendored **data**, so its green
> is silence, not permission. Until the terms are confirmed, treat this file as provisional.
>
> **If redistribution is declined, the fallback is small and already designed for:** delete this
> XML, keep `unit-registry.generated.ts` (which carries only the *facts* — currency codes and
> their decimal places — not the source document), and point the generator's `SNAPSHOT` at the
> KB copy. The cost is that the drift gate can then only run where the KB is checked out, which
> is a real loss of protection and the reason the vendored copy is preferred.

**Artifact:** `list-one-2026-07-16.xml` (this directory)
**Source:** the ISO 4217 maintenance agency (SIX Group) official publication endpoint — List One (current
currency & funds), fetched over HTTPS on **2026-07-16** under the owner's unlock of the same day.
**List's own publication date:** `Pblshd="2026-01-01"`.
**SHA-256:** `838DFB991648CF36DF939EDD5FE3811737962B75A32252847D239CEDD1E291C9`
**Size:** 47,463 bytes · **Entries:** 280 `<CcyNtry>` records.

## The laws that bind every consumer (U-LAW-4, the tracking-board support sheet §2)

1. **One-way generation.** The Galerina runtime unit table is *generated from* this snapshot — never edited by
   hand, never regenerated from any other source. The generator records this file's SHA-256 into its output
   header as provenance.
2. **Drift gate.** A gate goes RED if the generated table and this snapshot diverge (regenerate-and-diff). A red
   drift gate means someone touched the table by hand or swapped the snapshot — both are findings, not noise.
3. **Snapshot updates are owner ceremonies.** A new ISO publication = a new dated file beside this one + an
   updated pin in the generator + the old file retained (dated records are history). Never overwrite in place.
4. **Reserved/test codes are explicit.** `XXX` (no currency), the 9xx test/fund codes, and superseded entries are
   handled by explicit generator policy (include-with-flag or exclude-with-note) — never silently included
   because they happened to be in the XML.

**For main:** vendor this file + this sidecar into Galerina beside the I4 generator, wire the drift gate, and I1
closes as a generator run. The KB copy here is the family's pinned reference; the vendored copy is the build
input — both carry the same hash by law.

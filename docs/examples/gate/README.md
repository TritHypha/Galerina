# `.gate` — authoring examples, guide, and rules

`.gate` is Galerina's **light-ASCII "draw-don't-code" authoring language** (`SPEC-gate-language.md` v0.4). This folder is the
practical, AI-oriented on-ramp: **checker-verified examples** + a **how-to guide** + the **rules**.

> `.gate` is *source* — it compiles (together with `.fungi`) into one **GIR → WASM**. It is **not** an IR and **not** the runtime
> language. For the compiled **GIR** artifacts, see [`docs/examples/gir/`](../gir/). Sign the IR, never the `.gate` source.

## Contents
- **[AI-AUTHORING-GUIDE.md](AI-AUTHORING-GUIDE.md)** — how to author `.gate`: the map mental model, the eight glyphs, the canonical
  patterns, the DO/DON'T hallucination guard, and the verify loop.
- **[RULES.md](RULES.md)** — the fail-closed invariants the reference checker enforces (R1–R13), each with its rationale.
- **Examples — all five pass `tools/gate-check.mjs` (SPEC v0.4):**
  | file | pattern |
  |---|---|
  | [`01-authorized-read.gate`](01-authorized-read.gate) | authorised read + PII redaction (K3 auth-gate + privacy-cut) |
  | [`02-write-transaction.gate`](02-write-transaction.gate) | governed write (refund); shows the posture-B interim warning |
  | [`03-phi-redaction.gate`](03-phi-redaction.gate) | healthcare PHI — two protected fields cut before egress |
  | [`04-tenant-scoped-search.gate`](04-tenant-scoped-search.gate) | tenant isolation + bounded loop (`decreases`) + re-auth + panic drain `[!]` — the IDOR-kill shape |
  | [`05-token-verify.gate`](05-token-verify.gate) | SecureString / `secret.read`; panic on bad signature; re-auth on the expired arm; token cut before egress |

## Verify an example
```
GALERINA_ROOT=<path-to-Galerina>  node <ZT-Galerina-GRAPH-ASCII-v2>/tools/gate-check.mjs 01-authorized-read.gate
```
**Unknown ⇒ REJECT**, so a green result means the map is structurally valid. The reference checker + full normative spec live in the
`ZT-Galerina-GRAPH-ASCII-v2` workspace (`tools/gate-check.mjs`, `SPEC-gate-language.md` v0.4); more `.gate` examples are in its
`examples/` directory.

## The one-line summary
Draw a map, don't write code. Every `?` gets three arms; every sensitive read passes through a `:cut` before egress; deny arms drain;
a passing map never authorizes — the signed capability does.

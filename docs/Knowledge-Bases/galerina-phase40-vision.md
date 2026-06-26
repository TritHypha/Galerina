# Galerina 1.0 — Vision Statement

## What Galerina 1.0 Is

Galerina 1.0 is a governed programming language where every deployed program is
provably correct by construction. The compiler does not merely check code — it
produces a cryptographically signed proof that every flow respects its declared
effects, capabilities, privacy policy, and audit requirements. That proof travels
with the program into production.

## The Core Bet

Most security failures are not mysteries. They are known patterns — SQL injection,
unvalidated input reaching a sink, secrets logged in plaintext, PHI returned to
an unauthorised caller — that slipped past review. Galerina makes these patterns
compile errors rather than runtime surprises.

The compiler is the security team's first employee. It works every build, it never
gets tired, and it signs its work.

## What Stage B Means

When the Galerina compiler compiles itself, the circle closes. The compiler is no
longer a TypeScript program that reasons about Galerina programs. It is a Galerina
program that reasons about Galerina programs. The governance rules the compiler
enforces on user code are the same rules it must satisfy itself. Self-hosting is
not a technical milestone — it is a proof of language maturity. A language ready
to govern production systems must be able to govern its own construction.

## What Production Looks Like

A Galerina 1.0 production deployment has four properties that no other language
stack provides by default:

1. **Capability proof.** Every effect the program can perform is declared at
   compile time. The runtime enforces the declaration. Nothing executes without
   a matching capability grant.

2. **Audit chain.** Every governed execution produces a hash-linked audit record.
   A third party can verify the audit chain without access to the source code.
   The chain proves what happened, what capability was exercised, and whether any
   PHI or secret was accessed.

3. **Governance above the target.** Whether the program runs on a CPU interpreter,
   a WASM binary, a Deno edge function, or an NPU kernel, the same governance
   rules apply. The target changes. The proof does not.

4. **Composable policy.** Organisations do not write governance from scratch.
   They compose certified packages with known capability sets. The HIPAA template
   is a contract set. The PCI-DSS pattern is a contract set. Governance is
   reusable, versioned, and auditable like any other dependency.

## The 10× Performance Bound

Galerina 1.0 does not compete with C or Rust on raw throughput. It competes on
governed throughput. The target is: a Galerina governed flow is within 10× of the
equivalent ungoverned Node.js code. Governance is not free — it adds audit writes,
capability checks, and proof construction. 10× is the bound at which governance
stops being a performance argument and becomes an organisational choice.

The performance work in Phases 30–36 (register-VM executor, NaN-boxing, binding
slots, WASM SIMD, NPU dispatch) is specifically aimed at shrinking the governance
overhead to fit inside that 10× bound.

## Who Galerina 1.0 Is For

Galerina 1.0 is for teams building systems where the cost of a security failure
exceeds the cost of a slower velocity. Healthcare providers processing PHI. Fintech
companies handling cardholder data. AI companies deploying inference that touches
personally identifiable information. SaaS products that want to say — and prove —
that their governed flows never log what they should not.

These teams do not want a security checklist. They want a compiler that makes the
checklist unnecessary.

## The Self-Hosting Proof

`verify-selfhost` is the final test of Phase 40. Three compilation passes:

```
B1: TypeScript bootstrap compiles Galerina source → binary-1
B2: binary-1 compiles Galerina source → binary-2
B3: binary-2 compiles Galerina source → binary-3
```

If `hash(binary-2) == hash(binary-3)`, Galerina 1.0 is self-hosting and
deterministic. The compiler has proven it can govern itself.

That is what version 1.0 means.

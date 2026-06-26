# Architecture Self-Verification Questions

## Purpose

These questions force the Galerina architecture to prove itself. They should be answered clearly in the documentation and validated by the implementation before shipping.

## Security Core Questions

```text
1. What must never be allowed to happen?
   → Defines the security core.

2. What is the smallest trusted core?
   → Keep Authority Control/Sheriff tiny.

3. What can be passive?
   → CPU/GPU/TPU/modules should execute, not decide authority.

4. What is governed at compile time vs runtime?
   → Avoid checking everything too late.

5. What is the minimum viable Governed IR?
   → The next major design milestone.

6. What data must never cross which boundary?
   → Especially secrets, AI memory, customer data, accelerator memory.

7. What should be impossible by syntax?
   → Inheritance, hidden globals, eval, monkey patching, raw authority.

8. What can be fast-pathed safely?
   → Verified Fast Pipes only reuse verified certainty.

9. What must always be audited?
   → Policy decisions, capability grants, hardware use, AI/tool actions, output filtering.

10. What should Galerina refuse to optimise?
    → Anything that hides authority, mutation, data flow, or security proof.
```

## Runtime-Shaping Questions

```text
11. Which parts of the runtime are trusted, semi-trusted, and untrusted?
12. What happens if the Director's plan is wrong?
13. What happens if the Balancer selects overloaded hardware?
14. What happens if the Scheduler loses ordering?
15. What happens if the Assembler receives partial failure?
16. What happens if the Response Gate blocks output?
17. What happens if policy changes during execution?
18. How are fast paths invalidated?
19. How are runtime budgets enforced?
20. How does the runtime kill unsafe work cleanly?
```

## Future Compute Questions

```text
21. What should stay electronic even in a photonic future?
22. What workloads are worth optical conversion?
23. What precision loss is acceptable?
24. How does Galerina represent tensor/signal/stream compute?
25. How does Governed IR avoid binary-only assumptions?
```

## AI-Native Questions

```text
26. Can AI explain why a runtime decision happened?
27. Can AI find the right file/spec/test quickly?
28. Can AI-generated code request authority but not grant it?
29. Can AI audit whether tests match the architecture graph?
30. Can AI safely refactor without changing authority?
```

## The Most Critical Next Question

```text
What is the minimum Governed IR that proves Galerina is different?
```

This is the design milestone that proves Galerina's governance model is real and not just theoretical.

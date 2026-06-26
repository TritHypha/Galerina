# Galerina Syntax Reference Files

This folder contains one-file-per-feature syntax notes for Galerina.

The folder name is currently `docs/sytax/` to match the active project request. If the project later standardises on `docs/syntax/`, move this folder and update all links in one change.

---

## Rule

When adding or changing Galerina syntax, update:

```text
docs/syntax.md
docs/sytax/<feature>.md
docs/sytax-examples/<feature>.md
docs/feature-status.md
docs/pending-additions.md
TODO.md
CHANGELOG.md
```

The per-feature file should show:

```text
purpose
status
grammar direction
minimal examples
security rules
report output
open parser/runtime work
```

Matching examples should live in `docs/sytax-examples/` and show both good and bad usage.

For a status table of common syntax and logic features, see
`docs/syntax-logic-status.md`.

---

## Files

```text
async-dart-flutter.md
structured-await.md
api-data-security-and-load-control.md
api-duplicate-detection-and-idempotency.md
auth-token-verification.md
backend-compute-targets.md
device-capability-boundaries.md
js-ts-framework-targets.md
patterns-and-regex.md
text-ai-package-boundaries.md
```

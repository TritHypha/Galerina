# Galerina Syntax Examples

This folder contains one-file-per-feature examples showing how to use Galerina syntax and how not to use it.

The folder name is currently `docs/sytax-examples/` to match the active `docs/sytax/` request. If the project later standardises on `syntax`, move both folders together.

---

## Rule

When adding or changing Galerina syntax, update:

```text
docs/sytax/<feature>.md
docs/sytax-examples/<feature>.md
docs/syntax.md
docs/feature-status.md
docs/pending-additions.md
TODO.md
CHANGELOG.md
```

Each examples file should include:

```text
good examples
bad examples
why the bad examples are unsafe or inefficient
expected diagnostics or reports
```

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

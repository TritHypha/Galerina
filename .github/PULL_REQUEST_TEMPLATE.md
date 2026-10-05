<!-- Policy: packages-ts/galerina-core/GIT.md "Current policy". Branch: <owner>/<topic>-<yyyymmdd>. Title: type(scope): subject -->

## Summary

<!-- What changes and why, in a few lines. -->

## Affected areas

<!-- Packages, docs, scripts, workflows. -->

## Generated files

<!-- If any generated file changed, give the generator command that produced it. Write "none" otherwise. -->

## Tests and gates

- [ ] Tests added or updated, and the commands I ran are listed here
- [ ] `node scripts/audit-package-border.mjs` passes
- [ ] `node scripts/audit-path-leak.mjs` passes (docs-only PRs too)
- [ ] No secrets, `.env` files, source maps or build output committed
- [ ] CHANGELOG updated if this changes syntax, structure, security rules, targets or public APIs

## Review notes

<!-- Risks, follow-ups, held items. No self-merge: main needs green CI and a reviewer. -->

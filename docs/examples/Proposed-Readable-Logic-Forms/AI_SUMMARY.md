## What this level teaches

- Readable Logic Forms are a set of PROPOSED syntax aliases — they are NOT part of the current grammar
- `status is Active` as a readable alias for `status == Active` (not yet in parser)
- `status is not Active` as a readable alias for `status != Active`
- `and` / `or` as readable aliases for `&&` / `||`
- `unless <condition>` as a readable alias for `if !<condition>`
- How readable forms would map to the same AST nodes as their canonical equivalents
- Governance conditions expressed in natural English (`is greater than or equal to`, `is not`)
- These examples show the canonical (current, valid) form alongside the proposed readable form

## Canonical patterns

```spore
// Current valid form (always use this until Readable Logic Forms are adopted)
if status == Active {
  return Ok("active")
}

// Proposed readable alias (commented out — not in grammar yet)
// if status is Active {
//   return Ok("active")
// }
```

```spore
// Current valid boolean operators
if isActive && isVerified { return Ok("proceed") }
if isAdmin  || isOwner    { return Ok("allowed") }

// Proposed readable aliases (not in grammar yet)
// if isActive and isVerified { return Ok("proceed") }
// if isAdmin  or isOwner    { return Ok("allowed") }
```

## Do not use in this level

- `result of X else Y` (proposal only — use `Result<T, E>`)
- Any proposed readable form in production code until the grammar formally adopts it
- `is`, `is not`, `and`, `or`, `unless` as keywords in current code — they are reserved for this proposal only
- Treating these examples as canonical — they illustrate future intent, not current rules

## Key diagnostics this level demonstrates

| Code | Meaning |
|------|---------|
| (none yet) | Readable Logic Forms are not in the parser; no diagnostics are defined for them |
| Future: `SPORE-SYNTAX-RLF-001` | Proposed: readable alias used in a context where the canonical form is required |

## Example IDs at this level

010-readable-equality, 011-readable-comparison, 020-readable-boolean, 030-readable-unless, 040-governance-readable

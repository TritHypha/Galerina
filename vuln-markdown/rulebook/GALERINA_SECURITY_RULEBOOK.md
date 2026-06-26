# Galerina Security Rulebook

Generated: `2026-05-22T07:58:26Z`

## Safety Boundary

This rulebook is defensive governance guidance for runtime and language design. It must not be used to generate exploit payloads, attack chains, offensive automation, or automatic enforcement without human review.

## Source Summary

- input_rule_count: 64
- curated_rule_count: 29

## Review Queue Summary

- `LN-SEC-2026-004` Untrusted Input Boundary Enforcement - CWE-20, RubyGems -> `keep` (evidence=1.0, confidence=0.7)
- `LN-SEC-2026-035` Weakness Cwe 1067 Review Rule -> `keep` (evidence=0.86, confidence=0.57)
- `LN-SEC-2026-038` Weakness Cwe 17 Review Rule -> `keep` (evidence=0.86, confidence=0.57)
- `LN-SEC-2026-039` Weakness Cwe 178 Review Rule -> `keep` (evidence=0.86, confidence=0.57)
- `LN-SEC-2026-040` Weakness Cwe 19 Review Rule -> `keep` (evidence=0.86, confidence=0.57)
- `LN-SEC-2026-041` Weakness Cwe 20 Review Rule -> `keep` (evidence=0.86, confidence=0.57)
- `LN-SEC-2026-042` Weakness Cwe 200 Review Rule -> `keep` (evidence=0.97, confidence=0.74)
- `LN-SEC-2026-046` Weakness Cwe 264 Review Rule -> `keep` (evidence=0.92, confidence=0.66)
- `LN-SEC-2026-047` Weakness Cwe 269 Review Rule -> `keep` (evidence=0.86, confidence=0.57)
- `LN-SEC-2026-048` Weakness Cwe 276 Review Rule -> `keep` (evidence=0.86, confidence=0.57)
- `LN-SEC-2026-051` Weakness Cwe 287 Review Rule -> `keep` (evidence=0.86, confidence=0.57)
- `LN-SEC-2026-052` Weakness Cwe 290 Review Rule - Remote User Affects Server State -> `keep` (evidence=0.91, confidence=0.57)
- `LN-SEC-2026-054` Weakness Cwe 327 Review Rule -> `keep` (evidence=0.86, confidence=0.57)
- `LN-SEC-2026-056` Weakness Cwe 384 Review Rule - Remote User Affects Server State -> `keep` (evidence=0.91, confidence=0.57)
- `LN-SEC-2026-057` Weakness Cwe 400 Review Rule -> `keep` (evidence=0.86, confidence=0.57)
- `LN-SEC-2026-059` Weakness Cwe 434 Review Rule -> `keep` (evidence=0.86, confidence=0.57)
- `LN-SEC-2026-060` Weakness Cwe 476 Review Rule - Remote User Affects Server State -> `keep` (evidence=0.91, confidence=0.57)
- `LN-SEC-2026-061` Weakness Cwe 77 Review Rule - Remote User Affects Server State -> `keep` (evidence=0.91, confidence=0.57)
- `LN-SEC-2026-062` Weakness Cwe 78 Review Rule -> `keep` (evidence=0.92, confidence=0.66)
- `LN-SEC-2026-003` State-Changing Request Intent Verification - CWE-352, RubyGems -> `merge` (evidence=1.0, confidence=0.7)
- `LN-SEC-2026-007` Untrusted Input Boundary Enforcement - CWE-79, RubyGems -> `merge` (evidence=1.0, confidence=0.87)
- `LN-SEC-2026-012` Native Boundary Isolation Requirement -> `merge` (evidence=1.0, confidence=0.87)
- `LN-SEC-2026-018` Filesystem Boundary Governance - CWE-22, RubyGems -> `merge` (evidence=1.0, confidence=0.87)
- `LN-SEC-2026-021` Plaintext Secrets Review Rule -> `merge` (evidence=0.96, confidence=0.57)
- `LN-SEC-2026-025` Race Condition Review Rule -> `merge` (evidence=1.0, confidence=0.87)
- `LN-SEC-2026-028` Trust Boundary Dependency Boundary Risk Review Rule -> `needs_human_review` (evidence=0.94, confidence=0.87)
- `LN-SEC-2026-031` Trust Boundary Privilege Boundary Crossing Review Rule -> `needs_human_review` (evidence=0.94, confidence=0.87)
- `LN-SEC-2026-032` Trust Boundary Remote User Affects Server State Review Rule -> `needs_human_review` (evidence=0.94, confidence=0.87)
- `LN-SEC-2026-034` Trust Boundary Web Request Boundary Review Rule -> `needs_human_review` (evidence=0.76, confidence=0.57)

## Rules

## LN-SEC-2026-004: Untrusted Input Boundary Enforcement - CWE-20, RubyGems

Rulebook Status: `needs_human_review`
Recommended Action: `keep`
Action Reason: Evidence is sufficient for a standalone rulebook draft entry.
Evidence Score: `1.0`
Confidence Score: `0.7`
Merge Group: `deserialization-boundary`

### Governance Principle

Repeated injection findings indicate that untrusted input must not cross parser, query, or command boundaries without explicit validation and capability policy.

### Galerina Invariant

Untrusted values crossing interpreter, query, template, command, or parser boundaries require governed validation and typed capability approval.

### Generic Runtime Invariant

Track trust labels at runtime and audit untrusted-to-sensitive boundary crossings.

## Syntax Guidance

Require explicit trust annotations for values used in sensitive parser or query contexts.

## Compiler Guidance

Reject implicit flows from untrusted inputs into sensitive sinks without a validator or encoder contract.

## Runtime Guidance

Track trust labels at runtime and audit untrusted-to-sensitive boundary crossings.

## Deny Guidance

Deny execution when untrusted input reaches a sensitive sink without an approved capability.

## Audit Guidance

Audit validation decisions and sensitive sink invocations.

## Sandbox Guidance

Not proposed.

## Dependency Guidance

Not proposed.

### Merged From

- LN-SEC-2026-004

### Supporting Evidence Summary

- count: 5
- unique_identities: 3
- has_cve_or_ghsa: 5
- with_references: 5

### Evidence Sample

- CVE-2009-4492
- CVE-2009-4492
- CVE-2013-0156
- CVE-2013-0285
- CVE-2013-0285

### Human Review Notes

- Human review is required before this rule is accepted or enforced.
- Validate that the invariant is runtime/language-level rather than product-specific.


## LN-SEC-2026-035: Weakness Cwe 1067 Review Rule

Rulebook Status: `needs_human_review`
Recommended Action: `keep`
Action Reason: Evidence is sufficient for a standalone rulebook draft entry.
Evidence Score: `0.86`
Confidence Score: `0.57`
Merge Group: `weakness-cwe-1067-review-rule`

### Governance Principle

Recurring analyzed records indicate a potentially reusable governance pattern that requires human review.

### Galerina Invariant

Potential runtime governance invariant requires human review before rule promotion.

### Generic Runtime Invariant

Review whether this pattern should become a runtime governance policy.

## Syntax Guidance

Not proposed.

## Compiler Guidance

Not proposed.

## Runtime Guidance

Review whether this pattern should become a runtime governance policy.

## Deny Guidance

Not proposed.

## Audit Guidance

Audit related events while the pattern is under review.

## Sandbox Guidance

Not proposed.

## Dependency Guidance

Not proposed.

### Merged From

- LN-SEC-2026-035

### Supporting Evidence Summary

- count: 2
- unique_identities: 1
- has_cve_or_ghsa: 2
- with_references: 2

### Evidence Sample

- CVE-1999-0011
- CVE-1999-0011

### Human Review Notes

- Human review is required before this rule is accepted or enforced.
- Validate that the invariant is runtime/language-level rather than product-specific.


## LN-SEC-2026-038: Weakness Cwe 17 Review Rule

Rulebook Status: `needs_human_review`
Recommended Action: `keep`
Action Reason: Evidence is sufficient for a standalone rulebook draft entry.
Evidence Score: `0.86`
Confidence Score: `0.57`
Merge Group: `weakness-cwe-17-review-rule`

### Governance Principle

Recurring analyzed records indicate a potentially reusable governance pattern that requires human review.

### Galerina Invariant

Potential runtime governance invariant requires human review before rule promotion.

### Generic Runtime Invariant

Review whether this pattern should become a runtime governance policy.

## Syntax Guidance

Not proposed.

## Compiler Guidance

Not proposed.

## Runtime Guidance

Review whether this pattern should become a runtime governance policy.

## Deny Guidance

Not proposed.

## Audit Guidance

Audit related events while the pattern is under review.

## Sandbox Guidance

Not proposed.

## Dependency Guidance

Not proposed.

### Merged From

- LN-SEC-2026-038

### Supporting Evidence Summary

- count: 2
- unique_identities: 1
- has_cve_or_ghsa: 2
- with_references: 2

### Evidence Sample

- CVE-1999-0179
- CVE-1999-0179

### Human Review Notes

- Human review is required before this rule is accepted or enforced.
- Validate that the invariant is runtime/language-level rather than product-specific.


## LN-SEC-2026-039: Weakness Cwe 178 Review Rule

Rulebook Status: `needs_human_review`
Recommended Action: `keep`
Action Reason: Evidence is sufficient for a standalone rulebook draft entry.
Evidence Score: `0.86`
Confidence Score: `0.57`
Merge Group: `weakness-cwe-178-review-rule`

### Governance Principle

Recurring analyzed records indicate a potentially reusable governance pattern that requires human review.

### Galerina Invariant

Potential runtime governance invariant requires human review before rule promotion.

### Generic Runtime Invariant

Review whether this pattern should become a runtime governance policy.

## Syntax Guidance

Not proposed.

## Compiler Guidance

Not proposed.

## Runtime Guidance

Review whether this pattern should become a runtime governance policy.

## Deny Guidance

Not proposed.

## Audit Guidance

Audit related events while the pattern is under review.

## Sandbox Guidance

Not proposed.

## Dependency Guidance

Not proposed.

### Merged From

- LN-SEC-2026-039

### Supporting Evidence Summary

- count: 2
- unique_identities: 1
- has_cve_or_ghsa: 2
- with_references: 2

### Evidence Sample

- CVE-1999-0239
- CVE-1999-0239

### Human Review Notes

- Human review is required before this rule is accepted or enforced.
- Validate that the invariant is runtime/language-level rather than product-specific.


## LN-SEC-2026-040: Weakness Cwe 19 Review Rule

Rulebook Status: `needs_human_review`
Recommended Action: `keep`
Action Reason: Evidence is sufficient for a standalone rulebook draft entry.
Evidence Score: `0.86`
Confidence Score: `0.57`
Merge Group: `weakness-cwe-19-review-rule`

### Governance Principle

Recurring analyzed records indicate a potentially reusable governance pattern that requires human review.

### Galerina Invariant

Potential runtime governance invariant requires human review before rule promotion.

### Generic Runtime Invariant

Review whether this pattern should become a runtime governance policy.

## Syntax Guidance

Not proposed.

## Compiler Guidance

Not proposed.

## Runtime Guidance

Review whether this pattern should become a runtime governance policy.

## Deny Guidance

Not proposed.

## Audit Guidance

Audit related events while the pattern is under review.

## Sandbox Guidance

Not proposed.

## Dependency Guidance

Not proposed.

### Merged From

- LN-SEC-2026-040

### Supporting Evidence Summary

- count: 2
- unique_identities: 1
- has_cve_or_ghsa: 2
- with_references: 2

### Evidence Sample

- CVE-1999-0226
- CVE-1999-0226

### Human Review Notes

- Human review is required before this rule is accepted or enforced.
- Validate that the invariant is runtime/language-level rather than product-specific.


## LN-SEC-2026-041: Weakness Cwe 20 Review Rule

Rulebook Status: `needs_human_review`
Recommended Action: `keep`
Action Reason: Evidence is sufficient for a standalone rulebook draft entry.
Evidence Score: `0.86`
Confidence Score: `0.57`
Merge Group: `weakness-cwe-20-review-rule`

### Governance Principle

Recurring analyzed records indicate a potentially reusable governance pattern that requires human review.

### Galerina Invariant

Potential runtime governance invariant requires human review before rule promotion.

### Generic Runtime Invariant

Review whether this pattern should become a runtime governance policy.

## Syntax Guidance

Not proposed.

## Compiler Guidance

Not proposed.

## Runtime Guidance

Review whether this pattern should become a runtime governance policy.

## Deny Guidance

Not proposed.

## Audit Guidance

Audit related events while the pattern is under review.

## Sandbox Guidance

Not proposed.

## Dependency Guidance

Not proposed.

### Merged From

- LN-SEC-2026-041

### Supporting Evidence Summary

- count: 2
- unique_identities: 1
- has_cve_or_ghsa: 2
- with_references: 2

### Evidence Sample

- CVE-1999-0265
- CVE-1999-0265

### Human Review Notes

- Human review is required before this rule is accepted or enforced.
- Validate that the invariant is runtime/language-level rather than product-specific.


## LN-SEC-2026-042: Weakness Cwe 200 Review Rule

Rulebook Status: `needs_human_review`
Recommended Action: `keep`
Action Reason: Evidence is sufficient for a standalone rulebook draft entry.
Evidence Score: `0.97`
Confidence Score: `0.74`
Merge Group: `weakness-cwe-200-review-rule`

### Governance Principle

Recurring analyzed records indicate a potentially reusable governance pattern that requires human review.

### Galerina Invariant

Potential runtime governance invariant requires human review before rule promotion.

### Generic Runtime Invariant

Review whether this pattern should become a runtime governance policy.

## Syntax Guidance

Not proposed.

## Compiler Guidance

Not proposed.

## Runtime Guidance

Review whether this pattern should become a runtime governance policy.

## Deny Guidance

Not proposed.

## Audit Guidance

Audit related events while the pattern is under review.

## Sandbox Guidance

Not proposed.

## Dependency Guidance

Not proposed.

### Merged From

- LN-SEC-2026-042

### Supporting Evidence Summary

- count: 6
- unique_identities: 3
- has_cve_or_ghsa: 6
- with_references: 6

### Evidence Sample

- CVE-1999-0059
- CVE-1999-0059
- CVE-1999-0348
- CVE-1999-0348
- CVE-1999-0372
- CVE-1999-0372

### Human Review Notes

- Human review is required before this rule is accepted or enforced.
- Validate that the invariant is runtime/language-level rather than product-specific.


## LN-SEC-2026-046: Weakness Cwe 264 Review Rule

Rulebook Status: `needs_human_review`
Recommended Action: `keep`
Action Reason: Evidence is sufficient for a standalone rulebook draft entry.
Evidence Score: `0.92`
Confidence Score: `0.66`
Merge Group: `weakness-cwe-264-review-rule`

### Governance Principle

Recurring analyzed records indicate a potentially reusable governance pattern that requires human review.

### Galerina Invariant

Potential runtime governance invariant requires human review before rule promotion.

### Generic Runtime Invariant

Review whether this pattern should become a runtime governance policy.

## Syntax Guidance

Not proposed.

## Compiler Guidance

Not proposed.

## Runtime Guidance

Review whether this pattern should become a runtime governance policy.

## Deny Guidance

Not proposed.

## Audit Guidance

Audit related events while the pattern is under review.

## Sandbox Guidance

Not proposed.

## Dependency Guidance

Not proposed.

### Merged From

- LN-SEC-2026-046

### Supporting Evidence Summary

- count: 4
- unique_identities: 2
- has_cve_or_ghsa: 4
- with_references: 4

### Evidence Sample

- CVE-1999-0227
- CVE-1999-0227
- CVE-1999-0344
- CVE-1999-0344

### Human Review Notes

- Human review is required before this rule is accepted or enforced.
- Validate that the invariant is runtime/language-level rather than product-specific.


## LN-SEC-2026-047: Weakness Cwe 269 Review Rule

Rulebook Status: `needs_human_review`
Recommended Action: `keep`
Action Reason: Evidence is sufficient for a standalone rulebook draft entry.
Evidence Score: `0.86`
Confidence Score: `0.57`
Merge Group: `weakness-cwe-269-review-rule`

### Governance Principle

Recurring analyzed records indicate a potentially reusable governance pattern that requires human review.

### Galerina Invariant

Potential runtime governance invariant requires human review before rule promotion.

### Generic Runtime Invariant

Review whether this pattern should become a runtime governance policy.

## Syntax Guidance

Not proposed.

## Compiler Guidance

Not proposed.

## Runtime Guidance

Review whether this pattern should become a runtime governance policy.

## Deny Guidance

Not proposed.

## Audit Guidance

Audit related events while the pattern is under review.

## Sandbox Guidance

Not proposed.

## Dependency Guidance

Not proposed.

### Merged From

- LN-SEC-2026-047

### Supporting Evidence Summary

- count: 2
- unique_identities: 1
- has_cve_or_ghsa: 2
- with_references: 2

### Evidence Sample

- CVE-1999-0084
- CVE-1999-0084

### Human Review Notes

- Human review is required before this rule is accepted or enforced.
- Validate that the invariant is runtime/language-level rather than product-specific.


## LN-SEC-2026-048: Weakness Cwe 276 Review Rule

Rulebook Status: `needs_human_review`
Recommended Action: `keep`
Action Reason: Evidence is sufficient for a standalone rulebook draft entry.
Evidence Score: `0.86`
Confidence Score: `0.57`
Merge Group: `weakness-cwe-276-review-rule`

### Governance Principle

Recurring analyzed records indicate a potentially reusable governance pattern that requires human review.

### Galerina Invariant

Potential runtime governance invariant requires human review before rule promotion.

### Generic Runtime Invariant

Review whether this pattern should become a runtime governance policy.

## Syntax Guidance

Not proposed.

## Compiler Guidance

Not proposed.

## Runtime Guidance

Review whether this pattern should become a runtime governance policy.

## Deny Guidance

Not proposed.

## Audit Guidance

Audit related events while the pattern is under review.

## Sandbox Guidance

Not proposed.

## Dependency Guidance

Not proposed.

### Merged From

- LN-SEC-2026-048

### Supporting Evidence Summary

- count: 2
- unique_identities: 1
- has_cve_or_ghsa: 2
- with_references: 2

### Evidence Sample

- CVE-1999-0426
- CVE-1999-0426

### Human Review Notes

- Human review is required before this rule is accepted or enforced.
- Validate that the invariant is runtime/language-level rather than product-specific.


## LN-SEC-2026-051: Weakness Cwe 287 Review Rule

Rulebook Status: `needs_human_review`
Recommended Action: `keep`
Action Reason: Evidence is sufficient for a standalone rulebook draft entry.
Evidence Score: `0.86`
Confidence Score: `0.57`
Merge Group: `weakness-cwe-287-review-rule`

### Governance Principle

Recurring analyzed records indicate a potentially reusable governance pattern that requires human review.

### Galerina Invariant

Potential runtime governance invariant requires human review before rule promotion.

### Generic Runtime Invariant

Review whether this pattern should become a runtime governance policy.

## Syntax Guidance

Not proposed.

## Compiler Guidance

Not proposed.

## Runtime Guidance

Review whether this pattern should become a runtime governance policy.

## Deny Guidance

Not proposed.

## Audit Guidance

Audit related events while the pattern is under review.

## Sandbox Guidance

Not proposed.

## Dependency Guidance

Not proposed.

### Merged From

- LN-SEC-2026-051

### Supporting Evidence Summary

- count: 2
- unique_identities: 1
- has_cve_or_ghsa: 2
- with_references: 2

### Evidence Sample

- CVE-1999-0366
- CVE-1999-0366

### Human Review Notes

- Human review is required before this rule is accepted or enforced.
- Validate that the invariant is runtime/language-level rather than product-specific.


## LN-SEC-2026-052: Weakness Cwe 290 Review Rule - Remote User Affects Server State

Rulebook Status: `needs_human_review`
Recommended Action: `keep`
Action Reason: Evidence is sufficient for a standalone rulebook draft entry.
Evidence Score: `0.91`
Confidence Score: `0.57`
Merge Group: `weakness-cwe-290-review-rule-remote-user-affects-server-state`

### Governance Principle

Recurring analyzed records indicate a potentially reusable governance pattern that requires human review.

### Galerina Invariant

Potential runtime governance invariant requires human review before rule promotion.

### Generic Runtime Invariant

Review whether this pattern should become a runtime governance policy.

## Syntax Guidance

Not proposed.

## Compiler Guidance

Not proposed.

## Runtime Guidance

Review whether this pattern should become a runtime governance policy.

## Deny Guidance

Not proposed.

## Audit Guidance

Audit related events while the pattern is under review.

## Sandbox Guidance

Not proposed.

## Dependency Guidance

Not proposed.

### Merged From

- LN-SEC-2026-052

### Supporting Evidence Summary

- count: 2
- unique_identities: 1
- has_cve_or_ghsa: 2
- with_references: 2

### Evidence Sample

- CVE-1999-0012
- CVE-1999-0012

### Human Review Notes

- Human review is required before this rule is accepted or enforced.
- Validate that the invariant is runtime/language-level rather than product-specific.


## LN-SEC-2026-054: Weakness Cwe 327 Review Rule

Rulebook Status: `needs_human_review`
Recommended Action: `keep`
Action Reason: Evidence is sufficient for a standalone rulebook draft entry.
Evidence Score: `0.86`
Confidence Score: `0.57`
Merge Group: `weakness-cwe-327-review-rule`

### Governance Principle

Recurring analyzed records indicate a potentially reusable governance pattern that requires human review.

### Galerina Invariant

Potential runtime governance invariant requires human review before rule promotion.

### Generic Runtime Invariant

Review whether this pattern should become a runtime governance policy.

## Syntax Guidance

Not proposed.

## Compiler Guidance

Not proposed.

## Runtime Guidance

Review whether this pattern should become a runtime governance policy.

## Deny Guidance

Not proposed.

## Audit Guidance

Audit related events while the pattern is under review.

## Sandbox Guidance

Not proposed.

## Dependency Guidance

Not proposed.

### Merged From

- LN-SEC-2026-054

### Supporting Evidence Summary

- count: 2
- unique_identities: 1
- has_cve_or_ghsa: 2
- with_references: 2

### Evidence Sample

- CVE-1999-0007
- CVE-1999-0007

### Human Review Notes

- Human review is required before this rule is accepted or enforced.
- Validate that the invariant is runtime/language-level rather than product-specific.


## LN-SEC-2026-056: Weakness Cwe 384 Review Rule - Remote User Affects Server State

Rulebook Status: `needs_human_review`
Recommended Action: `keep`
Action Reason: Evidence is sufficient for a standalone rulebook draft entry.
Evidence Score: `0.91`
Confidence Score: `0.57`
Merge Group: `weakness-cwe-384-review-rule-remote-user-affects-server-state`

### Governance Principle

Recurring analyzed records indicate a potentially reusable governance pattern that requires human review.

### Galerina Invariant

Potential runtime governance invariant requires human review before rule promotion.

### Generic Runtime Invariant

Review whether this pattern should become a runtime governance policy.

## Syntax Guidance

Not proposed.

## Compiler Guidance

Not proposed.

## Runtime Guidance

Review whether this pattern should become a runtime governance policy.

## Deny Guidance

Not proposed.

## Audit Guidance

Audit related events while the pattern is under review.

## Sandbox Guidance

Not proposed.

## Dependency Guidance

Not proposed.

### Merged From

- LN-SEC-2026-056

### Supporting Evidence Summary

- count: 2
- unique_identities: 1
- has_cve_or_ghsa: 2
- with_references: 2

### Evidence Sample

- CVE-1999-0428
- CVE-1999-0428

### Human Review Notes

- Human review is required before this rule is accepted or enforced.
- Validate that the invariant is runtime/language-level rather than product-specific.


## LN-SEC-2026-057: Weakness Cwe 400 Review Rule

Rulebook Status: `needs_human_review`
Recommended Action: `keep`
Action Reason: Evidence is sufficient for a standalone rulebook draft entry.
Evidence Score: `0.86`
Confidence Score: `0.57`
Merge Group: `weakness-cwe-400-review-rule`

### Governance Principle

Recurring analyzed records indicate a potentially reusable governance pattern that requires human review.

### Galerina Invariant

Potential runtime governance invariant requires human review before rule promotion.

### Generic Runtime Invariant

Review whether this pattern should become a runtime governance policy.

## Syntax Guidance

Not proposed.

## Compiler Guidance

Not proposed.

## Runtime Guidance

Review whether this pattern should become a runtime governance policy.

## Deny Guidance

Not proposed.

## Audit Guidance

Audit related events while the pattern is under review.

## Sandbox Guidance

Not proposed.

## Dependency Guidance

Not proposed.

### Merged From

- LN-SEC-2026-057

### Supporting Evidence Summary

- count: 2
- unique_identities: 1
- has_cve_or_ghsa: 2
- with_references: 2

### Evidence Sample

- CVE-1999-0159
- CVE-1999-0159

### Human Review Notes

- Human review is required before this rule is accepted or enforced.
- Validate that the invariant is runtime/language-level rather than product-specific.


## LN-SEC-2026-059: Weakness Cwe 434 Review Rule

Rulebook Status: `needs_human_review`
Recommended Action: `keep`
Action Reason: Evidence is sufficient for a standalone rulebook draft entry.
Evidence Score: `0.86`
Confidence Score: `0.57`
Merge Group: `weakness-cwe-434-review-rule`

### Governance Principle

Recurring analyzed records indicate a potentially reusable governance pattern that requires human review.

### Galerina Invariant

Potential runtime governance invariant requires human review before rule promotion.

### Generic Runtime Invariant

Review whether this pattern should become a runtime governance policy.

## Syntax Guidance

Not proposed.

## Compiler Guidance

Not proposed.

## Runtime Guidance

Review whether this pattern should become a runtime governance policy.

## Deny Guidance

Not proposed.

## Audit Guidance

Audit related events while the pattern is under review.

## Sandbox Guidance

Not proposed.

## Dependency Guidance

Not proposed.

### Merged From

- LN-SEC-2026-059

### Supporting Evidence Summary

- count: 2
- unique_identities: 1
- has_cve_or_ghsa: 2
- with_references: 2

### Evidence Sample

- CVE-1999-0036
- CVE-1999-0036

### Human Review Notes

- Human review is required before this rule is accepted or enforced.
- Validate that the invariant is runtime/language-level rather than product-specific.


## LN-SEC-2026-060: Weakness Cwe 476 Review Rule - Remote User Affects Server State

Rulebook Status: `needs_human_review`
Recommended Action: `keep`
Action Reason: Evidence is sufficient for a standalone rulebook draft entry.
Evidence Score: `0.91`
Confidence Score: `0.57`
Merge Group: `weakness-cwe-476-review-rule-remote-user-affects-server-state`

### Governance Principle

Recurring analyzed records indicate a potentially reusable governance pattern that requires human review.

### Galerina Invariant

Potential runtime governance invariant requires human review before rule promotion.

### Generic Runtime Invariant

Review whether this pattern should become a runtime governance policy.

## Syntax Guidance

Not proposed.

## Compiler Guidance

Not proposed.

## Runtime Guidance

Review whether this pattern should become a runtime governance policy.

## Deny Guidance

Not proposed.

## Audit Guidance

Audit related events while the pattern is under review.

## Sandbox Guidance

Not proposed.

## Dependency Guidance

Not proposed.

### Merged From

- LN-SEC-2026-060

### Supporting Evidence Summary

- count: 2
- unique_identities: 1
- has_cve_or_ghsa: 2
- with_references: 2

### Evidence Sample

- CVE-1999-0052
- CVE-1999-0052

### Human Review Notes

- Human review is required before this rule is accepted or enforced.
- Validate that the invariant is runtime/language-level rather than product-specific.


## LN-SEC-2026-061: Weakness Cwe 77 Review Rule - Remote User Affects Server State

Rulebook Status: `needs_human_review`
Recommended Action: `keep`
Action Reason: Evidence is sufficient for a standalone rulebook draft entry.
Evidence Score: `0.91`
Confidence Score: `0.57`
Merge Group: `weakness-cwe-77-review-rule-remote-user-affects-server-state`

### Governance Principle

Recurring analyzed records indicate a potentially reusable governance pattern that requires human review.

### Galerina Invariant

Potential runtime governance invariant requires human review before rule promotion.

### Generic Runtime Invariant

Review whether this pattern should become a runtime governance policy.

## Syntax Guidance

Not proposed.

## Compiler Guidance

Not proposed.

## Runtime Guidance

Review whether this pattern should become a runtime governance policy.

## Deny Guidance

Not proposed.

## Audit Guidance

Audit related events while the pattern is under review.

## Sandbox Guidance

Not proposed.

## Dependency Guidance

Not proposed.

### Merged From

- LN-SEC-2026-061

### Supporting Evidence Summary

- count: 2
- unique_identities: 1
- has_cve_or_ghsa: 2
- with_references: 2

### Evidence Sample

- CVE-1999-0039
- CVE-1999-0039

### Human Review Notes

- Human review is required before this rule is accepted or enforced.
- Validate that the invariant is runtime/language-level rather than product-specific.


## LN-SEC-2026-062: Weakness Cwe 78 Review Rule

Rulebook Status: `needs_human_review`
Recommended Action: `keep`
Action Reason: Evidence is sufficient for a standalone rulebook draft entry.
Evidence Score: `0.92`
Confidence Score: `0.66`
Merge Group: `weakness-cwe-78-review-rule`

### Governance Principle

Recurring analyzed records indicate a potentially reusable governance pattern that requires human review.

### Galerina Invariant

Potential runtime governance invariant requires human review before rule promotion.

### Generic Runtime Invariant

Review whether this pattern should become a runtime governance policy.

## Syntax Guidance

Not proposed.

## Compiler Guidance

Not proposed.

## Runtime Guidance

Review whether this pattern should become a runtime governance policy.

## Deny Guidance

Not proposed.

## Audit Guidance

Audit related events while the pattern is under review.

## Sandbox Guidance

Not proposed.

## Dependency Guidance

Not proposed.

### Merged From

- LN-SEC-2026-062

### Supporting Evidence Summary

- count: 4
- unique_identities: 2
- has_cve_or_ghsa: 4
- with_references: 4

### Evidence Sample

- CVE-1999-0043
- CVE-1999-0043
- CVE-1999-0067
- CVE-1999-0067

### Human Review Notes

- Human review is required before this rule is accepted or enforced.
- Validate that the invariant is runtime/language-level rather than product-specific.


## LN-SEC-2026-003: State-Changing Request Intent Verification - CWE-352, RubyGems

Rulebook Status: `needs_human_review`
Recommended Action: `merge`
Action Reason: Overlaps another proposed rule in the same governance boundary.
Evidence Score: `1.0`
Confidence Score: `0.7`
Merge Group: `request-intent-boundary`

### Governance Principle

Repeated CSRF findings indicate state-changing requests require explicit intent verification and request-boundary governance.

### Galerina Invariant

State-changing requests require actor intent, origin validation, and audit policy.

### Generic Runtime Invariant

Validate request origin and intent token before state mutation.

## Syntax Guidance

Require request intent policy on state-changing route declarations.

## Compiler Guidance

Reject state-changing handlers without declared intent verification in strict profiles.

## Runtime Guidance

Validate request origin and intent token before state mutation.

## Deny Guidance

Deny state mutation when request intent cannot be verified.

## Audit Guidance

Audit failed state-changing request verification.

## Sandbox Guidance

Not proposed.

## Dependency Guidance

Not proposed.

### Merged From

- LN-SEC-2026-003
- LN-SEC-2026-001
- LN-SEC-2026-002

### Supporting Evidence Summary

- count: 9
- unique_identities: 6
- has_cve_or_ghsa: 9
- with_references: 9

### Evidence Sample

- CVE-2008-5189
- CVE-2011-0447
- CVE-2011-0447
- CVE-2012-6134
- CVE-2013-4562
- CVE-2015-1840
- CVE-2015-1840
- CVE-2008-7248
- CVE-2008-7248

### Human Review Notes

- Human review is required before this rule is accepted or enforced.
- Validate that the invariant is runtime/language-level rather than product-specific.


## LN-SEC-2026-007: Untrusted Input Boundary Enforcement - CWE-79, RubyGems

Rulebook Status: `needs_human_review`
Recommended Action: `merge`
Action Reason: Multiple Stage 3 proposals describe the same governance boundary.
Evidence Score: `1.0`
Confidence Score: `0.87`
Merge Group: `untrusted-input-boundary`

### Governance Principle

Repeated injection findings indicate that untrusted input must not cross parser, query, or command boundaries without explicit validation and capability policy.

### Galerina Invariant

Untrusted values crossing interpreter, query, template, command, or parser boundaries require governed validation and typed capability approval.

### Generic Runtime Invariant

Track trust labels at runtime and audit untrusted-to-sensitive boundary crossings.

## Syntax Guidance

Require explicit trust annotations for values used in sensitive parser or query contexts.

## Compiler Guidance

Reject implicit flows from untrusted inputs into sensitive sinks without a validator or encoder contract.

## Runtime Guidance

Track trust labels at runtime and audit untrusted-to-sensitive boundary crossings.

## Deny Guidance

Deny execution when untrusted input reaches a sensitive sink without an approved capability.

## Audit Guidance

Audit validation decisions and sensitive sink invocations.

## Sandbox Guidance

Not proposed.

## Dependency Guidance

Not proposed.

### Merged From

- LN-SEC-2026-007
- LN-SEC-2026-044
- LN-SEC-2026-049
- LN-SEC-2026-009
- LN-SEC-2026-010
- LN-SEC-2026-008
- LN-SEC-2026-006
- LN-SEC-2026-005
- LN-SEC-2026-011
- LN-SEC-2026-033
- LN-SEC-2026-045

### Supporting Evidence Summary

- count: 81
- unique_identities: 52
- has_cve_or_ghsa: 81
- with_references: 81

### Evidence Sample

- CVE-2007-3227
- CVE-2009-3009
- CVE-2009-3009
- CVE-2009-4214
- CVE-2011-0446
- CVE-2011-0446
- CVE-2011-2932
- CVE-2012-1099
- CVE-2012-1099
- CVE-2012-3463

### Human Review Notes

- Human review is required before this rule is accepted or enforced.
- Validate that the invariant is runtime/language-level rather than product-specific.


## LN-SEC-2026-012: Native Boundary Isolation Requirement

Rulebook Status: `needs_human_review`
Recommended Action: `merge`
Action Reason: Overlaps another proposed rule in the same governance boundary.
Evidence Score: `1.0`
Confidence Score: `0.87`
Merge Group: `memory-safety-boundary`

### Governance Principle

Repeated memory-safety findings indicate that unsafe native boundaries should be isolated, audited, or replaced with memory-safe implementations.

### Galerina Invariant

Native or unsafe memory boundaries require explicit isolation and audit policy.

### Generic Runtime Invariant

Execute native extensions in isolated runtime zones when possible.

## Syntax Guidance

Require an unsafe/native boundary declaration for modules that cross memory-safe runtime boundaries.

## Compiler Guidance

Reject undeclared native boundary calls in governed runtime profiles.

## Runtime Guidance

Execute native extensions in isolated runtime zones when possible.

## Deny Guidance

Deny native boundary access from low-trust actors without a capability.

## Audit Guidance

Audit native boundary loads, calls, and crashes.

## Sandbox Guidance

Run native boundary code in a sandboxed execution zone.

## Dependency Guidance

Not proposed.

### Merged From

- LN-SEC-2026-012
- LN-SEC-2026-013
- LN-SEC-2026-015
- LN-SEC-2026-016
- LN-SEC-2026-014

### Supporting Evidence Summary

- count: 226
- unique_identities: 113
- has_cve_or_ghsa: 226
- with_references: 226

### Evidence Sample

- CVE-1999-0003
- CVE-1999-0003
- CVE-1999-0004
- CVE-1999-0004
- CVE-1999-0005
- CVE-1999-0005
- CVE-1999-0008
- CVE-1999-0008
- CVE-1999-0009
- CVE-1999-0009

### Human Review Notes

- Human review is required before this rule is accepted or enforced.
- Validate that the invariant is runtime/language-level rather than product-specific.


## LN-SEC-2026-018: Filesystem Boundary Governance - CWE-22, RubyGems

Rulebook Status: `needs_human_review`
Recommended Action: `merge`
Action Reason: Multiple Stage 3 proposals describe the same governance boundary.
Evidence Score: `1.0`
Confidence Score: `0.87`
Merge Group: `filesystem-boundary`

### Governance Principle

Repeated path traversal findings indicate filesystem access must be governed by canonical paths, capabilities, and sandbox boundaries.

### Galerina Invariant

Filesystem operations require canonicalization and capability checks before crossing storage boundaries.

### Generic Runtime Invariant

Constrain filesystem access by actor capability and sandbox root.

## Syntax Guidance

Require explicit storage capability declarations for filesystem paths.

## Compiler Guidance

Reject untrusted path input to filesystem sinks without canonicalization contracts.

## Runtime Guidance

Constrain filesystem access by actor capability and sandbox root.

## Deny Guidance

Deny path traversal attempts outside the authorized storage boundary.

## Audit Guidance

Audit denied filesystem boundary crossings.

## Sandbox Guidance

Bind untrusted actors to isolated filesystem roots.

## Dependency Guidance

Not proposed.

### Merged From

- LN-SEC-2026-018
- LN-SEC-2026-017
- LN-SEC-2026-019

### Supporting Evidence Summary

- count: 17
- unique_identities: 11
- has_cve_or_ghsa: 17
- with_references: 17

### Evidence Sample

- CVE-2012-2139
- CVE-2012-3865
- CVE-2013-0262
- CVE-2013-0262
- CVE-2014-0130
- CVE-2014-0130
- CVE-2014-7818
- CVE-2014-7818
- CVE-2014-7819
- CVE-2014-7819

### Human Review Notes

- Human review is required before this rule is accepted or enforced.
- Validate that the invariant is runtime/language-level rather than product-specific.


## LN-SEC-2026-021: Plaintext Secrets Review Rule

Rulebook Status: `needs_human_review`
Recommended Action: `merge`
Action Reason: Overlaps another proposed rule in the same governance boundary.
Evidence Score: `0.96`
Confidence Score: `0.57`
Merge Group: `secret-handling-boundary`

### Governance Principle

Recurring analyzed records indicate a potentially reusable governance pattern that requires human review.

### Galerina Invariant

Potential runtime governance invariant requires human review before rule promotion.

### Generic Runtime Invariant

Review whether this pattern should become a runtime governance policy.

## Syntax Guidance

Not proposed.

## Compiler Guidance

Not proposed.

## Runtime Guidance

Review whether this pattern should become a runtime governance policy.

## Deny Guidance

Not proposed.

## Audit Guidance

Audit related events while the pattern is under review.

## Sandbox Guidance

Not proposed.

## Dependency Guidance

Not proposed.

### Merged From

- LN-SEC-2026-021
- LN-SEC-2026-022
- LN-SEC-2026-023
- LN-SEC-2026-024

### Supporting Evidence Summary

- count: 8
- unique_identities: 4
- has_cve_or_ghsa: 8
- with_references: 8

### Evidence Sample

- CVE-1999-0248
- CVE-1999-0248
- CVE-1999-0387
- CVE-1999-0387
- CVE-2012-3424
- CVE-2012-3424
- CVE-1999-0013
- CVE-1999-0013

### Human Review Notes

- Human review is required before this rule is accepted or enforced.
- Validate that the invariant is runtime/language-level rather than product-specific.


## LN-SEC-2026-025: Race Condition Review Rule

Rulebook Status: `needs_human_review`
Recommended Action: `merge`
Action Reason: Overlaps another proposed rule in the same governance boundary.
Evidence Score: `1.0`
Confidence Score: `0.87`
Merge Group: `concurrency-boundary`

### Governance Principle

Recurring analyzed records indicate a potentially reusable governance pattern that requires human review.

### Galerina Invariant

Potential runtime governance invariant requires human review before rule promotion.

### Generic Runtime Invariant

Review whether this pattern should become a runtime governance policy.

## Syntax Guidance

Not proposed.

## Compiler Guidance

Not proposed.

## Runtime Guidance

Review whether this pattern should become a runtime governance policy.

## Deny Guidance

Not proposed.

## Audit Guidance

Audit related events while the pattern is under review.

## Sandbox Guidance

Not proposed.

## Dependency Guidance

Not proposed.

### Merged From

- LN-SEC-2026-025
- LN-SEC-2026-026

### Supporting Evidence Summary

- count: 14
- unique_identities: 7
- has_cve_or_ghsa: 14
- with_references: 14

### Evidence Sample

- CVE-1999-0123
- CVE-1999-0123
- CVE-1999-0164
- CVE-1999-0164
- CVE-1999-0350
- CVE-1999-0350
- CVE-1999-0395
- CVE-1999-0395
- CVE-1999-0396
- CVE-1999-0396

### Human Review Notes

- Human review is required before this rule is accepted or enforced.
- Validate that the invariant is runtime/language-level rather than product-specific.


## LN-SEC-2026-028: Trust Boundary Dependency Boundary Risk Review Rule

Rulebook Status: `needs_human_review`
Recommended Action: `needs_human_review`
Action Reason: Rule is broad and lacks a concrete exploit class.
Evidence Score: `0.94`
Confidence Score: `0.87`
Merge Group: `dependency-provenance-boundary`

### Governance Principle

Recurring analyzed records indicate a potentially reusable governance pattern that requires human review.

### Galerina Invariant

Potential runtime governance invariant requires human review before rule promotion.

### Generic Runtime Invariant

Review whether this pattern should become a runtime governance policy.

## Syntax Guidance

Not proposed.

## Compiler Guidance

Not proposed.

## Runtime Guidance

Review whether this pattern should become a runtime governance policy.

## Deny Guidance

Not proposed.

## Audit Guidance

Audit related events while the pattern is under review.

## Sandbox Guidance

Not proposed.

## Dependency Guidance

Not proposed.

### Merged From

- LN-SEC-2026-028
- LN-SEC-2026-029
- LN-SEC-2026-037
- LN-SEC-2026-043
- LN-SEC-2026-058
- LN-SEC-2026-027
- LN-SEC-2026-030
- LN-SEC-2026-036
- LN-SEC-2026-050
- LN-SEC-2026-053
- LN-SEC-2026-055
- LN-SEC-2026-064

### Supporting Evidence Summary

- count: 61
- unique_identities: 39
- has_cve_or_ghsa: 61
- with_references: 61

### Evidence Sample

- CVE-1999-0037
- CVE-1999-0037
- CVE-1999-0073
- CVE-1999-0073
- CVE-1999-0114
- CVE-1999-0114
- CVE-1999-0127
- CVE-1999-0127
- CVE-1999-0147
- CVE-1999-0147

### Human Review Notes

- Human review is required before this rule is accepted or enforced.
- Validate that the invariant is runtime/language-level rather than product-specific.


## LN-SEC-2026-031: Trust Boundary Privilege Boundary Crossing Review Rule

Rulebook Status: `needs_human_review`
Recommended Action: `needs_human_review`
Action Reason: Rule is broad and lacks a concrete exploit class.
Evidence Score: `0.94`
Confidence Score: `0.87`
Merge Group: `capability-boundary`

### Governance Principle

Recurring analyzed records indicate a potentially reusable governance pattern that requires human review.

### Galerina Invariant

Potential runtime governance invariant requires human review before rule promotion.

### Generic Runtime Invariant

Review whether this pattern should become a runtime governance policy.

## Syntax Guidance

Not proposed.

## Compiler Guidance

Not proposed.

## Runtime Guidance

Review whether this pattern should become a runtime governance policy.

## Deny Guidance

Not proposed.

## Audit Guidance

Audit related events while the pattern is under review.

## Sandbox Guidance

Not proposed.

## Dependency Guidance

Not proposed.

### Merged From

- LN-SEC-2026-031
- LN-SEC-2026-020
- LN-SEC-2026-063

### Supporting Evidence Summary

- count: 80
- unique_identities: 40
- has_cve_or_ghsa: 80
- with_references: 80

### Evidence Sample

- CVE-1999-0044
- CVE-1999-0044
- CVE-1999-0062
- CVE-1999-0062
- CVE-1999-0080
- CVE-1999-0080
- CVE-1999-0082
- CVE-1999-0082
- CVE-1999-0092
- CVE-1999-0092

### Human Review Notes

- Human review is required before this rule is accepted or enforced.
- Validate that the invariant is runtime/language-level rather than product-specific.


## LN-SEC-2026-032: Trust Boundary Remote User Affects Server State Review Rule

Rulebook Status: `needs_human_review`
Recommended Action: `needs_human_review`
Action Reason: Rule is broad and lacks a concrete exploit class.
Evidence Score: `0.94`
Confidence Score: `0.87`
Merge Group: `remote-state-boundary`

### Governance Principle

Recurring analyzed records indicate a potentially reusable governance pattern that requires human review.

### Galerina Invariant

Potential runtime governance invariant requires human review before rule promotion.

### Generic Runtime Invariant

Review whether this pattern should become a runtime governance policy.

## Syntax Guidance

Not proposed.

## Compiler Guidance

Not proposed.

## Runtime Guidance

Review whether this pattern should become a runtime governance policy.

## Deny Guidance

Not proposed.

## Audit Guidance

Audit related events while the pattern is under review.

## Sandbox Guidance

Not proposed.

## Dependency Guidance

Not proposed.

### Merged From

- LN-SEC-2026-032

### Supporting Evidence Summary

- count: 80
- unique_identities: 40
- has_cve_or_ghsa: 80
- with_references: 80

### Evidence Sample

- CVE-1999-0031
- CVE-1999-0031
- CVE-1999-0079
- CVE-1999-0079
- CVE-1999-0149
- CVE-1999-0149
- CVE-1999-0154
- CVE-1999-0154
- CVE-1999-0155
- CVE-1999-0155

### Human Review Notes

- Human review is required before this rule is accepted or enforced.
- Validate that the invariant is runtime/language-level rather than product-specific.


## LN-SEC-2026-034: Trust Boundary Web Request Boundary Review Rule

Rulebook Status: `needs_human_review`
Recommended Action: `needs_human_review`
Action Reason: Rule is broad and lacks a concrete exploit class.
Evidence Score: `0.76`
Confidence Score: `0.57`
Merge Group: `web-request-boundary`

### Governance Principle

Recurring analyzed records indicate a potentially reusable governance pattern that requires human review.

### Galerina Invariant

Potential runtime governance invariant requires human review before rule promotion.

### Generic Runtime Invariant

Review whether this pattern should become a runtime governance policy.

## Syntax Guidance

Not proposed.

## Compiler Guidance

Not proposed.

## Runtime Guidance

Review whether this pattern should become a runtime governance policy.

## Deny Guidance

Not proposed.

## Audit Guidance

Audit related events while the pattern is under review.

## Sandbox Guidance

Not proposed.

## Dependency Guidance

Not proposed.

### Merged From

- LN-SEC-2026-034

### Supporting Evidence Summary

- count: 2
- unique_identities: 1
- has_cve_or_ghsa: 2
- with_references: 2

### Evidence Sample

- CVE-1999-0378
- CVE-1999-0378

### Human Review Notes

- Human review is required before this rule is accepted or enforced.
- Validate that the invariant is runtime/language-level rather than product-specific.


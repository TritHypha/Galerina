# 48 env-anchor-beta mutants

Work-clone mutants (WSL ~/gcw-s5-work), each applied to a copy of the tracked file, suite run with --test-concurrency=1, file restored and a clean rerun passed. Scripts live outside the repo (grok-scratch memory-goal-20261014 gcw-k3u107-mut.sh, gcw-k3u109 host mutants, gcw-k3u110-mut.sh). These are to be repeated in the clean-clone round check; this file is not a round-check verdict.

## Native unit (env-anchor-beta.fungi), 13/13 RED, clean rerun 7/7 (gcw-k3u107)

| id | change | red test |
|---|---|---|
| M1 / M1b | skip required-key presence | EA-R1..R5 envKeyAdmit |
| M2 | accept empty value | EA-R1..R5 envKeyAdmit |
| M3 | skip format check | EA-R1..R5 envKeyAdmit |
| M4 | last-wins on duplicate | EA-R1..R5 envKeyAdmit |
| M5 | ignore unknown key | EA-R5/R8/R9 envFileAdmit |
| M8 / M8b | drop root / drop purpose from AAD admit | EA-R10 envAadAdmit |
| M9 | mode UNKNOWN treated as ok | EA-R5/R8/R9 envFileAdmit |
| M10 | admit argv source | EA-R5/R8/R9 envFileAdmit |
| M11 | ignore post-boot fault | EA-R11 envSecretAccess |
| M12 | admit undeclared name | EA-R11 envSecretAccess |
| M13 | admit unlisted source | EA-R5/R8/R9 envFileAdmit |

## Host shim (env-anchor-beta-host.mjs), 10/10 RED (gcw-k3u109)

| id | change | plan mutant |
|---|---|---|
| HM1 | secret value included in error | M6 |
| HM2 | default accepted for a missing manifest field | M7 |
| HM3 | throwing probe not treated as fault | EA-R11 |
| HM4 | JavaScript re-decider for access (second decider) | bypass |
| HM5 | asset pin check skipped | EA-H3 |
| HM6 | argv not refused | M10 host |
| HM7 | fault not latched | EA-R11 |
| HM8 | revocationEpoch moved per call, not per fault | EA-R11 |
| HM9 | open file mode ignored | EA-H4 / M9 host |
| HM10 | unknown keys ignored | M5 host |

## AEAD AAD binding (sealBound/openBound/boundAad), 7/7 RED (gcw-k3u110)

| id | change |
|---|---|
| AM1 | drop setAAD |
| AM2 | plain purpose||root concat instead of length-prefixed AAD |
| AM3 | fixed all-zero nonce |
| AM4 | skip tag size pin |
| AM5 | skip native envAadAdmit (JavaScript-side decision) |
| AM6 | open purpose/root alphabet |
| AM7 | extra sealed field accepted |

## Honesty notes
- EA-H3 and EA-H4 (065bebc0c) and the AM7 row (3938cdae5) are mutant-killers written after the code to kill surviving mutants HM5, HM9 and AM7. They are not red-first.
- The first HM7 draft was an equivalent mutant and was replaced.
- AM7 survived on the first run (gcw-k3u110-mut.out) and went RED after 3938cdae5.

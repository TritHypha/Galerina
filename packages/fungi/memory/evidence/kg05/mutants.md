# KG-05 mutants

| id | change | vector | expected |
|---|---|---|---|
| m5a | accept length 7 or 9 (`bufLen != 10` skipped) | bufLen 7, otherwise valid i64 1 | RED 0 (was 14) |
| m5b | accept tag 0x03 | tag 3, length 8, payload of 1 | RED 0 (was 12) |
| m5c | skip post-decode range check | i64 20 with domain [0,16] | RED 0 (was 8) |
| m5d | truncate to low 32 bits (skip high-limb fit) | i64 2^32+1 | RED 0 (was 8) |
| m5e | `BigInt.asIntN(64, n)` wrap on host encode | u64 2^64 | RED encodes 0 (was RANGE refuse) |
| m5f | big-endian payload decode | i64 1 LE buffer | RED value != 1 |

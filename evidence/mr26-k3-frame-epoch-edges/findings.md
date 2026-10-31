# MEM-R26: K3 legacy frame epoch edges (gap map row 3.6)

Date: 2026-10-31. Scope: Rust VOK checker only (`packages-ts/galerina-core-runtime/native/vok-authority`), tests plus this note. No production source changed. VOK is the unshipped Rust checker beside SLIDE; production stays GIR -> SLIDE. Synthetic values only.

## Row 3.6
"Frame epoch -1, 0, i64::MAX fail closed; no u32/i32 truncation." Before this row, `src/k3_frame.rs` `epoch_close_gate` covered i64::MIN, -1 and 0 inside the crate, but nothing pinned i64::MAX or the truncation aliases through the public API.

## New tests: `tests/k3_frame_epoch_edges.rs` (11 tests)
| Test | What it pins |
|---|---|
| baseline_open_epochs_admit_legacy_zero | OPEN_UNIX (2026-10-27Z), 20261027 and the floor do admit a framed legacy 0 (Unknown, reads 1, FirstSeen), so the closed rows can't pass for the wrong reason. |
| hostile_epochs_close_without_counting | 29 hostile epochs (i64::MIN/MAX and neighbours, -1, 0, 1, i32::MAX+1, u32::MAX, 2^32, high-bit aliases, negatives with admitted low bits, floor-1, ceiling, YMD min-1/max+1, expiry) close legacy 0 at reads 0, 7 and cap-1 with the counter unchanged and no alert. |
| hostile_epochs_close_with_bridge_and_sink | Same set through `decode_legacy_frame_with_bridge`, bridge on and off. |
| truncation_aliases_are_not_their_low_bits | 9 aliases whose low 32 bits (as i32 and as u32) are an admitted epoch; the low value admits, the alias closes. |
| canonical_values_do_not_depend_on_epoch | Values 1, -1, -128 decode Admit/Deny/Unknown and 2, -2, 127, 128, 255, i32::MIN, i32::MAX decode Invalid under v1 and v2 for every hostile epoch, counter unchanged; v2 bare 0 is Invalid. |
| unknown_versions_refuse_at_every_epoch | Versions i32::MIN, -1, 0, 3, 128, i32::MAX are Invalid at every epoch. |
| clock_extremes_close_an_open_epoch | now = i64::MIN, -1, 0, expiry, ceiling, i64::MAX close an open epoch; expiry-1 still admits. |
| read_counter_extremes_never_wrap | reads = cap and u64::MAX give LegacyClosed + CapReached with the counter unchanged (no wrap to 0); cap-1 admits to exactly cap; a hostile epoch at u64::MAX is a plain close. |
| unix_to_ymd_refuses_out_of_window | `k3_unix_s_to_ymd` refuses i64::MIN, -1, 0, floor-1, ceiling, ceiling+2^32, i64::MAX; maps OPEN_UNIX and the last second of the window correctly. |
| wasi_ns_extremes_refuse | `k3_wasi_realtime_ns_to_unix_s` refuses 0, 1, floor-1ns, i64::MAX, i64::MAX+1, u64::MAX, u64::MAX-999999999, ceiling; floor and floor+999999999 ns map to floor. |
| narrowing_casts_are_pinned_and_guarded | Source pin over production `src/k3_frame.rs` (before the test module): the set of numeric `as` casts is exactly 8 known lines; each `ymd as i32` sits after an explicit i32::MAX bound in the same function; `ns as i64` sits after the i64::MAX bound; the epoch gate refuses `<= 0` first; epoch and clock stay i64 in the public API; the read counter only saturates. |

## Mutants (src/k3_frame.rs, restored after each)
| Mutant | Behaviour tests (pin skipped) | With source pin |
|---|---|---|
| M1 truncate epoch to i32 in k3_epoch_admitted and k3_epoch_to_unix_s | KILLED (3 tests) | KILLED |
| M2 drop the i32::MAX and YMD_MAX bounds on the YYYYMMDD path | survives (equivalent, see below) | KILLED |
| M3 `now_unix_s <= 0` to `< 0` | KILLED | KILLED |
| M4 cap `>=` to `>` | KILLED | KILLED |
| M5 drop the ceiling in k3_unix_s_to_ymd | KILLED | KILLED |
| M6 `saturating_add` to `wrapping_add` on the read counter | survives (equivalent, see below) | KILLED |
| M7 drop the `ns > i64::MAX` guard | survives (equivalent, see below) | KILLED |

7/7 killed with the pin; 4/7 by behaviour alone. The three behavioural survivors are defence in depth, not holes:
- M2: even if the YYYYMMDD gate truncated, `unix_s_from_ymd` takes year, month and day from the full i64, so an alias maps to a date far outside the trusted window and is still refused.
- M6: the cap check (`reads >= 1_000_000`) runs before the increment, so the add can never reach u64::MAX.
- M7: every ns above i64::MAX reinterprets as a negative i64, which is below the trusted floor and refused.
The source pin is what keeps these second layers from being removed silently.

## Block pass
`cargo test` in WSL on the branch: 347 passed, 0 failed, 11 ignored (on-target only), across all 19 test targets.

## Result
Row 3.6 COVERED (VOK). Rows 4.6 and H13 stay PARTIAL: .fungi Int is still i32, which is a separate language change.

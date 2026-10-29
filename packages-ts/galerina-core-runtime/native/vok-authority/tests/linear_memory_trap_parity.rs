//! MEM-R9 (gap map 5.4 / H16): VOK trap parity with SLIDE's linear-memory
//! bounds model and the WebAssembly engine.
//!
//! `vectors/linear-memory-trap-vectors.rows.txt` is derived from SLIDE's
//! `src/linear-memory-bounds.mjs` and replayed against V8 by
//! `vectors/linear-memory-trap-vectors-pin.test.mjs`. Here the Rust checker
//! must give the same STATUS / failure id / result on every row, which closes
//! the VOK side of the SLIDE <-> engine <-> VOK triangle.

#[path = "../src/linear_memory_bounds.rs"]
mod linear_memory_bounds;

use linear_memory_bounds::*;

const ROWS: &str = include_str!("../vectors/linear-memory-trap-vectors.rows.txt");
const SCHEMA: &str = "galerina.vok.linear-memory-trap-vectors.v1";

fn rows() -> Vec<(String, String)> {
    let mut lines = ROWS.lines().map(|l| l.trim_end_matches('\r'));
    let header = lines.next().expect("rows file has a header");
    assert!(header.starts_with(&format!("# {} rows=", SCHEMA)), "unexpected header: {}", header);
    let declared: usize = header
        .split_whitespace()
        .find_map(|f| f.strip_prefix("rows="))
        .and_then(|n| n.parse().ok())
        .expect("header declares rows=");
    let out: Vec<(String, String)> = lines
        .filter(|l| !l.is_empty())
        .map(|l| {
            let (input, expect) = l.split_once(" | ").expect("row has ' | '");
            (input.to_string(), expect.to_string())
        })
        .collect();
    assert_eq!(out.len(), declared, "row count does not match header");
    out
}

#[test]
fn every_slide_vector_row_matches_vok() {
    let mut mismatches = Vec::new();
    let rows = rows();
    for (input, expect) in &rows {
        let fields: Vec<&str> = input.split(' ').collect();
        let got = evaluate_row_input(&fields).row_tail();
        if &got != expect {
            mismatches.push(format!("{} | want {} | got {}", input, expect, got));
        }
    }
    assert!(rows.len() > 1200, "vector file too small: {}", rows.len());
    assert!(mismatches.is_empty(), "{} mismatches:\n{}", mismatches.len(), mismatches.join("\n"));
}

#[test]
fn rows_cover_every_kind_and_failure_id() {
    let rows = rows();
    for kind in ["access i32", "access i64", "range ", "copy ", "grow ", "div div_s", "div div_u", "div rem_s", "div rem_u"] {
        assert!(rows.iter().any(|(i, _)| i.starts_with(kind)), "no {} rows", kind);
    }
    for id in [LMB_FAILURE_INVALID, LMB_FAILURE_OUT_OF_BOUNDS, LMB_FAILURE_DIVIDE_BY_ZERO, LMB_FAILURE_OVERFLOW, LMB_FAILURE_GROW_REFUSED, LMB_FAILURE_NONE] {
        assert!(rows.iter().any(|(_, e)| e.split(' ').nth(1) == Some(id)), "no rows with {}", id);
    }
}

#[test]
fn div_s_int_min_by_minus_one_traps_overflow_both_widths() {
    let a = check_integer_division(DivOp::DivS, 32, i32::MIN as i128, -1);
    assert_eq!((a.verdict, a.status, a.failure_id), (-1, Status::Trap, LMB_FAILURE_OVERFLOW));
    let b = check_integer_division(DivOp::DivS, 64, i64::MIN as i128, -1);
    assert_eq!((b.verdict, b.status, b.failure_id), (-1, Status::Trap, LMB_FAILURE_OVERFLOW));
}

#[test]
fn rem_s_int_min_by_minus_one_is_zero_not_a_trap() {
    let r = check_integer_division(DivOp::RemS, 32, i32::MIN as i128, -1);
    assert_eq!((r.verdict, r.status, r.value), (1, Status::Value, Some(0)));
    let r = check_integer_division(DivOp::RemS, 64, i64::MIN as i128, -1);
    assert_eq!((r.verdict, r.status, r.value), (1, Status::Value, Some(0)));
}

#[test]
fn zero_divisor_traps_for_all_four_ops() {
    for op in [DivOp::DivS, DivOp::DivU, DivOp::RemS, DivOp::RemU] {
        let r = check_integer_division(op, 32, 7, 0);
        assert_eq!((r.status, r.failure_id), (Status::Trap, LMB_FAILURE_DIVIDE_BY_ZERO));
    }
}

#[test]
fn unsigned_ops_reinterpret_bits_and_return_signed() {
    let r = check_integer_division(DivOp::DivU, 32, -1, 2);
    assert_eq!(r.value, Some(i32::MAX as i128));
    let r = check_integer_division(DivOp::RemU, 32, -1, -2);
    assert_eq!(r.value, Some(1));
    let r = check_integer_division(DivOp::DivU, 64, -2, -1);
    assert_eq!(r.value, Some(0));
}

#[test]
fn effective_address_never_wraps_at_2_32() {
    // 0xFFFFFFF0 + 0x20 would wrap to 0x10 in u32; it must trap instead.
    let r = check_linear_access(IndexType::I32, 0xFFFF_FFF0, 0x20, 1, 65_536);
    assert_eq!((r.status, r.failure_id), (Status::Trap, LMB_FAILURE_OUT_OF_BOUNDS));
    let r = check_linear_access(IndexType::I64, u64::MAX as u128, 1, 1, 65_536);
    assert_eq!(r.status, Status::Trap);
}

#[test]
fn last_byte_wide_access_is_in_bounds_one_more_traps() {
    let ok = check_linear_access(IndexType::I32, 65_536 - 16, 0, 16, 65_536);
    assert_eq!(ok.status, Status::InBounds);
    let bad = check_linear_access(IndexType::I32, 65_536 - 15, 0, 16, 65_536);
    assert_eq!(bad.status, Status::Trap);
}

#[test]
fn copy_checks_source_and_destination() {
    let r = check_linear_copy(IndexType::I32, 0, 65_536, 1, 65_536);
    assert_eq!(r.status, Status::Trap);
    let r = check_linear_copy(IndexType::I32, 65_536, 0, 1, 65_536);
    assert_eq!(r.status, Status::Trap);
    let r = check_linear_copy(IndexType::I32, 65_536, 65_536, 0, 65_536);
    assert_eq!(r.status, Status::InBounds);
}

#[test]
fn grow_past_limit_returns_minus_one_and_keeps_pages() {
    let r = check_memory_grow(IndexType::I32, 1, 2, Some(2));
    assert_eq!((r.status, r.result, r.pages), (Status::GrowRefused, Some(-1), Some(1)));
    let r = check_memory_grow(IndexType::I32, 1, 1, Some(2));
    assert_eq!((r.status, r.result, r.pages), (Status::Grown, Some(1), Some(2)));
    let r = check_memory_grow(IndexType::I32, 0, 65_537, None);
    assert_eq!(r.status, Status::GrowRefused);
}

#[test]
fn malformed_inputs_are_refused_not_guessed() {
    assert_eq!(check_linear_access(IndexType::I32, 0, 0, 3, 65_536).status, Status::Refused);
    assert_eq!(check_linear_access(IndexType::I32, 1 << 32, 0, 1, 65_536).status, Status::Refused);
    assert_eq!(check_linear_access(IndexType::I32, 0, 0, 1, 65_537).status, Status::Refused);
    assert_eq!(check_memory_grow(IndexType::I32, 3, 0, Some(2)).status, Status::Refused);
    assert_eq!(check_integer_division(DivOp::DivS, 16, 1, 1).status, Status::Refused);
    assert_eq!(evaluate_row_input(&["access", "i16", "0", "0", "1", "0"]).status, Status::Refused);
    assert_eq!(evaluate_row_input(&["div", "div_s", "32", "x", "1"]).status, Status::Refused);
    assert_eq!(evaluate_row_input(&[]).status, Status::Refused);
}

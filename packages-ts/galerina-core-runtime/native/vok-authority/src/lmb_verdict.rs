//! VOK linear-memory batch verdict (MEM-R13, gap map 5.4 / H16, CLI side).
//!
//! MEM-R9 added `linear_memory_bounds` as an exact checker but kept it out of
//! the crate root, so nothing outside its parity test could ask it anything.
//! This module wires it into the crate and gives the `vok-lmb-check` binary a
//! closed, fail-closed batch format:
//!
//! * input is ASCII text, LF line endings only, at most `LMB_BATCH_MAX_ROWS`
//!   rows of at most `LMB_BATCH_MAX_LINE_BYTES` bytes each;
//! * every row is `kind field...` with single spaces, exactly as the SLIDE
//!   derived parity rows write it; anything else is refused for the whole
//!   batch (never skipped, never guessed);
//! * the per-row verdict is the checker's (+1 only for an admitted operation),
//!   and the batch verdict is the strong Kleene AND (minimum) of the rows,
//!   written as a K3 wire byte: 0x01 ALLOW, 0xFF DENY, 0x80 UNKNOWN. An empty
//!   batch is UNKNOWN (an empty `all {}` proves nothing), and gates refuse it;
//! * the report ends with a sha256 over the canonical report body so a caller
//!   can pin a run without trusting a digest it supplied itself.
//!
//! Production admission stays with SLIDE (GIR -> SLIDE). VOK is the unshipped
//! Rust checker beside it; this verdict is evidence, not an admission.

use crate::k3_frame::k3_wire_and;
use crate::linear_memory_bounds::{evaluate_row_input, Outcome};
use crate::sha256::sha256;

pub const LMB_BATCH_SCHEMA: &str = "galerina.vok.lmb-verdict.v1";
pub const LMB_ROWS_SCHEMA: &str = "galerina.vok.linear-memory-trap-vectors.v1";
pub const LMB_BATCH_MAX_ROWS: usize = 65_536;
pub const LMB_BATCH_MAX_LINE_BYTES: usize = 256;
pub const LMB_BATCH_MAX_INPUT_BYTES: usize = LMB_BATCH_MAX_ROWS * (LMB_BATCH_MAX_LINE_BYTES + 1);

pub const LMB_K3_ALLOW: u8 = 0x01;
pub const LMB_K3_DENY: u8 = 0xFF;
pub const LMB_K3_UNKNOWN: u8 = 0x80;

pub const VOK_LMB_INPUT_TOO_LARGE: &str = "VOK_LMB_INPUT_TOO_LARGE";
pub const VOK_LMB_INPUT_NOT_ASCII: &str = "VOK_LMB_INPUT_NOT_ASCII";
pub const VOK_LMB_INPUT_CR: &str = "VOK_LMB_INPUT_CR";
pub const VOK_LMB_LINE_TOO_LONG: &str = "VOK_LMB_LINE_TOO_LONG";
pub const VOK_LMB_LINE_MALFORMED: &str = "VOK_LMB_LINE_MALFORMED";
pub const VOK_LMB_TOO_MANY_ROWS: &str = "VOK_LMB_TOO_MANY_ROWS";
pub const VOK_LMB_ROWS_HEADER: &str = "VOK_LMB_ROWS_HEADER";
pub const VOK_LMB_ROWS_COUNT: &str = "VOK_LMB_ROWS_COUNT";
pub const VOK_LMB_MISMATCH: &str = "VOK_LMB_MISMATCH";

/// Counts per checker status, plus the folded batch verdict.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct LmbBatchVerdict {
    pub rows: usize,
    pub in_bounds: usize,
    pub trap: usize,
    pub grown: usize,
    pub grow_refused: usize,
    pub value: usize,
    pub refused: usize,
    pub verdict_byte: u8,
    pub lines: Vec<String>,
    pub body_sha256: [u8; 32],
}

impl LmbBatchVerdict {
    /// Strong Kleene AND of the rows as a K3 wire byte (0x01 / 0xFF / 0x80).
    pub fn verdict_label(&self) -> &'static str {
        match self.verdict_byte {
            LMB_K3_ALLOW => "ALLOW",
            LMB_K3_DENY => "DENY",
            _ => "UNKNOWN",
        }
    }

    /// The full report: one `input | tail` line per row, then the summary line.
    pub fn report(&self) -> String {
        let mut out = String::new();
        for line in &self.lines {
            out.push_str(line);
            out.push('\n');
        }
        out.push_str(&self.summary_line());
        out.push('\n');
        out
    }

    pub fn summary_line(&self) -> String {
        format!(
            "# {} rows={} in_bounds={} trap={} grown={} grow_refused={} value={} refused={} verdict=0x{:02X} {} body-sha256={}",
            LMB_BATCH_SCHEMA,
            self.rows,
            self.in_bounds,
            self.trap,
            self.grown,
            self.grow_refused,
            self.value,
            self.refused,
            self.verdict_byte,
            self.verdict_label(),
            hex(&self.body_sha256)
        )
    }
}

fn hex(bytes: &[u8]) -> String {
    const DIGITS: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        out.push(DIGITS[(byte >> 4) as usize] as char);
        out.push(DIGITS[(byte & 0x0F) as usize] as char);
    }
    out
}

/// Byte-level shape checks shared by both batch forms.
fn admit_text(input: &[u8]) -> Result<&str, &'static str> {
    if input.len() > LMB_BATCH_MAX_INPUT_BYTES {
        return Err(VOK_LMB_INPUT_TOO_LARGE);
    }
    if input.iter().any(|b| *b == b'\r') {
        return Err(VOK_LMB_INPUT_CR);
    }
    if input.iter().any(|b| !(*b == b'\n' || (0x20..=0x7E).contains(b))) {
        return Err(VOK_LMB_INPUT_NOT_ASCII);
    }
    std::str::from_utf8(input).map_err(|_| VOK_LMB_INPUT_NOT_ASCII)
}

/// Split into lines; a single trailing LF is allowed, an empty line is not.
fn split_lines(text: &str) -> Result<Vec<&str>, &'static str> {
    if text.is_empty() {
        return Ok(Vec::new());
    }
    let body = text.strip_suffix('\n').unwrap_or(text);
    let lines: Vec<&str> = body.split('\n').collect();
    for line in &lines {
        if line.len() > LMB_BATCH_MAX_LINE_BYTES {
            return Err(VOK_LMB_LINE_TOO_LONG);
        }
    }
    Ok(lines)
}

/// A row input must be non-empty single-space separated fields with no
/// leading or trailing space and no '|' (that belongs to the rows form).
fn row_fields(line: &str) -> Result<Vec<&str>, &'static str> {
    if line.is_empty() || line.starts_with(' ') || line.ends_with(' ') || line.contains("  ") || line.contains('|') || line.starts_with('#') {
        return Err(VOK_LMB_LINE_MALFORMED);
    }
    Ok(line.split(' ').collect())
}

fn fold(rows: &[(String, Outcome)]) -> LmbBatchVerdict {
    let mut verdict: i32 = 1;
    let mut counts = [0usize; 6];
    let mut lines = Vec::with_capacity(rows.len());
    for (input, outcome) in rows {
        let slot = match outcome.status.as_str() {
            "IN_BOUNDS" => 0,
            "TRAP" => 1,
            "GROWN" => 2,
            "GROW_REFUSED" => 3,
            "VALUE" => 4,
            _ => 5,
        };
        counts[slot] += 1;
        let row_verdict = if outcome.verdict == 1 { 1 } else { -1 };
        verdict = k3_wire_and(verdict, row_verdict).unwrap_or(-1);
        lines.push(format!("{} | {}", input, outcome.row_tail()));
    }
    let verdict_byte = if rows.is_empty() {
        LMB_K3_UNKNOWN
    } else if verdict == 1 {
        LMB_K3_ALLOW
    } else {
        LMB_K3_DENY
    };
    let mut body = String::new();
    for line in &lines {
        body.push_str(line);
        body.push('\n');
    }
    LmbBatchVerdict {
        rows: rows.len(),
        in_bounds: counts[0],
        trap: counts[1],
        grown: counts[2],
        grow_refused: counts[3],
        value: counts[4],
        refused: counts[5],
        verdict_byte,
        lines,
        body_sha256: sha256(body.as_bytes()),
    }
}

/// Batch of row inputs (`kind field...` per line). Any malformed line fails
/// the whole batch with a typed id; a well-formed row the checker cannot
/// admit is reported as REFUSED SLIDE-LMB-001 and folds to DENY.
pub fn check_lmb_batch(input: &[u8]) -> Result<LmbBatchVerdict, &'static str> {
    let text = admit_text(input)?;
    let lines = split_lines(text)?;
    if lines.len() > LMB_BATCH_MAX_ROWS {
        return Err(VOK_LMB_TOO_MANY_ROWS);
    }
    let mut rows = Vec::with_capacity(lines.len());
    for line in lines {
        let fields = row_fields(line)?;
        rows.push((line.to_string(), evaluate_row_input(&fields)));
    }
    Ok(fold(&rows))
}

/// Replay a SLIDE-derived rows file (`# <schema> rows=N ...` header, then
/// `input | expected-tail` lines). Every row must match exactly; the first
/// mismatch is returned with its 1-based row number.
pub fn replay_lmb_rows(input: &[u8]) -> Result<LmbBatchVerdict, (&'static str, usize)> {
    let text = admit_text(input).map_err(|id| (id, 0))?;
    let lines = split_lines(text).map_err(|id| (id, 0))?;
    let Some((header, body)) = lines.split_first() else {
        return Err((VOK_LMB_ROWS_HEADER, 0));
    };
    let prefix = format!("# {} rows=", LMB_ROWS_SCHEMA);
    let Some(rest) = header.strip_prefix(&prefix) else {
        return Err((VOK_LMB_ROWS_HEADER, 0));
    };
    let declared_text = rest.split(' ').next().unwrap_or("");
    if declared_text.is_empty() || !declared_text.bytes().all(|b| b.is_ascii_digit()) || (declared_text.len() > 1 && declared_text.starts_with('0')) {
        return Err((VOK_LMB_ROWS_HEADER, 0));
    }
    let declared: usize = declared_text.parse().map_err(|_| (VOK_LMB_ROWS_HEADER, 0))?;
    if body.len() > LMB_BATCH_MAX_ROWS {
        return Err((VOK_LMB_TOO_MANY_ROWS, 0));
    }
    if body.len() != declared {
        return Err((VOK_LMB_ROWS_COUNT, 0));
    }
    let mut rows = Vec::with_capacity(body.len());
    for (index, line) in body.iter().enumerate() {
        let number = index + 1;
        let mut parts = line.splitn(2, " | ");
        let input = parts.next().unwrap_or("");
        let Some(expected) = parts.next() else {
            return Err((VOK_LMB_LINE_MALFORMED, number));
        };
        let fields = row_fields(input).map_err(|id| (id, number))?;
        if expected.is_empty() || expected.contains('|') {
            return Err((VOK_LMB_LINE_MALFORMED, number));
        }
        let outcome = evaluate_row_input(&fields);
        if outcome.row_tail() != expected {
            return Err((VOK_LMB_MISMATCH, number));
        }
        rows.push((input.to_string(), outcome));
    }
    Ok(fold(&rows))
}

#[cfg(test)]
mod tests {
    use super::*;

    const ROWS: &str = include_str!("../vectors/linear-memory-trap-vectors.rows.txt");

    fn lf(text: &str) -> Vec<u8> {
        text.replace("\r\n", "\n").into_bytes()
    }

    #[test]
    fn parity_rows_replay_clean_and_count_every_status() {
        let verdict = replay_lmb_rows(&lf(ROWS)).expect("SLIDE parity rows replay");
        assert!(verdict.rows > 1200, "rows {}", verdict.rows);
        assert_eq!(
            verdict.in_bounds + verdict.trap + verdict.grown + verdict.grow_refused + verdict.value + verdict.refused,
            verdict.rows
        );
        for (name, count) in [("in_bounds", verdict.in_bounds), ("trap", verdict.trap), ("grown", verdict.grown), ("grow_refused", verdict.grow_refused), ("value", verdict.value), ("refused", verdict.refused)] {
            assert!(count > 0, "no {} rows", name);
        }
        assert_eq!(verdict.verdict_byte, LMB_K3_DENY, "grid holds traps, so AND is DENY");
    }

    #[test]
    fn all_admitted_batch_is_allow_0x01() {
        let v = check_lmb_batch(b"access i32 0 0 1 65536\ndiv div_s 32 7 2\ngrow i32 1 1 2\n").unwrap();
        assert_eq!((v.rows, v.verdict_byte, v.verdict_label()), (3, LMB_K3_ALLOW, "ALLOW"));
        assert_eq!(v.lines[1], "div div_s 32 7 2 | VALUE NONE 3");
        assert_eq!(v.lines[2], "grow i32 1 1 2 | GROWN NONE 1 2");
    }

    #[test]
    fn one_trap_makes_the_batch_deny_strong_kleene_min() {
        let v = check_lmb_batch(b"access i32 0 0 1 65536\naccess i32 65536 0 1 65536\n").unwrap();
        assert_eq!((v.trap, v.verdict_byte), (1, LMB_K3_DENY));
        let v = check_lmb_batch(b"access i32 65536 0 1 65536\naccess i32 0 0 1 65536\n").unwrap();
        assert_eq!(v.verdict_byte, LMB_K3_DENY, "order must not matter");
    }

    #[test]
    fn refused_row_folds_to_deny_not_unknown() {
        let v = check_lmb_batch(b"access i16 0 0 1 0\n").unwrap();
        assert_eq!((v.refused, v.verdict_byte), (1, LMB_K3_DENY));
        assert_eq!(v.lines[0], "access i16 0 0 1 0 | REFUSED SLIDE-LMB-001");
    }

    #[test]
    fn empty_batch_is_unknown_0x80_never_allow() {
        let v = check_lmb_batch(b"").unwrap();
        assert_eq!((v.rows, v.verdict_byte, v.verdict_label()), (0, LMB_K3_UNKNOWN, "UNKNOWN"));
        assert!(v.summary_line().contains("verdict=0x80 UNKNOWN"));
    }

    #[test]
    fn byte_shape_is_closed() {
        assert_eq!(check_lmb_batch(b"access i32 0 0 1 65536\r\n"), Err(VOK_LMB_INPUT_CR));
        assert_eq!(check_lmb_batch(b"access\ti32 0 0 1 65536\n"), Err(VOK_LMB_INPUT_NOT_ASCII));
        assert_eq!(check_lmb_batch("access i32 0 0 1 65536 \u{e9}\n".as_bytes()), Err(VOK_LMB_INPUT_NOT_ASCII));
        assert_eq!(check_lmb_batch(b"access i32 0 0 1 65536\n\n"), Err(VOK_LMB_LINE_MALFORMED));
        assert_eq!(check_lmb_batch(b"\n"), Err(VOK_LMB_LINE_MALFORMED));
        assert_eq!(check_lmb_batch(b" access i32 0 0 1 65536\n"), Err(VOK_LMB_LINE_MALFORMED));
        assert_eq!(check_lmb_batch(b"access i32 0 0 1 65536 \n"), Err(VOK_LMB_LINE_MALFORMED));
        assert_eq!(check_lmb_batch(b"access  i32 0 0 1 65536\n"), Err(VOK_LMB_LINE_MALFORMED));
        assert_eq!(check_lmb_batch(b"access i32 0 0 1 65536 | IN_BOUNDS NONE\n"), Err(VOK_LMB_LINE_MALFORMED));
        assert_eq!(check_lmb_batch(b"# comment\n"), Err(VOK_LMB_LINE_MALFORMED));
        let long = format!("div div_s 32 {} 1\n", "1".repeat(LMB_BATCH_MAX_LINE_BYTES));
        assert_eq!(check_lmb_batch(long.as_bytes()), Err(VOK_LMB_LINE_TOO_LONG));
    }

    #[test]
    fn row_and_byte_caps_hold() {
        let row = "access i32 0 0 1 65536\n";
        let at_cap = row.repeat(LMB_BATCH_MAX_ROWS);
        assert_eq!(check_lmb_batch(at_cap.as_bytes()).unwrap().rows, LMB_BATCH_MAX_ROWS);
        let over = row.repeat(LMB_BATCH_MAX_ROWS + 1);
        assert_eq!(check_lmb_batch(over.as_bytes()), Err(VOK_LMB_TOO_MANY_ROWS));
        let huge = vec![b'a'; LMB_BATCH_MAX_INPUT_BYTES + 1];
        assert_eq!(check_lmb_batch(&huge), Err(VOK_LMB_INPUT_TOO_LARGE));
    }

    #[test]
    fn digest_is_over_the_row_lines_and_changes_with_any_row() {
        let a = check_lmb_batch(b"div div_s 32 7 2\n").unwrap();
        let b = check_lmb_batch(b"div div_s 32 7 3\n").unwrap();
        assert_ne!(a.body_sha256, b.body_sha256);
        assert_eq!(a.body_sha256, sha256(b"div div_s 32 7 2 | VALUE NONE 3\n"));
        let again = check_lmb_batch(b"div div_s 32 7 2").unwrap();
        assert_eq!(a.body_sha256, again.body_sha256, "missing final LF is the same batch");
        assert!(a.report().ends_with(&format!("body-sha256={}\n", hex(&a.body_sha256))));
    }

    #[test]
    fn replay_refuses_tampered_header_count_and_rows() {
        let good = "# galerina.vok.linear-memory-trap-vectors.v1 rows=1 x=y\ndiv div_s 32 7 2 | VALUE NONE 3\n";
        assert_eq!(replay_lmb_rows(good.as_bytes()).unwrap().verdict_byte, LMB_K3_ALLOW);
        let wrong_value = good.replace("VALUE NONE 3", "VALUE NONE 4");
        assert_eq!(replay_lmb_rows(wrong_value.as_bytes()), Err((VOK_LMB_MISMATCH, 1)));
        let wrong_schema = good.replace("trap-vectors.v1", "trap-vectors.v2");
        assert_eq!(replay_lmb_rows(wrong_schema.as_bytes()), Err((VOK_LMB_ROWS_HEADER, 0)));
        let wrong_count = good.replace("rows=1", "rows=2");
        assert_eq!(replay_lmb_rows(wrong_count.as_bytes()), Err((VOK_LMB_ROWS_COUNT, 0)));
        let padded = good.replace("rows=1", "rows=01");
        assert_eq!(replay_lmb_rows(padded.as_bytes()), Err((VOK_LMB_ROWS_HEADER, 0)));
        let no_bar = good.replace(" | ", " ");
        assert_eq!(replay_lmb_rows(no_bar.as_bytes()), Err((VOK_LMB_LINE_MALFORMED, 1)));
        assert_eq!(replay_lmb_rows(b""), Err((VOK_LMB_ROWS_HEADER, 0)));
        let crlf = good.replace('\n', "\r\n");
        assert_eq!(replay_lmb_rows(crlf.as_bytes()), Err((VOK_LMB_INPUT_CR, 0)));
    }

    #[test]
    fn a_trap_row_expected_as_in_bounds_is_a_mismatch() {
        // Mutant guard: if the checker ever admitted the one-past-end byte,
        // the SLIDE row would stop matching here.
        let rows = "# galerina.vok.linear-memory-trap-vectors.v1 rows=1\naccess i32 65536 0 1 65536 | IN_BOUNDS NONE\n";
        assert_eq!(replay_lmb_rows(rows.as_bytes()), Err((VOK_LMB_MISMATCH, 1)));
    }
}

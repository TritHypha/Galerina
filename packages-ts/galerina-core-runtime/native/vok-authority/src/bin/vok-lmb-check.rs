#![forbid(unsafe_code)]
//! vok-lmb-check (MEM-R13): run VOK's linear-memory bounds and integer-trap
//! checker over a batch and print a K3 batch verdict.
//!
//!   vok-lmb-check --stdin [--gate]        rows `kind field...` on stdin
//!   vok-lmb-check --rows FILE [--gate]    replay a SLIDE-derived rows file
//!
//! stdout: one `input | STATUS FAILURE [extra]` line per row, then
//! `# galerina.vok.lmb-verdict.v1 ... verdict=0xNN LABEL body-sha256=...`.
//! Typed failures go to stderr with rc 1 and nothing on stdout. With
//! `--gate`, any verdict but ALLOW (0x01) exits 2 after the report, so
//! UNKNOWN (empty batch) and DENY both refuse. VOK is a checker beside SLIDE,
//! not the production admission path.

use std::env;
use std::fs::File;
use std::io::{self, Read, Write};
use std::process::ExitCode;

use galerina_vok_authority::lmb_verdict::{
    check_lmb_batch, replay_lmb_rows, LmbBatchVerdict, LMB_BATCH_MAX_INPUT_BYTES, LMB_K3_ALLOW,
    VOK_LMB_INPUT_TOO_LARGE,
};

const VOK_LMB_USAGE: &str = "VOK_LMB_USAGE";
const VOK_LMB_CALLER_DIGEST_REFUSED: &str = "VOK_LMB_CALLER_DIGEST_REFUSED";
const VOK_LMB_READ_FAILED: &str = "VOK_LMB_READ_FAILED";
const VOK_LMB_WRITE_FAILED: &str = "VOK_LMB_WRITE_FAILED";
const VOK_LMB_GATE_REFUSED: &str = "VOK_LMB_GATE_REFUSED";

fn refuse(id: &str) -> ExitCode {
    let mut stderr = io::stderr().lock();
    let _ = writeln!(stderr, "{id}");
    ExitCode::from(1)
}

fn read_bounded(reader: impl Read) -> Result<Vec<u8>, &'static str> {
    let mut out = Vec::new();
    let limit = (LMB_BATCH_MAX_INPUT_BYTES as u64) + 1;
    reader
        .take(limit)
        .read_to_end(&mut out)
        .map_err(|_| VOK_LMB_READ_FAILED)?;
    if out.len() > LMB_BATCH_MAX_INPUT_BYTES {
        return Err(VOK_LMB_INPUT_TOO_LARGE);
    }
    Ok(out)
}

fn emit(verdict: &LmbBatchVerdict, gate: bool) -> ExitCode {
    let report = verdict.report();
    let mut stdout = io::stdout().lock();
    if stdout.write_all(report.as_bytes()).and_then(|_| stdout.flush()).is_err() {
        return refuse(VOK_LMB_WRITE_FAILED);
    }
    if gate && verdict.verdict_byte != LMB_K3_ALLOW {
        let mut stderr = io::stderr().lock();
        let _ = writeln!(stderr, "{} {}", VOK_LMB_GATE_REFUSED, verdict.verdict_label());
        return ExitCode::from(2);
    }
    ExitCode::SUCCESS
}

fn main() -> ExitCode {
    let args: Vec<String> = env::args().collect();
    for arg in &args[1..] {
        if arg == "--digest"
            || arg.starts_with("--digest=")
            || arg == "--expected-digest"
            || arg.starts_with("--expected-digest=")
            || arg == "--expected"
            || arg.starts_with("--expected=")
        {
            return refuse(VOK_LMB_CALLER_DIGEST_REFUSED);
        }
    }

    let mut stdin_mode = false;
    let mut rows_path: Option<String> = None;
    let mut gate = false;
    let mut index = 1_usize;
    while index < args.len() {
        match args[index].as_str() {
            "--stdin" if !stdin_mode => stdin_mode = true,
            "--gate" if !gate => gate = true,
            "--rows" if rows_path.is_none() => {
                index += 1;
                match args.get(index) {
                    Some(path) if !path.is_empty() && !path.starts_with("--") => {
                        rows_path = Some(path.clone())
                    }
                    _ => return refuse(VOK_LMB_USAGE),
                }
            }
            _ => return refuse(VOK_LMB_USAGE),
        }
        index += 1;
    }

    match (stdin_mode, rows_path) {
        (true, None) => {
            let input = match read_bounded(io::stdin().lock()) {
                Ok(bytes) => bytes,
                Err(id) => return refuse(id),
            };
            match check_lmb_batch(&input) {
                Ok(verdict) => emit(&verdict, gate),
                Err(id) => refuse(id),
            }
        }
        (false, Some(path)) => {
            let file = match File::open(&path) {
                Ok(file) => file,
                Err(_) => return refuse(VOK_LMB_READ_FAILED),
            };
            let input = match read_bounded(file) {
                Ok(bytes) => bytes,
                Err(id) => return refuse(id),
            };
            match replay_lmb_rows(&input) {
                Ok(verdict) => emit(&verdict, gate),
                Err((id, 0)) => refuse(id),
                Err((id, row)) => refuse(&format!("{id} row={row}")),
            }
        }
        _ => refuse(VOK_LMB_USAGE),
    }
}

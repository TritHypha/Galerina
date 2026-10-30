#![forbid(unsafe_code)]
//! vok-lease-audit (MEM-R14): check a synthetic lease event log for the
//! one-use lease rules (gap map H1 / 1.1 / 1.4) and print a K3 verdict.
//!
//!   vok-lease-audit --stdin [--gate]
//!
//! stdout: one `lease <id> epoch=.. uses=.. receipts=.. refusals=.. | LABEL
//! CODE` line per lease, then `# galerina.vok.lease-audit.v1 ... verdict=0xNN
//! LABEL body-sha256=...`. Typed failures go to stderr with rc 1 and nothing
//! on stdout. With `--gate`, any verdict but ALLOW (0x01) exits 2 after the
//! report, so UNKNOWN (truncated or never-used log) and DENY both refuse.
//! VOK is a checker beside SLIDE, not the production admission path.

use std::env;
use std::io::{self, Read, Write};
use std::process::ExitCode;

use galerina_vok_authority::lease_audit::{
    audit_lease_log, LeaseAuditVerdict, LA_K3_ALLOW, LEASE_AUDIT_MAX_INPUT_BYTES,
    VOK_LA_INPUT_TOO_LARGE,
};

const VOK_LA_USAGE: &str = "VOK_LA_USAGE";
const VOK_LA_CALLER_DIGEST_REFUSED: &str = "VOK_LA_CALLER_DIGEST_REFUSED";
const VOK_LA_READ_FAILED: &str = "VOK_LA_READ_FAILED";
const VOK_LA_WRITE_FAILED: &str = "VOK_LA_WRITE_FAILED";
const VOK_LA_GATE_REFUSED: &str = "VOK_LA_GATE_REFUSED";

fn refuse(id: &str) -> ExitCode {
    let mut stderr = io::stderr().lock();
    let _ = writeln!(stderr, "{id}");
    ExitCode::from(1)
}

fn read_bounded(reader: impl Read) -> Result<Vec<u8>, &'static str> {
    let mut out = Vec::new();
    let limit = (LEASE_AUDIT_MAX_INPUT_BYTES as u64) + 1;
    reader
        .take(limit)
        .read_to_end(&mut out)
        .map_err(|_| VOK_LA_READ_FAILED)?;
    if out.len() > LEASE_AUDIT_MAX_INPUT_BYTES {
        return Err(VOK_LA_INPUT_TOO_LARGE);
    }
    Ok(out)
}

fn emit(verdict: &LeaseAuditVerdict, gate: bool) -> ExitCode {
    let report = verdict.report();
    let mut stdout = io::stdout().lock();
    if stdout.write_all(report.as_bytes()).and_then(|_| stdout.flush()).is_err() {
        return refuse(VOK_LA_WRITE_FAILED);
    }
    if gate && verdict.verdict_byte != LA_K3_ALLOW {
        let mut stderr = io::stderr().lock();
        let _ = writeln!(stderr, "{} {}", VOK_LA_GATE_REFUSED, verdict.verdict_label());
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
            return refuse(VOK_LA_CALLER_DIGEST_REFUSED);
        }
    }

    let mut stdin_mode = false;
    let mut gate = false;
    for arg in &args[1..] {
        match arg.as_str() {
            "--stdin" if !stdin_mode => stdin_mode = true,
            "--gate" if !gate => gate = true,
            _ => return refuse(VOK_LA_USAGE),
        }
    }
    if !stdin_mode {
        return refuse(VOK_LA_USAGE);
    }

    let input = match read_bounded(io::stdin().lock()) {
        Ok(bytes) => bytes,
        Err(id) => return refuse(id),
    };
    match audit_lease_log(&input) {
        Ok(verdict) => emit(&verdict, gate),
        Err(id) => refuse(id),
    }
}

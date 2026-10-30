//! MEM-R14: CLI tests for vok-lease-audit. Each refusal asserts the typed id
//! on stderr, empty stdout and the exit code, so deleting a refuse turns it
//! red. All logs are synthetic.

#![forbid(unsafe_code)]

use std::io::Write;
use std::path::PathBuf;
use std::process::{Command, Output, Stdio};

const A: &str = "00000000000000a1";
const H: &str = "5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a";

fn exe() -> PathBuf {
    for key in ["CARGO_BIN_EXE_vok_lease_audit", "CARGO_BIN_EXE_vok-lease-audit"] {
        if let Ok(path) = std::env::var(key) {
            if !path.is_empty() {
                return PathBuf::from(path);
            }
        }
    }
    PathBuf::from(env!("CARGO_BIN_EXE_vok-lease-audit"))
}

fn run(args: &[&str], stdin: &[u8]) -> Output {
    let path = exe();
    assert!(path.is_file(), "VOK_LEASE_AUDIT_MISSING {}", path.display());
    let mut child = Command::new(path)
        .args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("vok-lease-audit must be spawnable");
    {
        let mut pipe = child.stdin.take().expect("stdin pipe");
        let _ = pipe.write_all(stdin);
    }
    child.wait_with_output().expect("vok-lease-audit must finish")
}

fn stdout(out: &Output) -> String {
    String::from_utf8(out.stdout.clone()).expect("stdout ascii")
}

fn stderr(out: &Output) -> String {
    String::from_utf8(out.stderr.clone()).expect("stderr ascii")
}

fn assert_refused(out: &Output, id: &str) {
    assert_eq!(out.status.code(), Some(1), "rc for {id}: stderr {}", stderr(out));
    assert_eq!(stderr(out).trim_end(), id);
    assert!(out.stdout.is_empty(), "refusal {id} must print nothing on stdout");
}

fn clean_log(reuses: usize) -> String {
    let mut text = format!("open {A} 7\nuse {A} 7\nreceipt {A} 7 ALLOW {H}\n");
    for _ in 0..reuses {
        text.push_str(&format!("use {A} 7\nrefused {A} 7 REUSE 0\n"));
    }
    text
}

#[test]
fn clean_log_reports_allow_and_gate_passes() {
    for args in [&["--stdin"][..], &["--stdin", "--gate"][..], &["--gate", "--stdin"][..]] {
        let out = run(args, clean_log(23).as_bytes());
        assert_eq!(out.status.code(), Some(0), "args {args:?}: {}", stderr(&out));
        let text = stdout(&out);
        let lines: Vec<&str> = text.lines().collect();
        assert_eq!(lines.len(), 2);
        assert_eq!(lines[0], format!("lease {A} epoch=7 uses=24 receipts=1 refusals=23 | ALLOW VOK_LA_OK"));
        assert!(lines[1].starts_with("# galerina.vok.lease-audit.v1 events=49 leases=1 uses=24 receipts=1 refusals=23 verdict=0x01 ALLOW body-sha256="));
        assert!(stderr(&out).is_empty());
    }
}

#[test]
fn admitted_reuse_reports_deny_and_gate_refuses_with_rc_2() {
    let log = format!("{}use {A} 7\nreceipt {A} 7 ALLOW {H}\n", clean_log(0));
    let plain = run(&["--stdin"], log.as_bytes());
    assert_eq!(plain.status.code(), Some(0));
    assert!(stdout(&plain).contains("| DENY VOK_LA_SECOND_RECEIPT"));
    assert!(stdout(&plain).contains("verdict=0xFF DENY"));
    let gated = run(&["--stdin", "--gate"], log.as_bytes());
    assert_eq!(gated.status.code(), Some(2));
    assert_eq!(stdout(&gated), stdout(&plain), "gate still prints the report");
    assert_eq!(stderr(&gated).trim_end(), "VOK_LA_GATE_REFUSED DENY");
}

#[test]
fn truncated_and_empty_logs_are_unknown_and_the_gate_refuses_them() {
    let truncated = format!("{}use {A} 7\n", clean_log(2));
    let out = run(&["--stdin", "--gate"], truncated.as_bytes());
    assert_eq!(out.status.code(), Some(2));
    assert!(stdout(&out).contains("| UNKNOWN VOK_LA_TRUNCATED"));
    assert!(stdout(&out).contains("verdict=0x80 UNKNOWN"));
    assert_eq!(stderr(&out).trim_end(), "VOK_LA_GATE_REFUSED UNKNOWN");
    let empty = run(&["--stdin", "--gate"], b"");
    assert_eq!(empty.status.code(), Some(2));
    assert!(stdout(&empty).contains("events=0 leases=0"));
    assert_eq!(stderr(&empty).trim_end(), "VOK_LA_GATE_REFUSED UNKNOWN");
}

#[test]
fn unaudited_reuse_and_leaking_refusal_deny() {
    let unanswered = format!("{}use {A} 7\nuse {A} 7\nrefused {A} 7 REUSE 0\n", clean_log(0));
    let out = run(&["--stdin"], unanswered.as_bytes());
    assert!(stdout(&out).contains("| DENY VOK_LA_USE_UNANSWERED"));
    let leak = format!("{}use {A} 7\nrefused {A} 7 REUSE 16\n", clean_log(0));
    let out = run(&["--stdin"], leak.as_bytes());
    assert!(stdout(&out).contains("| DENY VOK_LA_REFUSAL_BYTES"));
}

#[test]
fn malformed_logs_refuse_with_typed_ids() {
    assert_refused(&run(&["--stdin"], clean_log(1).replace('\n', "\r\n").as_bytes()), "VOK_LA_INPUT_CR");
    assert_refused(&run(&["--stdin"], format!("open {A} 0\n").as_bytes()), "VOK_LA_EPOCH_NONPOSITIVE");
    assert_refused(&run(&["--stdin"], format!("open {A} -3\n").as_bytes()), "VOK_LA_EPOCH_NONPOSITIVE");
    assert_refused(&run(&["--stdin"], format!("grant {A} 7\n").as_bytes()), "VOK_LA_LINE_MALFORMED");
    assert_refused(&run(&["--stdin"], format!("refused {A} 7 LOST 0\n").as_bytes()), "VOK_LA_FIELD");
    assert_refused(&run(&["--stdin"], "open 00000000000000a1 7 \u{e9}\n".as_bytes()), "VOK_LA_INPUT_NOT_ASCII");
}

#[test]
fn caller_digests_and_bad_usage_are_refused() {
    for arg in ["--digest", "--digest=ab", "--expected", "--expected=ab", "--expected-digest", "--expected-digest=ab"] {
        assert_refused(&run(&["--stdin", arg], clean_log(1).as_bytes()), "VOK_LA_CALLER_DIGEST_REFUSED");
    }
    for args in [&[][..], &["--gate"][..], &["--stdin", "--stdin"][..], &["--stdin", "--gate", "--gate"][..], &["--rows", "x"][..], &["--stdin", "extra"][..]] {
        assert_refused(&run(args, clean_log(1).as_bytes()), "VOK_LA_USAGE");
    }
}

#[test]
fn oversized_input_is_refused_before_parsing() {
    let huge = vec![b'a'; galerina_vok_authority::lease_audit::LEASE_AUDIT_MAX_INPUT_BYTES + 1];
    assert_refused(&run(&["--stdin"], &huge), "VOK_LA_INPUT_TOO_LARGE");
}

#[test]
fn same_log_same_digest_and_any_change_moves_it() {
    let a = stdout(&run(&["--stdin"], clean_log(3).as_bytes()));
    let b = stdout(&run(&["--stdin"], clean_log(3).as_bytes()));
    let c = stdout(&run(&["--stdin"], clean_log(4).as_bytes()));
    let digest = |text: &str| text.rsplit("body-sha256=").next().unwrap().trim_end().to_string();
    assert_eq!(digest(&a), digest(&b));
    assert_ne!(digest(&a), digest(&c));
    assert_eq!(digest(&a).len(), 64);
}

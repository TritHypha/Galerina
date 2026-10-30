//! MEM-R13: CLI tests for vok-lmb-check. Each refusal asserts the typed id on
//! stderr, empty stdout and the exit code, so deleting a refuse turns it red.

#![forbid(unsafe_code)]

use std::io::Write;
use std::path::PathBuf;
use std::process::{Command, Output, Stdio};

fn exe() -> PathBuf {
    for key in ["CARGO_BIN_EXE_vok_lmb_check", "CARGO_BIN_EXE_vok-lmb-check"] {
        if let Ok(path) = std::env::var(key) {
            if !path.is_empty() {
                return PathBuf::from(path);
            }
        }
    }
    PathBuf::from(env!("CARGO_BIN_EXE_vok-lmb-check"))
}

fn run(args: &[&str], stdin: &[u8]) -> Output {
    let path = exe();
    assert!(path.is_file(), "VOK_LMB_CHECK_MISSING {}", path.display());
    let mut child = Command::new(path)
        .args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("vok-lmb-check must be spawnable");
    {
        let mut pipe = child.stdin.take().expect("stdin pipe");
        let _ = pipe.write_all(stdin);
    }
    child.wait_with_output().expect("vok-lmb-check must finish")
}

fn rows_file() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("vectors/linear-memory-trap-vectors.rows.txt")
}

fn lf_copy(name: &str, text: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("vok-lmb-check-{}", std::process::id()));
    std::fs::create_dir_all(&dir).expect("temp dir");
    let path = dir.join(name);
    std::fs::write(&path, text.replace("\r\n", "\n")).expect("write temp rows");
    path
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
    assert!(out.stdout.is_empty(), "stdout must be empty on {id}");
}

#[test]
fn replays_the_slide_parity_rows_file() {
    let text = std::fs::read_to_string(rows_file()).expect("rows file");
    let path = lf_copy("rows.txt", &text);
    let out = run(&["--rows", path.to_str().unwrap()], b"");
    assert_eq!(out.status.code(), Some(0), "stderr {}", stderr(&out));
    let report = stdout(&out);
    let summary = report.lines().last().expect("summary");
    assert!(summary.starts_with("# galerina.vok.lmb-verdict.v1 rows=1299 "), "{summary}");
    assert!(summary.contains(" verdict=0xFF DENY body-sha256="), "{summary}");
    assert_eq!(report.lines().count(), 1300);
    let body: Vec<&str> = text.lines().skip(1).map(|l| l.trim_end_matches('\r')).collect();
    let got: Vec<&str> = report.lines().take(1299).collect();
    assert_eq!(got, body, "CLI rows must equal the SLIDE rows byte for byte");
}

#[test]
fn stdin_batch_all_admitted_is_allow_and_passes_the_gate() {
    let out = run(&["--stdin", "--gate"], b"access i32 0 0 8 65536\ndiv rem_s 64 -9223372036854775808 -1\n");
    assert_eq!(out.status.code(), Some(0), "stderr {}", stderr(&out));
    let report = stdout(&out);
    assert!(report.contains("access i32 0 0 8 65536 | IN_BOUNDS NONE\n"));
    assert!(report.contains("div rem_s 64 -9223372036854775808 -1 | VALUE NONE 0\n"));
    assert!(report.contains(" verdict=0x01 ALLOW "));
}

#[test]
fn gate_refuses_deny_with_rc_2_after_the_report() {
    let out = run(&["--gate", "--stdin"], b"div div_s 32 -2147483648 -1\n");
    assert_eq!(out.status.code(), Some(2));
    assert!(stdout(&out).contains("div div_s 32 -2147483648 -1 | TRAP SLIDE-LMB-004\n"));
    assert_eq!(stderr(&out).trim_end(), "VOK_LMB_GATE_REFUSED DENY");
}

#[test]
fn gate_refuses_unknown_empty_batch() {
    let out = run(&["--stdin", "--gate"], b"");
    assert_eq!(out.status.code(), Some(2));
    assert!(stdout(&out).contains("rows=0 "));
    assert!(stdout(&out).contains(" verdict=0x80 UNKNOWN "));
    assert_eq!(stderr(&out).trim_end(), "VOK_LMB_GATE_REFUSED UNKNOWN");
}

#[test]
fn without_gate_deny_is_reported_with_rc_0() {
    let out = run(&["--stdin"], b"access i32 65536 0 1 65536\n");
    assert_eq!(out.status.code(), Some(0));
    assert!(stdout(&out).contains(" verdict=0xFF DENY "));
}

#[test]
fn caller_digest_flags_are_refused_first() {
    for flag in ["--digest", "--digest=ab", "--expected-digest", "--expected-digest=ab", "--expected", "--expected=x"] {
        assert_refused(&run(&["--stdin", flag], b"div div_s 32 1 1\n"), "VOK_LMB_CALLER_DIGEST_REFUSED");
    }
}

#[test]
fn usage_is_closed() {
    for args in [
        &[][..],
        &["--stdin", "--stdin"][..],
        &["--gate", "--gate", "--stdin"][..],
        &["--rows"][..],
        &["--rows", ""][..],
        &["--rows", "--stdin"][..],
        &["--rows", "a", "--rows", "b"][..],
        &["--stdin", "--rows", "a"][..],
        &["--gate"][..],
        &["--verbose", "--stdin"][..],
        &["stdin"][..],
    ] {
        assert_refused(&run(args, b""), "VOK_LMB_USAGE");
    }
}

#[test]
fn malformed_stdin_fails_the_whole_batch() {
    assert_refused(&run(&["--stdin"], b"div div_s 32 1 1\r\n"), "VOK_LMB_INPUT_CR");
    assert_refused(&run(&["--stdin"], b"div div_s 32 1 1\n\n"), "VOK_LMB_LINE_MALFORMED");
    assert_refused(&run(&["--stdin"], b"div div_s 32 1 1 | VALUE NONE 1\n"), "VOK_LMB_LINE_MALFORMED");
    assert_refused(&run(&["--stdin"], &[0xC3, 0xA9, b'\n']), "VOK_LMB_INPUT_NOT_ASCII");
}

#[test]
fn rows_file_mismatch_names_the_row() {
    let path = lf_copy(
        "bad.txt",
        "# galerina.vok.linear-memory-trap-vectors.v1 rows=2\ndiv div_s 32 7 2 | VALUE NONE 3\naccess i32 65536 0 1 65536 | IN_BOUNDS NONE\n",
    );
    assert_refused(&run(&["--rows", path.to_str().unwrap()], b""), "VOK_LMB_MISMATCH row=2");
}

#[test]
fn rows_file_header_and_missing_file_are_refused() {
    let path = lf_copy("hdr.txt", "# other.schema rows=1\ndiv div_s 32 7 2 | VALUE NONE 3\n");
    assert_refused(&run(&["--rows", path.to_str().unwrap()], b""), "VOK_LMB_ROWS_HEADER");
    let missing = std::env::temp_dir().join("vok-lmb-check-no-such-file.txt");
    assert_refused(&run(&["--rows", missing.to_str().unwrap()], b""), "VOK_LMB_READ_FAILED");
}

#[test]
fn oversize_stdin_is_refused_before_parsing() {
    let big = vec![b'a'; galerina_vok_authority::lmb_verdict::LMB_BATCH_MAX_INPUT_BYTES + 1];
    assert_refused(&run(&["--stdin"], &big), "VOK_LMB_INPUT_TOO_LARGE");
}

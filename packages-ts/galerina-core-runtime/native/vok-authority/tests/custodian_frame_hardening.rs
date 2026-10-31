//! MEM-R19 process tests for the secret-arena custodian (gap map 3.5, H11,
//! H5 / 1.5 and the custodian half of 2.2). They drive the real binary over
//! its stdin/stdout framing with synthetic data only:
//! - a clean EOF on a frame boundary exits 0; a partial header, a short body,
//!   a zero or oversize length exits 1 and nothing after the cut is answered;
//! - operands must have the exact length (trailing bytes are INVALID, the
//!   session continues);
//! - on Linux the running custodian is non-dumpable with a zero core limit;
//! - a SIGKILL mid-request leaves no reply and no canary on stdout/stderr.

use std::io::{Read, Write};
use std::path::PathBuf;
use std::process::{Child, Command, Output, Stdio};

const CANARY: &[u8] = b"SYNTH-CANARY-7f3a";
const WINDOW: usize = 4;
const ST_OK: u8 = 0;
const ST_INVALID: u8 = 3;
const ST_UNSUPPORTED: u8 = 5;
const OP_PUT: u8 = 1;
const OP_HAS: u8 = 2;
const OP_GET: u8 = 3;
const OP_CLEANUP: u8 = 4;
const OP_STATUS: u8 = 5;
const OP_EPOCH: u8 = 7;

fn custodian() -> PathBuf {
    if let Some(path) = option_env!("CARGO_BIN_EXE_galerina-secret-arena-custodian") {
        return PathBuf::from(path);
    }
    for key in [
        "CARGO_BIN_EXE_galerina_secret_arena_custodian",
        "CARGO_BIN_EXE_galerina-secret-arena-custodian",
    ] {
        if let Ok(path) = std::env::var(key) {
            if !path.is_empty() {
                return PathBuf::from(path);
            }
        }
    }
    panic!("custodian binary path missing");
}

fn spawn() -> Child {
    let path = custodian();
    assert!(path.is_file(), "VOK_BIN_MISSING {}", path.display());
    Command::new(&path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("custodian must be spawnable")
}

fn run(stdin: &[u8]) -> Output {
    let mut child = spawn();
    {
        let mut pipe = child.stdin.take().expect("stdin pipe");
        let _ = pipe.write_all(stdin);
    }
    child.wait_with_output().expect("custodian must finish")
}

fn frame(payload: &[u8]) -> Vec<u8> {
    let mut out = (payload.len() as u32).to_be_bytes().to_vec();
    out.extend_from_slice(payload);
    out
}

fn named(opcode: u8, name: &[u8], value: &[u8]) -> Vec<u8> {
    let mut payload = vec![opcode];
    payload.extend_from_slice(&(name.len() as u16).to_be_bytes());
    payload.extend_from_slice(name);
    payload.extend_from_slice(value);
    frame(&payload)
}

fn replies(out: &[u8]) -> Vec<(u8, Vec<u8>)> {
    let mut rest = out;
    let mut parsed = Vec::new();
    while !rest.is_empty() {
        assert!(rest.len() >= 4, "short reply header {out:?}");
        let len = u32::from_be_bytes([rest[0], rest[1], rest[2], rest[3]]) as usize;
        assert!(len >= 1 && rest.len() >= 4 + len, "bad reply frame {out:?}");
        parsed.push((rest[4], rest[5..4 + len].to_vec()));
        rest = &rest[4 + len..];
    }
    parsed
}

fn has_trace(hay: &[u8]) -> bool {
    CANARY
        .windows(WINDOW)
        .any(|needle| hay.windows(WINDOW).any(|w| w == needle))
}

fn assert_quiet(label: &str, out: &Output) {
    assert!(!has_trace(&out.stdout), "{label}: canary on stdout");
    assert!(!has_trace(&out.stderr), "{label}: canary on stderr");
    assert!(out.stderr.is_empty(), "{label}: custodian writes nothing to stderr");
}

/// With VOK_EXPECT_ARENA=1 (set on hosts known to support memfd_secret,
/// such as the WSL2 runner) an open refusal is a failure, not a skip, so a
/// broken hardening step that fails closed can't hide as "unsupported".
fn expect_arena() -> bool {
    std::env::var("VOK_EXPECT_ARENA").as_deref() == Ok("1")
}

/// The hello every session starts with; the open refusal (no secretmem
/// support at all) is the only accepted alternative and ends the test early.
fn opened(out: &Output) -> bool {
    if out.status.code() == Some(2) {
        assert_eq!(out.stdout, vec![0, 0, 0, 1, ST_UNSUPPORTED], "open refusal is bare");
        assert!(!expect_arena(), "custodian refused to open but VOK_EXPECT_ARENA=1");
        return false;
    }
    true
}

#[test]
fn a_clean_eof_on_a_frame_boundary_exits_zero() {
    let out = run(&frame(&[OP_STATUS]));
    assert_quiet("clean eof", &out);
    if !opened(&out) {
        return;
    }
    assert_eq!(out.status.code(), Some(0));
    assert_eq!(replies(&out.stdout), vec![(ST_OK, vec![0])]);

    let out = run(&[]);
    assert_quiet("empty session", &out);
    if opened(&out) {
        assert_eq!(out.status.code(), Some(0));
        assert!(out.stdout.is_empty());
    }
}

#[test]
fn a_partial_header_exits_one_after_answering_only_whole_frames() {
    for cut in 1..4 {
        let mut input = frame(&[OP_STATUS]);
        input.extend_from_slice(&9_u32.to_be_bytes()[..cut]);
        let out = run(&input);
        assert_quiet("partial header", &out);
        if !opened(&out) {
            return;
        }
        assert_eq!(out.status.code(), Some(1), "cut {cut} must not look like a clean exit");
        assert_eq!(replies(&out.stdout), vec![(ST_OK, vec![0])], "cut {cut}");
    }
}

#[test]
fn a_body_shorter_than_its_declared_length_exits_one_without_trace() {
    let whole = named(OP_GET, CANARY, b"");
    for cut in [5, 7, whole.len() - 1] {
        let mut input = frame(&[OP_STATUS]);
        input.extend_from_slice(&whole[..cut]);
        let out = run(&input);
        assert_quiet("short body", &out);
        if !opened(&out) {
            return;
        }
        assert_eq!(out.status.code(), Some(1), "cut {cut}");
        assert_eq!(replies(&out.stdout), vec![(ST_OK, vec![0])], "cut {cut}");
    }
}

#[test]
fn zero_and_oversize_lengths_exit_one() {
    for header in [0_u32, u32::MAX, 64 * 1024 * 1024 + 1025] {
        let mut input = frame(&[OP_STATUS]);
        input.extend_from_slice(&header.to_be_bytes());
        input.extend_from_slice(CANARY);
        let out = run(&input);
        assert_quiet("bad length", &out);
        if !opened(&out) {
            return;
        }
        assert_eq!(out.status.code(), Some(1), "length {header}");
        assert_eq!(replies(&out.stdout), vec![(ST_OK, vec![0])]);
    }
}

#[test]
fn trailing_operand_bytes_are_refused_and_the_session_continues() {
    let mut input = Vec::new();
    for opcode in [OP_STATUS, OP_EPOCH, OP_CLEANUP] {
        let mut payload = vec![opcode];
        payload.extend_from_slice(CANARY);
        input.extend(frame(&payload));
    }
    input.extend(named(OP_HAS, b"synthetic-name", CANARY));
    input.extend(named(OP_GET, b"synthetic-name", CANARY));
    input.extend(named(OP_PUT, b"synthetic-name", b"synthetic-value"));
    input.extend(named(OP_GET, b"synthetic-name", b"x"));
    input.extend(frame(&[OP_CLEANUP, 0]));
    input.extend(named(OP_HAS, b"synthetic-name", b""));
    input.extend(frame(&[OP_STATUS]));
    let out = run(&input);
    assert_quiet("trailing bytes", &out);
    if !opened(&out) {
        return;
    }
    assert_eq!(out.status.code(), Some(0));
    let got = replies(&out.stdout);
    assert_eq!(got.len(), 10);
    for (i, reply) in got[..5].iter().enumerate() {
        assert_eq!(reply, &(ST_INVALID, vec![]), "reply {i}");
    }
    let put = got[5].0;
    assert!(put == ST_OK || put == ST_UNSUPPORTED, "put status {put}");
    assert_eq!(got[6], (ST_INVALID, vec![]), "GET with a trailing byte returns no value");
    assert_eq!(got[7], (ST_INVALID, vec![]), "CLEANUP with a trailing byte refused");
    let present = u8::from(put == ST_OK);
    assert_eq!(got[8], (ST_OK, vec![present]), "refused cleanup kept the name");
    assert_eq!(got[9], (ST_OK, vec![0]), "store not quarantined");
}

fn read_reply(child: &mut Child) -> (u8, Vec<u8>) {
    let stdout = child.stdout.as_mut().expect("stdout pipe");
    let mut header = [0_u8; 4];
    stdout.read_exact(&mut header).expect("reply header");
    let len = u32::from_be_bytes(header) as usize;
    let mut body = vec![0_u8; len];
    stdout.read_exact(&mut body).expect("reply body");
    (body[0], body[1..].to_vec())
}

#[cfg(target_os = "linux")]
fn proc_owner_uid(path: &str) -> u32 {
    use std::os::unix::fs::MetadataExt;
    std::fs::metadata(path).expect("proc entry").uid()
}

/// H5 / 1.5: once the hello is answered the custodian is non-dumpable and
/// has a zero core limit. The kernel shows non-dumpable as /proc/<pid>/*
/// files owned by root, so the check only bites when the test itself is not root.
#[cfg(target_os = "linux")]
#[test]
fn the_running_custodian_is_non_dumpable_with_no_core_limit() {
    let mut child = spawn();
    child
        .stdin
        .as_mut()
        .expect("stdin pipe")
        .write_all(&frame(&[OP_STATUS]))
        .expect("hello");
    let (status, data) = read_reply(&mut child);
    if status == ST_UNSUPPORTED {
        assert!(!expect_arena(), "custodian refused to open but VOK_EXPECT_ARENA=1");
        drop(child.stdin.take());
        let _ = child.wait();
        return;
    }
    assert_eq!((status, data), (ST_OK, vec![0]));
    let pid = child.id();

    let limits = std::fs::read_to_string(format!("/proc/{pid}/limits")).expect("limits");
    let core = limits
        .lines()
        .find(|line| line.starts_with("Max core file size"))
        .expect("core limit row");
    let fields: Vec<&str> = core["Max core file size".len()..].split_whitespace().collect();
    assert_eq!(&fields[..2], &["0", "0"], "core limit soft and hard are 0: {core}");

    let me = proc_owner_uid("/proc/self");
    if me != 0 {
        for entry in ["status", "environ", "maps"] {
            let owner = proc_owner_uid(&format!("/proc/{pid}/{entry}"));
            assert_eq!(owner, 0, "non-dumpable custodian's /proc/<pid>/{entry} is root-owned");
        }
        assert!(
            std::fs::read(format!("/proc/{pid}/environ")).is_err(),
            "same-uid reader can't open a non-dumpable custodian's environ"
        );
    }

    drop(child.stdin.take());
    let out = child.wait_with_output().expect("finish");
    assert_eq!(out.status.code(), Some(0));
    assert!(out.stderr.is_empty());
}

/// 2.2, custodian side: SIGKILL while a canary-bearing request is half sent.
/// The custodian dies by signal, answers nothing after the hello, and leaves
/// no canary on stdout or stderr. (The parent-side quarantine after a dead
/// custodian is the app-kernel provider's job, frozen TS reference.)
#[cfg(unix)]
#[test]
fn sigkill_mid_request_leaves_no_reply_and_no_trace() {
    use std::os::unix::process::ExitStatusExt;

    let mut child = spawn();
    let stdin = child.stdin.as_mut().expect("stdin pipe");
    stdin.write_all(&frame(&[OP_STATUS])).expect("hello");
    let (status, _) = read_reply(&mut child);
    if status == ST_UNSUPPORTED {
        assert!(!expect_arena(), "custodian refused to open but VOK_EXPECT_ARENA=1");
        drop(child.stdin.take());
        let _ = child.wait();
        return;
    }
    assert_eq!(status, ST_OK);
    let whole = named(OP_PUT, b"synthetic-name", CANARY);
    let stdin = child.stdin.as_mut().expect("stdin pipe");
    stdin.write_all(&whole[..whole.len() - 3]).expect("half request");
    stdin.flush().expect("flush");
    child.kill().expect("SIGKILL");
    drop(child.stdin.take());
    let out = child.wait_with_output().expect("reaped");
    assert_eq!(out.status.signal(), Some(9), "died by SIGKILL");
    assert!(out.stdout.is_empty(), "no reply after the hello");
    assert!(!has_trace(&out.stdout) && !has_trace(&out.stderr));
}

#[test]
fn the_exact_lookups_the_provider_sends_still_work() {
    let mut input = frame(&[OP_STATUS]);
    input.extend(named(OP_HAS, b"synthetic-name", b""));
    input.extend(named(OP_GET, b"synthetic-name", b""));
    input.extend(frame(&[OP_EPOCH]));
    input.extend(frame(&[OP_CLEANUP]));
    let out = run(&input);
    assert_quiet("exact lookups", &out);
    if !opened(&out) {
        return;
    }
    assert_eq!(out.status.code(), Some(0));
    let got = replies(&out.stdout);
    assert_eq!(got.len(), 5);
    assert_eq!(got[0], (ST_OK, vec![0]));
    assert_eq!(got[1], (ST_OK, vec![0]));
    assert_eq!(got[2], (1, vec![]), "missing name is NOT_FOUND");
    assert_eq!(got[3].0, ST_OK);
    assert_eq!(got[3].1.len(), 8, "epoch is a u64");
    assert_eq!(got[4], (ST_OK, vec![]));
}

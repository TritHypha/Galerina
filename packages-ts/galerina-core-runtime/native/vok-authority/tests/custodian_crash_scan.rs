//! MEM-R29 crash-and-scan process tests for the secret-arena custodian
//! (gap map 1.5 / H5). MEM-R19 pinned that the running custodian reports a
//! zero core limit and is non-dumpable. These tests check what that buys:
//! - a real crash (SIGSEGV, SIGABRT, SIGQUIT, SIGBUS) of a custodian that
//!   holds a canary writes no core, even when it was started with an
//!   unlimited core limit, and the kernel's own "core dumped" bit stays off;
//! - a control process started the same way (unlimited core, same signal)
//!   does dump, and the canary is found in that core, so the scan would see
//!   a leak if there were one;
//! - a live same-uid scan of the custodian's memory is refused at open
//!   (/proc/<pid>/mem and /proc/<pid>/maps), while the same scan of a
//!   dumpable control process finds its canary;
//! - when the scan can run (root), the canary is in no readable mapping.
//! Synthetic data only. The canary is made at run time and matched whole,
//! so chance 4-byte matches in libc or the loader can't give false hits.
//!
//! VOK_EXPECT_ARENA=1 makes an open refusal a failure. VOK_EXPECT_CORE=1
//! makes a control that cannot dump a failure (hosts whose core_pattern is
//! a plain file name, such as the WSL2 runner with core_pattern "core");
//! without it such a host skips the core half with a note on stderr.

#![cfg(target_os = "linux")]

use std::fs;
use std::io::{Read, Write};
use std::os::unix::fs::FileExt;
use std::os::unix::process::ExitStatusExt;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, ExitStatus, Stdio};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

const ST_OK: u8 = 0;
const ST_UNSUPPORTED: u8 = 5;
const OP_PUT: u8 = 1;
const OP_GET: u8 = 3;
const OP_STATUS: u8 = 5;
const SIGQUIT: i32 = 3;
const SIGABRT: i32 = 6;
const SIGBUS: i32 = 7;
const SIGSEGV: i32 = 11;
const CRASH_SIGNALS: [i32; 4] = [SIGSEGV, SIGABRT, SIGQUIT, SIGBUS];
/// Upper bound on bytes read from one mapping during a scan.
const MAP_CAP: u64 = 256 * 1024 * 1024;

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

fn expect_arena() -> bool {
    std::env::var("VOK_EXPECT_ARENA").as_deref() == Ok("1")
}

fn expect_core() -> bool {
    std::env::var("VOK_EXPECT_CORE").as_deref() == Ok("1")
}

/// A canary unique to this run and this call site; never a literal, so the
/// test binary's own rodata can't be what a scan finds.
fn canary(tag: &str) -> Vec<u8> {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(1);
    let mix = nanos ^ (u128::from(std::process::id()) << 64);
    format!("SYNTH-CANARY-{tag}-{mix:032x}").into_bytes()
}

fn contains(hay: &[u8], needle: &[u8]) -> bool {
    !needle.is_empty() && hay.windows(needle.len()).any(|w| w == needle)
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

fn read_reply(child: &mut Child) -> (u8, Vec<u8>) {
    let stdout = child.stdout.as_mut().expect("stdout pipe");
    let mut header = [0_u8; 4];
    stdout.read_exact(&mut header).expect("reply header");
    let len = u32::from_be_bytes(header) as usize;
    assert!(len >= 1, "empty reply frame");
    let mut body = vec![0_u8; len];
    stdout.read_exact(&mut body).expect("reply body");
    (body[0], body[1..].to_vec())
}

/// A fresh, empty, test-owned directory under the target temp area.
fn scratch(label: &str) -> PathBuf {
    let base = std::env::temp_dir().join(format!(
        "vok-mr29-{label}-{}-{}",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0)
    ));
    fs::create_dir_all(&base).expect("scratch dir");
    assert!(fs::read_dir(&base).expect("list").next().is_none(), "scratch starts empty");
    base
}

fn entries(dir: &Path) -> Vec<PathBuf> {
    let mut out: Vec<PathBuf> = fs::read_dir(dir)
        .expect("list scratch")
        .filter_map(|e| e.ok().map(|e| e.path()))
        .collect();
    out.sort();
    out
}

/// Start `program` through sh with the soft and hard core limits raised to
/// unlimited first, so whatever limit the child ends with is its own doing.
/// Returns None when the host's hard limit can't be raised.
fn core_limit_raisable() -> bool {
    Command::new("sh")
        .arg("-c")
        .arg("ulimit -c unlimited 2>/dev/null && ulimit -c")
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim() == "unlimited")
        .unwrap_or(false)
}

fn spawn_unlimited(program: &Path, cwd: &Path) -> Option<Child> {
    if !core_limit_raisable() {
        return None;
    }
    Some(
        Command::new("sh")
            .arg("-c")
            .arg("ulimit -c unlimited || exit 97; exec \"$0\"")
            .arg(program)
            .current_dir(cwd)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .expect("spawn through sh"),
    )
}

fn spawn_plain(program: &Path) -> Child {
    Command::new(program)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("spawn")
}

fn signal(pid: u32, sig: i32) {
    let status = Command::new("kill")
        .arg(format!("-{sig}"))
        .arg(pid.to_string())
        .status()
        .expect("kill(1) available");
    assert!(status.success(), "kill -{sig} {pid}");
}

fn wait_with_deadline(child: &mut Child, limit: Duration, what: &str) -> ExitStatus {
    let start = Instant::now();
    loop {
        if let Some(status) = child.try_wait().expect("try_wait") {
            return status;
        }
        if start.elapsed() > limit {
            let _ = child.kill();
            panic!("{what} did not exit within {limit:?}");
        }
        std::thread::sleep(Duration::from_millis(10));
    }
}

/// Hello, PUT the canary, GET it back (so it has crossed the reply path),
/// and leave the session open. None when the arena refused to open.
fn custodian_holding(child: &mut Child, value: &[u8]) -> Option<()> {
    let stdin = child.stdin.as_mut().expect("stdin pipe");
    stdin.write_all(&frame(&[OP_STATUS])).expect("hello");
    let (status, data) = read_reply(child);
    if status == ST_UNSUPPORTED {
        assert!(!expect_arena(), "custodian refused to open but VOK_EXPECT_ARENA=1");
        return None;
    }
    assert_eq!((status, data), (ST_OK, vec![0]), "hello");
    let stdin = child.stdin.as_mut().expect("stdin pipe");
    stdin.write_all(&named(OP_PUT, b"synthetic-name", value)).expect("put");
    let (status, _) = read_reply(child);
    if status == ST_UNSUPPORTED {
        assert!(!expect_arena(), "put refused but VOK_EXPECT_ARENA=1");
        return None;
    }
    assert_eq!(status, ST_OK, "put");
    let stdin = child.stdin.as_mut().expect("stdin pipe");
    stdin.write_all(&named(OP_GET, b"synthetic-name", b"")).expect("get");
    let (status, got) = read_reply(child);
    assert_eq!(status, ST_OK, "get");
    assert_eq!(got, value, "get returns the stored value");
    Some(())
}

/// The dumpable control is a plain `sh` that reads the canary into a shell
/// variable, echoes it once, then blocks on stdin, so the canary sits in its
/// heap. (GNU cat is no good here: it can splice pipe to pipe, so the bytes
/// never enter its memory.)
const CONTROL_SCRIPT: &str = "IFS= read -r v; printf '%s\\n' \"$v\"; read -r w";

fn spawn_control(unlimited: bool, cwd: &Path) -> Option<Child> {
    let script = if unlimited {
        format!("ulimit -c unlimited || exit 97; {CONTROL_SCRIPT}")
    } else {
        CONTROL_SCRIPT.to_string()
    };
    if unlimited && !core_limit_raisable() {
        return None;
    }
    Some(
        Command::new("sh")
            .arg("-c")
            .arg(script)
            .current_dir(cwd)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .expect("spawn control sh"),
    )
}

fn control_holding(child: &mut Child, value: &[u8]) {
    assert!(!value.contains(&b'\n'), "canary is one line");
    let stdin = child.stdin.as_mut().expect("stdin pipe");
    stdin.write_all(value).expect("feed control");
    stdin.write_all(b"\n").expect("feed control newline");
    stdin.flush().expect("flush control");
    let stdout = child.stdout.as_mut().expect("stdout pipe");
    let mut echoed = vec![0_u8; value.len() + 1];
    stdout.read_exact(&mut echoed).expect("control echo");
    assert_eq!(&echoed[..value.len()], value, "control holds the canary");
}

fn core_files(dir: &Path) -> Vec<PathBuf> {
    entries(dir)
        .into_iter()
        .filter(|p| {
            p.file_name()
                .and_then(|n| n.to_str())
                .map(|n| n == "core" || n.starts_with("core."))
                .unwrap_or(false)
        })
        .collect()
}

fn plain_core_pattern() -> bool {
    let pattern = fs::read_to_string("/proc/sys/kernel/core_pattern").unwrap_or_default();
    let pattern = pattern.trim();
    !pattern.is_empty() && !pattern.starts_with('|') && !pattern.contains('/')
}

fn is_root() -> bool {
    use std::os::unix::fs::MetadataExt;
    fs::metadata("/proc/self").map(|m| m.uid() == 0).unwrap_or(false)
}

/// Readable, private or shared mappings from /proc/<pid>/maps as (start, end).
fn readable_maps(pid: &str) -> std::io::Result<Vec<(u64, u64)>> {
    let maps = fs::read_to_string(format!("/proc/{pid}/maps"))?;
    let mut out = Vec::new();
    for line in maps.lines() {
        let mut parts = line.split_whitespace();
        let (Some(range), Some(perms)) = (parts.next(), parts.next()) else {
            continue;
        };
        if !perms.starts_with('r') || line.ends_with("[vvar]") || line.ends_with("[vsyscall]") {
            continue;
        }
        let Some((a, b)) = range.split_once('-') else {
            continue;
        };
        let (Ok(a), Ok(b)) = (u64::from_str_radix(a, 16), u64::from_str_radix(b, 16)) else {
            continue;
        };
        out.push((a, b));
    }
    Ok(out)
}

/// Outcome of a live memory scan of one process.
#[derive(Debug, PartialEq, Eq)]
enum Scan {
    /// /proc/<pid>/maps or /proc/<pid>/mem could not be opened.
    Refused,
    /// The scan ran; `found` says whether the needle was in a readable page.
    Ran { found: bool, bytes: u64 },
}

fn scan_process(pid: &str, needle: &[u8]) -> Scan {
    let Ok(maps) = readable_maps(pid) else {
        return Scan::Refused;
    };
    let Ok(mem) = fs::File::open(format!("/proc/{pid}/mem")) else {
        return Scan::Refused;
    };
    let mut bytes = 0_u64;
    let chunk = 1 << 20;
    let overlap = needle.len().saturating_sub(1);
    for (start, end) in maps {
        let stop = end.min(start.saturating_add(MAP_CAP));
        let mut at = start;
        let mut carry: Vec<u8> = Vec::new();
        while at < stop {
            let want = ((stop - at) as usize).min(chunk);
            let mut buf = vec![0_u8; want];
            match mem.read_at(&mut buf, at) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    buf.truncate(n);
                    bytes += n as u64;
                    let mut joined = std::mem::take(&mut carry);
                    joined.extend_from_slice(&buf);
                    if contains(&joined, needle) {
                        return Scan::Ran { found: true, bytes };
                    }
                    let keep = joined.len().min(overlap);
                    carry = joined[joined.len() - keep..].to_vec();
                    at += n as u64;
                }
            }
        }
    }
    Scan::Ran { found: false, bytes }
}

fn finish_session(mut child: Child) {
    drop(child.stdin.take());
    let status = wait_with_deadline(&mut child, Duration::from_secs(10), "session");
    assert_eq!(status.code(), Some(0), "custodian exits 0 on a clean EOF");
}

#[test]
fn the_scanner_finds_a_canary_in_its_own_memory() {
    let needle = canary("self");
    let held = needle.clone();
    match scan_process("self", &needle) {
        Scan::Ran { found, bytes } => {
            assert!(found, "self scan must find a live heap canary ({bytes} bytes read)");
        }
        Scan::Refused => panic!("a process can always scan itself"),
    }
    assert!(!contains(b"SYNTH-CANARY-self-0", &needle), "needle is whole, not a prefix");
    drop(held);
}

#[test]
fn a_dumpable_control_is_scannable_and_its_canary_is_found() {
    let needle = canary("ctl-live");
    let here = std::env::temp_dir();
    let mut child = spawn_control(false, &here).expect("plain control");
    control_holding(&mut child, &needle);
    let pid = child.id().to_string();
    let scan = scan_process(&pid, &needle);
    let _ = child.kill();
    let _ = child.wait();
    match scan {
        Scan::Ran { found, bytes } => assert!(found, "control canary found ({bytes} bytes)"),
        Scan::Refused => {
            // Yama ptrace_scope >= 2 refuses even the parent; the custodian
            // half then proves nothing extra, so say so instead of passing.
            let scope = fs::read_to_string("/proc/sys/kernel/yama/ptrace_scope").unwrap_or_default();
            assert!(
                scope.trim() >= "2",
                "a parent may scan its dumpable child (ptrace_scope {})",
                scope.trim()
            );
            eprintln!("NOTE mr29: host refuses all child scans (ptrace_scope {})", scope.trim());
        }
    }
}

#[test]
fn a_live_same_uid_scan_of_the_custodian_is_refused() {
    let needle = canary("live");
    let mut child = spawn_plain(&custodian());
    if custodian_holding(&mut child, &needle).is_none() {
        let _ = child.kill();
        let _ = child.wait();
        return;
    }
    let pid = child.id().to_string();
    if is_root() {
        // Root may read a non-dumpable process. memfd_secret pages are out of
        // the kernel's direct map, and request/reply buffers are wiped, so the
        // canary must still be in no readable mapping.
        match scan_process(&pid, &needle) {
            Scan::Ran { found, bytes } => {
                assert!(!found, "canary in a readable custodian mapping ({bytes} bytes read)");
            }
            Scan::Refused => {}
        }
    } else {
        assert!(
            fs::File::open(format!("/proc/{pid}/mem")).is_err(),
            "same-uid open of a non-dumpable custodian's /proc/<pid>/mem is refused"
        );
        assert!(
            fs::read_to_string(format!("/proc/{pid}/maps")).is_err(),
            "same-uid read of a non-dumpable custodian's /proc/<pid>/maps is refused"
        );
        assert_eq!(scan_process(&pid, &needle), Scan::Refused);
    }
    finish_session(child);
}

/// The control half of the crash test: started with an unlimited core limit
/// and killed with `sig`, a plain process must dump, and the core must hold
/// its canary. Returns false when the host can't produce a core at all.
fn control_dumps_with_canary(sig: i32) -> bool {
    let dir = scratch(&format!("ctl-{sig}"));
    let needle = canary(&format!("ctl-core-{sig}"));
    let Some(mut child) = spawn_control(true, &dir) else {
        assert!(!expect_core(), "hard core limit can't be raised but VOK_EXPECT_CORE=1");
        let _ = fs::remove_dir_all(&dir);
        return false;
    };
    control_holding(&mut child, &needle);
    signal(child.id(), sig);
    let status = wait_with_deadline(&mut child, Duration::from_secs(20), &format!("control on signal {sig}"));
    assert_eq!(status.signal(), Some(sig), "control died by signal {sig}");
    let cores = core_files(&dir);
    let dumped = status.core_dumped();
    if !dumped || cores.is_empty() {
        assert!(
            !(expect_core() && plain_core_pattern()),
            "control did not dump on signal {sig} (core bit {dumped}, files {cores:?}) but VOK_EXPECT_CORE=1"
        );
        let _ = fs::remove_dir_all(&dir);
        return false;
    }
    let mut found = false;
    for core in &cores {
        let bytes = fs::read(core).expect("read control core");
        found |= contains(&bytes, &needle);
    }
    let _ = fs::remove_dir_all(&dir);
    assert!(found, "control core for signal {sig} holds the canary, so the scan works");
    true
}

#[test]
fn a_crashing_custodian_writes_no_core_even_with_an_unlimited_start() {
    let mut checked = 0;
    for sig in CRASH_SIGNALS {
        let control = control_dumps_with_canary(sig);
        let dir = scratch(&format!("cust-{sig}"));
        let needle = canary(&format!("cust-core-{sig}"));
        let Some(mut child) = spawn_unlimited(&custodian(), &dir) else {
            let _ = fs::remove_dir_all(&dir);
            eprintln!("NOTE mr29: hard core limit fixed on this host; crash half skipped");
            return;
        };
        if custodian_holding(&mut child, &needle).is_none() {
            let _ = child.kill();
            let _ = child.wait();
            let _ = fs::remove_dir_all(&dir);
            return;
        }
        // The custodian lowered the inherited unlimited limit itself.
        let limits = fs::read_to_string(format!("/proc/{}/limits", child.id())).expect("limits");
        let row = limits
            .lines()
            .find(|l| l.starts_with("Max core file size"))
            .expect("core row");
        let fields: Vec<&str> = row["Max core file size".len()..].split_whitespace().collect();
        assert_eq!(&fields[..2], &["0", "0"], "custodian lowered core limit: {row}");

        signal(child.id(), sig);
        // Rust std's stack-overflow guard catches SIGSEGV/SIGBUS: for a fault
        // outside the guard page it restores SIG_DFL and returns, so a real
        // fault re-faults and dies. A kill(2)-sent signal does not re-fire, so
        // send it a second time to model the re-fault.
        if matches!(sig, 7 | 11) {
            std::thread::sleep(Duration::from_millis(200));
            if child.try_wait().expect("try_wait").is_none() {
                signal(child.id(), sig);
            }
        }
        let status = wait_with_deadline(&mut child, Duration::from_secs(20), &format!("custodian on signal {sig}"));
        let mut out = Vec::new();
        let mut err = Vec::new();
        if let Some(mut s) = child.stdout.take() {
            let _ = s.read_to_end(&mut out);
        }
        if let Some(mut s) = child.stderr.take() {
            let _ = s.read_to_end(&mut err);
        }
        assert_eq!(status.signal(), Some(sig), "custodian died by signal {sig}");
        assert!(!status.core_dumped(), "kernel reports no core for the custodian on signal {sig}");
        assert!(entries(&dir).is_empty(), "nothing written to the custodian's cwd on signal {sig}");
        assert!(out.is_empty(), "no reply after the crash on signal {sig}");
        assert!(!contains(&err, &needle), "no canary on stderr on signal {sig}");
        let _ = fs::remove_dir_all(&dir);
        if control {
            checked += 1;
        }
    }
    if checked == 0 {
        assert!(!expect_core(), "no signal had a dumping control but VOK_EXPECT_CORE=1");
        eprintln!("NOTE mr29: host produced no control core; custodian no-core half is unproven here");
    }
}

#[test]
fn the_core_scan_helpers_match_whole_needles_only() {
    let needle = canary("unit");
    let mut hay = vec![0_u8; 64];
    hay.extend_from_slice(&needle[..needle.len() - 1]);
    assert!(!contains(&hay, &needle), "a truncated copy is not a hit");
    hay.extend_from_slice(&needle);
    assert!(contains(&hay, &needle));
    assert!(!contains(&hay, b""), "an empty needle never matches");
    let dir = scratch("unit");
    fs::write(dir.join("core.123"), b"x").expect("write");
    fs::write(dir.join("corefile.txt"), b"x").expect("write");
    fs::write(dir.join("core"), b"x").expect("write");
    let names: Vec<String> = core_files(&dir)
        .iter()
        .map(|p| p.file_name().unwrap().to_string_lossy().into_owned())
        .collect();
    assert_eq!(names, vec!["core".to_string(), "core.123".to_string()]);
    let _ = fs::remove_dir_all(&dir);
}

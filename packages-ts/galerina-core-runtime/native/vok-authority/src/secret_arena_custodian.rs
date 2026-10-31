//! Stdin/stdout custodian for `SecretArenaStore`. Public so the bin can start it.

use std::fs::File;
use std::io::{self, Read, Write};
use std::os::fd::AsFd;
use std::process;
use std::sync::atomic::{compiler_fence, Ordering};

use super::secret_arena::SecretArenaError;
use super::secret_arena_store::SecretArenaStore;
use super::secret_handle_table::SecretHandle;

const OP_PUT: u8 = 1;
const OP_HAS: u8 = 2;
const OP_GET: u8 = 3;
const OP_CLEANUP: u8 = 4;
const OP_STATUS: u8 = 5;
const OP_EPOCH: u8 = 7;
// MEM-R25 (gap 2.5 / H8 on the wire): handle-addressed ops. Opcode 6 stays
// unassigned so an old client that ever used it can't reach a new meaning.
const OP_PUT_HANDLE: u8 = 8;
const OP_GET_HANDLE: u8 = 9;
const OP_RELEASE: u8 = 10;

/// A handle on the wire is the name frame followed by exactly 8 bytes of
/// big-endian generation.
const GENERATION_BYTES: usize = 8;

const ST_OK: u8 = 0;
const ST_NOT_FOUND: u8 = 1;
const ST_QUARANTINED: u8 = 2;
const ST_INVALID: u8 = 3;
const ST_UNSUPPORTED: u8 = 5;
const ST_INTERNAL: u8 = 6;

const MAX_FRAME: u32 = 64 * 1024 * 1024 + 1024;

/// Overwrite `bytes` with zeros in a way the optimiser must not remove as a dead store.
fn wipe_volatile(bytes: &mut [u8]) {
    for byte in bytes.iter_mut() {
        // SAFETY: `byte` is a live exclusive reference to an initialized `u8`.
        // `write_volatile` stores 0 through that pointer so the write remains
        // observable after this function returns, including when the buffer
        // is later dropped.
        #[allow(unsafe_code)]
        unsafe {
            std::ptr::write_volatile(byte, 0_u8);
        }
    }
    compiler_fence(Ordering::SeqCst);
}

fn status_of(error: SecretArenaError) -> u8 {
    match error {
        SecretArenaError::InvalidLength => ST_INVALID,
        SecretArenaError::UnsupportedPlatform
        | SecretArenaError::CreateRefused { .. }
        | SecretArenaError::ResizeRefused
        | SecretArenaError::MapRefused
        | SecretArenaError::PageSizeRefused => ST_UNSUPPORTED,
        SecretArenaError::NotAllocated | SecretArenaError::NotActive => ST_NOT_FOUND,
        SecretArenaError::CleanupFailed => ST_QUARANTINED,
    }
}

fn read_exact_n(reader: &mut impl Read, n: usize) -> io::Result<Vec<u8>> {
    let mut buf = vec![0_u8; n];
    let mut tmp = [0_u8; 4096];
    let mut filled = 0usize;
    while filled < n {
        let want = (n - filled).min(tmp.len());
        match reader.read(&mut tmp[..want]) {
            Ok(0) => {
                wipe_volatile(&mut buf);
                wipe_volatile(&mut tmp);
                return Err(io::Error::new(io::ErrorKind::UnexpectedEof, "frame"));
            }
            Ok(got) => {
                buf[filled..filled + got].copy_from_slice(&tmp[..got]);
                wipe_volatile(&mut tmp[..got]);
                filled += got;
            }
            Err(error) if error.kind() == io::ErrorKind::Interrupted => continue,
            Err(error) => {
                wipe_volatile(&mut buf);
                wipe_volatile(&mut tmp);
                return Err(error);
            }
        }
    }
    wipe_volatile(&mut tmp);
    Ok(buf)
}

/// Read one length-prefixed request frame.
///
/// `Ok(None)` means a clean EOF exactly on a frame boundary (no header byte
/// arrived), which is the only way the loop exits 0. MEM-R19 (gap map 3.5 /
/// H11): a partial header (1 to 3 bytes), a zero or oversize declared length,
/// or a body shorter than its declared length is a protocol error, so the
/// loop exits 1. Before MEM-R19 a truncated header or body was read as a
/// clean shutdown (exit 0), hiding a cut-off request from the parent.
fn read_frame(reader: &mut impl Read) -> io::Result<Option<Vec<u8>>> {
    let mut header = [0_u8; 4];
    let mut got = 0usize;
    while got < header.len() {
        match reader.read(&mut header[got..]) {
            Ok(0) => break,
            Ok(n) => got += n,
            Err(error) if error.kind() == io::ErrorKind::Interrupted => continue,
            Err(error) => {
                wipe_volatile(&mut header);
                return Err(error);
            }
        }
    }
    if got == 0 {
        return Ok(None);
    }
    if got < header.len() {
        wipe_volatile(&mut header);
        return Err(io::Error::new(io::ErrorKind::InvalidData, "frame"));
    }
    let len = u32::from_be_bytes(header);
    wipe_volatile(&mut header);
    if len == 0 || len > MAX_FRAME {
        return Err(io::Error::new(io::ErrorKind::InvalidData, "frame"));
    }
    read_exact_n(reader, len as usize).map(Some)
}

fn unbuffered_stdio() -> (File, File) {
    let stdin = match io::stdin().as_fd().try_clone_to_owned() {
        Ok(fd) => File::from(fd),
        Err(_) => process::exit(2),
    };
    let stdout = match io::stdout().as_fd().try_clone_to_owned() {
        Ok(fd) => File::from(fd),
        Err(_) => process::exit(2),
    };
    (stdin, stdout)
}

fn write_frame(writer: &mut impl Write, payload: &[u8]) -> io::Result<()> {
    let len = u32::try_from(payload.len()).map_err(|_| io::ErrorKind::InvalidData)?;
    writer.write_all(&len.to_be_bytes())?;
    writer.write_all(payload)?;
    writer.flush()
}

struct ZeroOnDrop(Vec<u8>);

impl Drop for ZeroOnDrop {
    fn drop(&mut self) {
        wipe_volatile(&mut self.0);
    }
}

impl ZeroOnDrop {
    fn as_slice(&self) -> &[u8] {
        &self.0
    }
}

fn reply(writer: &mut impl Write, status: u8, data: &[u8]) -> io::Result<()> {
    let mut payload = ZeroOnDrop(Vec::with_capacity(1 + data.len()));
    payload.0.push(status);
    payload.0.extend_from_slice(data);
    write_frame(writer, payload.as_slice())
}

fn read_name(payload: &[u8]) -> Result<(&str, &[u8]), SecretArenaError> {
    if payload.len() < 2 {
        return Err(SecretArenaError::InvalidLength);
    }
    let name_len = u16::from_be_bytes([payload[0], payload[1]]) as usize;
    if payload.len() < 2 + name_len {
        return Err(SecretArenaError::InvalidLength);
    }
    let name = std::str::from_utf8(&payload[2..2 + name_len])
        .map_err(|_| SecretArenaError::InvalidLength)?;
    Ok((name, &payload[2 + name_len..]))
}

/// HAS and GET carry exactly one name and nothing after it (MEM-R19, H11
/// length equality): trailing bytes are refused as INVALID, so a lookup
/// can't carry a smuggled value and a framing slip can't be read as a name.
fn read_name_exact(payload: &[u8]) -> Result<&str, SecretArenaError> {
    let (name, rest) = read_name(payload)?;
    if !rest.is_empty() {
        return Err(SecretArenaError::InvalidLength);
    }
    Ok(name)
}

/// GET_HANDLE and RELEASE carry one name and exactly 8 bytes of big-endian
/// generation (MEM-R25). A shorter or longer tail, or generation 0 (never
/// issued), is INVALID before the store is consulted, so a malformed handle
/// can't reach or release anything.
fn read_handle_exact(payload: &[u8]) -> Result<SecretHandle, SecretArenaError> {
    let (name, rest) = read_name(payload)?;
    let bytes: [u8; GENERATION_BYTES] = rest
        .try_into()
        .map_err(|_| SecretArenaError::InvalidLength)?;
    SecretHandle::from_wire(name, u64::from_be_bytes(bytes)).ok_or(SecretArenaError::InvalidLength)
}

/// H5 (gap map 1.5): before any secret can arrive, make the custodian
/// non-dumpable (`PR_SET_DUMPABLE` 0) and give it a zero core-file limit,
/// then read both back. A crash then writes no core, and a same-uid process
/// can't attach or read `/proc/<pid>/mem`. This adds to memfd_secret, which
/// already keeps arena pages out of dumps and swap; it also covers the
/// request and reply buffers on the ordinary heap. Fail closed: if any call
/// or read-back disagrees, `apply` returns false and the custodian refuses
/// before opening the store.
#[cfg(target_os = "linux")]
#[allow(unsafe_code)]
mod harden {
    use std::ffi::{c_int, c_ulong};

    const PR_GET_DUMPABLE: c_int = 3;
    const PR_SET_DUMPABLE: c_int = 4;
    const RLIMIT_CORE: c_int = 4;

    #[repr(C)]
    struct RLimit {
        cur: c_ulong,
        max: c_ulong,
    }

    extern "C" {
        fn prctl(option: c_int, ...) -> c_int;
        fn setrlimit(resource: c_int, limit: *const RLimit) -> c_int;
        fn getrlimit(resource: c_int, limit: *mut RLimit) -> c_int;
    }

    pub(super) fn apply() -> bool {
        let zero = RLimit { cur: 0, max: 0 };
        // SAFETY: `zero` is a live, initialised rlimit for the duration of the
        // call; setrlimit only reads it.
        let core_set = unsafe { setrlimit(RLIMIT_CORE, &zero) } == 0;
        // SAFETY: PR_SET_DUMPABLE takes integer arguments only, no pointers.
        let dump_set = unsafe {
            prctl(PR_SET_DUMPABLE, 0 as c_ulong, 0 as c_ulong, 0 as c_ulong, 0 as c_ulong)
        } == 0;
        core_set && dump_set && confirmed()
    }

    /// Read both settings back; trust the kernel's answer, not the set calls.
    fn confirmed() -> bool {
        let mut core = RLimit { cur: 1, max: 1 };
        // SAFETY: `core` is a live, writable rlimit owned by this frame.
        let core_read = unsafe { getrlimit(RLIMIT_CORE, &mut core) } == 0;
        // SAFETY: PR_GET_DUMPABLE takes integer arguments only, no pointers.
        let dumpable = unsafe {
            prctl(PR_GET_DUMPABLE, 0 as c_ulong, 0 as c_ulong, 0 as c_ulong, 0 as c_ulong)
        };
        core_read && core.cur == 0 && core.max == 0 && dumpable == 0
    }
}

/// No portable non-dumpable switch here, so refuse: the store has no
/// memfd_secret off Linux and would refuse at open anyway.
#[cfg(not(target_os = "linux"))]
mod harden {
    pub(super) fn apply() -> bool {
        false
    }
}

/// Blocking request loop. Exits the process on a fatal protocol or store-open failure.
pub fn run_secret_arena_custodian() -> ! {
    let (mut stdin, mut stdout) = unbuffered_stdio();
    if !harden::apply() {
        let _ = reply(&mut stdout, ST_UNSUPPORTED, &[]);
        process::exit(2);
    }
    let mut store = match SecretArenaStore::open() {
        Ok(store) => store,
        Err(error) => {
            let _ = reply(&mut stdout, status_of(error), &[]);
            process::exit(2);
        }
    };

    loop {
        let mut frame = match read_frame(&mut stdin) {
            Ok(Some(frame)) => frame,
            Ok(None) => process::exit(0),
            Err(_) => process::exit(1),
        };
        if handle_frame(&mut store, &mut frame, &mut stdout).is_err() {
            process::exit(1);
        }
    }
}

/// One request: dispatch, reply, and wipe the request frame on every path
/// (MEM-R15 pulled this out of the loop so the failure paths are testable).
/// Replies never echo request bytes: a refusal is a bare status byte. A reply
/// write failure is returned so the loop exits 1; every other path is Ok.
fn handle_frame(
    store: &mut SecretArenaStore,
    frame: &mut Vec<u8>,
    out: &mut impl Write,
) -> io::Result<()> {
    if frame.is_empty() {
        wipe_volatile(frame);
        let _ = reply(out, ST_INVALID, &[]);
        return Ok(());
    }
    let opcode = frame[0];
    let result = dispatch(store, opcode, &frame[1..]);
    match result {
        Ok((status, data)) => {
            let data = ZeroOnDrop(data);
            let write = reply(out, status, data.as_slice());
            wipe_volatile(frame);
            write
        }
        Err(()) => {
            wipe_volatile(frame);
            let _ = reply(out, ST_INTERNAL, &[]);
            Ok(())
        }
    }
}

fn dispatch(
    store: &mut SecretArenaStore,
    opcode: u8,
    rest: &[u8],
) -> Result<(u8, Vec<u8>), ()> {
    match opcode {
        OP_PUT => {
            let (name, value) = match read_name(rest) {
                Ok(pair) => pair,
                Err(error) => return Ok((status_of(error), Vec::new())),
            };
            match store.put(name, value) {
                Ok(()) => Ok((ST_OK, Vec::new())),
                Err(error) => Ok((status_of(error), Vec::new())),
            }
        }
        OP_HAS => {
            let name = match read_name_exact(rest) {
                Ok(name) => name,
                Err(error) => return Ok((status_of(error), Vec::new())),
            };
            if store.quarantined() {
                Ok((ST_QUARANTINED, Vec::new()))
            } else if store.has(name) {
                Ok((ST_OK, vec![1]))
            } else {
                Ok((ST_OK, vec![0]))
            }
        }
        OP_GET => {
            let name = match read_name_exact(rest) {
                Ok(name) => name,
                Err(error) => return Ok((status_of(error), Vec::new())),
            };
            match store.get(name) {
                Ok(bytes) => Ok((ST_OK, bytes)),
                Err(error) => Ok((status_of(error), Vec::new())),
            }
        }
        // MEM-R25: PUT_HANDLE stores like PUT and answers with the handle's
        // generation (8 bytes, big-endian). The generation is a counter, not
        // secret material, and the name is never echoed back.
        OP_PUT_HANDLE => {
            let (name, value) = match read_name(rest) {
                Ok(pair) => pair,
                Err(error) => return Ok((status_of(error), Vec::new())),
            };
            match store.put_handle(name, value) {
                Ok(handle) => Ok((ST_OK, handle.generation().to_be_bytes().to_vec())),
                Err(error) => Ok((status_of(error), Vec::new())),
            }
        }
        // GET_HANDLE reaches only the entry issued under that generation. A
        // stale handle (the name was released, or released and put again) is
        // NOT_FOUND, the same answer as an absent name, so the wire gives no
        // oracle for which of the two happened.
        OP_GET_HANDLE => {
            let handle = match read_handle_exact(rest) {
                Ok(handle) => handle,
                Err(error) => return Ok((status_of(error), Vec::new())),
            };
            match store.get_by_handle(&handle) {
                Ok(bytes) => Ok((ST_OK, bytes)),
                Err(error) => Ok((status_of(error), Vec::new())),
            }
        }
        // RELEASE wipes, verifies and unmaps the one entry this handle names.
        // A stale or double release is NOT_FOUND and touches nothing; a
        // release that can't be confirmed quarantines the store.
        OP_RELEASE => {
            let handle = match read_handle_exact(rest) {
                Ok(handle) => handle,
                Err(error) => return Ok((status_of(error), Vec::new())),
            };
            match store.release(&handle) {
                Ok(()) => Ok((ST_OK, Vec::new())),
                Err(error) => Ok((status_of(error), Vec::new())),
            }
        }
        // CLEANUP, STATUS and EPOCH carry no operand (H11): any trailing byte
        // is INVALID and the operation does not run.
        OP_CLEANUP | OP_STATUS | OP_EPOCH if !rest.is_empty() => Ok((ST_INVALID, Vec::new())),
        OP_CLEANUP => match store.cleanup() {
            Ok(()) => Ok((ST_OK, Vec::new())),
            Err(error) => Ok((status_of(error), Vec::new())),
        },
        OP_STATUS => {
            let state = u8::from(store.quarantined());
            Ok((ST_OK, vec![state]))
        }
        OP_EPOCH => Ok((ST_OK, store.epoch().to_be_bytes().to_vec())),
        _ => Ok((ST_INVALID, Vec::new())),
    }
}

#[cfg(test)]
mod tests {
    use super::wipe_volatile;

    #[test]
    fn wipe_volatile_leaves_zeros_in_a_buffer_it_does_not_free() {
        let mut buf = vec![7_u8, 8, 9, 10];
        let ptr = buf.as_mut_ptr();
        let len = buf.len();
        wipe_volatile(&mut buf);
        assert_eq!(buf.as_slice(), &[0, 0, 0, 0]);
        assert_eq!(buf.len(), len);
        assert_eq!(buf.as_mut_ptr(), ptr);
        buf[0] = 1;
        assert_eq!(buf[0], 1);
    }
}

/// MEM-R15 (gap map 1.3): every custodian failure path must leave no trace of
/// a synthetic canary secret. A reply may not contain any 4-byte-or-longer
/// window of the canary, and the request frame must be all zeros afterwards.
/// The canary is synthetic test data, never a real secret.
#[cfg(test)]
mod canary_tests {
    use std::io::{self, Cursor, Write};

    use super::*;

    const CANARY: &[u8] = b"SYNTH-CANARY-7f3a";
    const WINDOW: usize = 4;

    fn has_trace(hay: &[u8]) -> bool {
        CANARY
            .windows(WINDOW)
            .any(|needle| hay.windows(WINDOW).any(|w| w == needle))
    }

    fn assert_no_trace(label: &str, hay: &[u8]) {
        assert!(!has_trace(hay), "{label}: canary window leaked in {hay:?}");
    }

    fn named(opcode: u8, name: &[u8], value: &[u8]) -> Vec<u8> {
        let mut frame = vec![opcode];
        frame.extend_from_slice(&(name.len() as u16).to_be_bytes());
        frame.extend_from_slice(name);
        frame.extend_from_slice(value);
        frame
    }

    /// Parse the length-framed replies in `out` into (status, data) pairs.
    fn replies(out: &[u8]) -> Vec<(u8, Vec<u8>)> {
        let mut rest = out;
        let mut parsed = Vec::new();
        while !rest.is_empty() {
            assert!(rest.len() >= 4, "short reply header");
            let len = u32::from_be_bytes([rest[0], rest[1], rest[2], rest[3]]) as usize;
            assert!(len >= 1 && rest.len() >= 4 + len, "bad reply frame");
            parsed.push((rest[4], rest[5..4 + len].to_vec()));
            rest = &rest[4 + len..];
        }
        parsed
    }

    /// Run one frame and return its single reply; the frame must be wiped.
    fn one(store: &mut SecretArenaStore, label: &str, frame: Vec<u8>) -> (u8, Vec<u8>) {
        let mut frame = frame;
        let len = frame.len();
        let mut out = Vec::new();
        handle_frame(store, &mut frame, &mut out).expect("in-memory write");
        assert_eq!(frame.len(), len, "{label}: frame length changed");
        assert!(frame.iter().all(|b| *b == 0), "{label}: request frame not wiped");
        assert_no_trace(label, &out);
        let mut got = replies(&out);
        assert_eq!(got.len(), 1, "{label}: exactly one reply");
        got.remove(0)
    }

    #[test]
    fn trace_detector_sees_every_window_and_nothing_else() {
        for start in 0..=CANARY.len() - WINDOW {
            let mut hay = vec![0xAA_u8; 3];
            hay.extend_from_slice(&CANARY[start..start + WINDOW]);
            hay.push(0xAA);
            assert!(has_trace(&hay), "window at {start} must be seen");
        }
        assert!(!has_trace(&CANARY[..WINDOW - 1]));
        assert!(!has_trace(b""));
        assert!(!has_trace(&[ST_OK, ST_NOT_FOUND, ST_QUARANTINED, ST_INVALID]));
    }

    #[test]
    fn malformed_names_with_the_canary_refuse_without_echo() {
        let mut store = SecretArenaStore::unopened_for_tests();
        let mut spaced = CANARY.to_vec();
        spaced[5] = b' ';
        let mut slashed = CANARY.to_vec();
        slashed[5] = b'\\';
        let mut non_utf8 = CANARY.to_vec();
        non_utf8[0] = 0xFF;
        let long: Vec<u8> = CANARY.iter().copied().cycle().take(257).collect();
        let cases: Vec<(&str, Vec<u8>, u8)> = vec![
            ("put space name", named(OP_PUT, &spaced, CANARY), ST_INVALID),
            ("put backslash name", named(OP_PUT, &slashed, CANARY), ST_INVALID),
            ("put non-utf8 name", named(OP_PUT, &non_utf8, CANARY), ST_INVALID),
            ("put 257-byte name", named(OP_PUT, &long, CANARY), ST_INVALID),
            ("put empty name", named(OP_PUT, b"", CANARY), ST_INVALID),
            ("put canary name empty value", named(OP_PUT, CANARY, b""), ST_INVALID),
            ("get non-utf8 name", named(OP_GET, &non_utf8, b""), ST_INVALID),
            ("has non-utf8 name", named(OP_HAS, &non_utf8, b""), ST_INVALID),
        ];
        for (label, frame, want) in cases {
            let (status, data) = one(&mut store, label, frame);
            assert_eq!(status, want, "{label}");
            assert!(data.is_empty(), "{label}: refusal carries no data");
        }
        assert!(!store.quarantined());
    }

    #[test]
    fn truncated_name_lengths_refuse_without_echo() {
        let mut store = SecretArenaStore::unopened_for_tests();
        for opcode in [OP_PUT, OP_HAS, OP_GET] {
            let mut frame = vec![opcode, 0xFF, 0xFF];
            frame.extend_from_slice(CANARY);
            let (status, data) = one(&mut store, "declared name longer than frame", frame);
            assert_eq!(status, ST_INVALID);
            assert!(data.is_empty());
            let (status, data) = one(&mut store, "one-byte name length", vec![opcode, CANARY[0]]);
            assert_eq!(status, ST_INVALID);
            assert!(data.is_empty());
        }
    }

    #[test]
    fn unknown_opcodes_with_a_canary_payload_refuse_without_echo() {
        let mut store = SecretArenaStore::unopened_for_tests();
        for opcode in [0_u8, 6, 8, 0x80, 0xFF] {
            let mut frame = vec![opcode];
            frame.extend_from_slice(CANARY);
            let (status, data) = one(&mut store, "unknown opcode", frame);
            assert_eq!(status, ST_INVALID, "opcode {opcode}");
            assert!(data.is_empty());
        }
    }

    #[test]
    fn missing_canary_names_report_absence_only() {
        let mut store = SecretArenaStore::unopened_for_tests();
        let (status, data) = one(&mut store, "get missing canary", named(OP_GET, CANARY, b""));
        assert_eq!(status, ST_NOT_FOUND);
        assert!(data.is_empty());
        let (status, data) = one(&mut store, "has missing canary", named(OP_HAS, CANARY, b""));
        assert_eq!((status, data), (ST_OK, vec![0]));
    }

    #[test]
    fn a_quarantined_store_refuses_canary_requests_without_echo() {
        let mut store = SecretArenaStore::unopened_for_tests();
        store.force_cleanup_failure();
        let (status, data) = one(&mut store, "quarantined put", named(OP_PUT, CANARY, CANARY));
        assert_eq!((status, data.is_empty()), (ST_QUARANTINED, true));
        let (status, data) = one(&mut store, "quarantined get", named(OP_GET, CANARY, b""));
        assert_eq!((status, data.is_empty()), (ST_QUARANTINED, true));
        let (status, data) = one(&mut store, "quarantined has", named(OP_HAS, CANARY, b""));
        assert_eq!((status, data.is_empty()), (ST_QUARANTINED, true));
        let (status, data) = one(&mut store, "quarantined status", vec![OP_STATUS]);
        assert_eq!((status, data), (ST_OK, vec![1]));
        let (status, data) = one(&mut store, "quarantined epoch", vec![OP_EPOCH]);
        assert_eq!((status, data), (ST_OK, 1_u64.to_be_bytes().to_vec()));
    }

    #[test]
    fn an_empty_frame_is_invalid_and_carries_nothing() {
        let mut store = SecretArenaStore::unopened_for_tests();
        let mut frame = Vec::new();
        let mut out = Vec::new();
        handle_frame(&mut store, &mut frame, &mut out).expect("write");
        assert_eq!(replies(&out), vec![(ST_INVALID, Vec::new())]);
    }

    struct BrokenPipe;

    impl Write for BrokenPipe {
        fn write(&mut self, _: &[u8]) -> io::Result<usize> {
            Err(io::Error::new(io::ErrorKind::BrokenPipe, "closed"))
        }
        fn flush(&mut self) -> io::Result<()> {
            Ok(())
        }
    }

    #[test]
    fn a_failed_reply_write_still_wipes_the_frame_and_is_reported() {
        let mut store = SecretArenaStore::unopened_for_tests();
        let mut frame = named(OP_GET, CANARY, CANARY);
        let result = handle_frame(&mut store, &mut frame, &mut BrokenPipe);
        assert!(result.is_err(), "write failure must reach the loop (exit 1)");
        assert!(frame.iter().all(|b| *b == 0), "frame wiped on write failure");
    }

    #[test]
    fn read_frame_failures_carry_no_frame_bytes() {
        let mut zero = Cursor::new(vec![0_u8, 0, 0, 0]);
        let error = read_frame(&mut zero).expect_err("zero length");
        assert_eq!(error.kind(), io::ErrorKind::InvalidData);
        assert_no_trace("zero-length error", format!("{error} {error:?}").as_bytes());

        let mut over = (MAX_FRAME + 1).to_be_bytes().to_vec();
        over.extend_from_slice(CANARY);
        let error = read_frame(&mut Cursor::new(over)).expect_err("oversize");
        assert_eq!(error.kind(), io::ErrorKind::InvalidData);
        assert_no_trace("oversize error", format!("{error} {error:?}").as_bytes());

        let mut short = (CANARY.len() as u32 + 8).to_be_bytes().to_vec();
        short.extend_from_slice(CANARY);
        let error = read_frame(&mut Cursor::new(short)).expect_err("truncated");
        assert_eq!(error.kind(), io::ErrorKind::UnexpectedEof);
        assert_no_trace("truncated error", format!("{error} {error:?}").as_bytes());
    }

    #[test]
    fn store_errors_render_without_payload_bytes() {
        let errors = [
            SecretArenaError::InvalidLength,
            SecretArenaError::UnsupportedPlatform,
            SecretArenaError::CreateRefused { os_errno: 38 },
            SecretArenaError::ResizeRefused,
            SecretArenaError::MapRefused,
            SecretArenaError::PageSizeRefused,
            SecretArenaError::NotAllocated,
            SecretArenaError::NotActive,
            SecretArenaError::CleanupFailed,
        ];
        for error in errors {
            assert_no_trace("store error", format!("{error} {error:?}").as_bytes());
            assert!(status_of(error) != ST_OK, "an error never maps to OK");
        }
    }

    /// Live path: a canary put either succeeds (secretmem present) or refuses
    /// as UNSUPPORTED. After cleanup the name is gone and nothing echoes.
    #[test]
    fn live_canary_put_cleanup_then_get_leaves_no_trace() {
        let mut store = SecretArenaStore::unopened_for_tests();
        let (status, data) = one(&mut store, "live put", named(OP_PUT, CANARY, CANARY));
        assert!(status == ST_OK || status == ST_UNSUPPORTED, "put status {status}");
        assert!(data.is_empty());
        let (status, data) = one(&mut store, "cleanup", vec![OP_CLEANUP]);
        assert_eq!((status, data.is_empty()), (ST_OK, true));
        let (status, data) = one(&mut store, "get after cleanup", named(OP_GET, CANARY, b""));
        assert_eq!((status, data.is_empty()), (ST_NOT_FOUND, true));
        let (status, data) = one(&mut store, "has after cleanup", named(OP_HAS, CANARY, b""));
        assert_eq!((status, data), (ST_OK, vec![0]));
        assert!(!store.quarantined());
    }
}

/// MEM-R19 (gap map 3.5 / H11): frame-boundary EOF and exact operand lengths.
/// Synthetic data only.
#[cfg(test)]
mod frame_length_tests {
    use std::io::{self, Cursor, Read};

    use super::*;

    const CANARY: &[u8] = b"SYNTH-CANARY-7f3a";

    fn framed(payload: &[u8]) -> Vec<u8> {
        let mut out = (payload.len() as u32).to_be_bytes().to_vec();
        out.extend_from_slice(payload);
        out
    }

    fn named(opcode: u8, name: &[u8], value: &[u8]) -> Vec<u8> {
        let mut frame = vec![opcode];
        frame.extend_from_slice(&(name.len() as u16).to_be_bytes());
        frame.extend_from_slice(name);
        frame.extend_from_slice(value);
        frame
    }

    /// Hands out at most one byte per read, with an Interrupted before each,
    /// so every short-read and retry path in read_frame runs.
    struct Trickle {
        bytes: Vec<u8>,
        at: usize,
        interrupt_next: bool,
    }

    impl Trickle {
        fn new(bytes: Vec<u8>) -> Self {
            Self { bytes, at: 0, interrupt_next: true }
        }
    }

    impl Read for Trickle {
        fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
            if self.interrupt_next {
                self.interrupt_next = false;
                return Err(io::Error::new(io::ErrorKind::Interrupted, "again"));
            }
            self.interrupt_next = true;
            if self.at >= self.bytes.len() || buf.is_empty() {
                return Ok(0);
            }
            buf[0] = self.bytes[self.at];
            self.at += 1;
            Ok(1)
        }
    }

    struct Failing;

    impl Read for Failing {
        fn read(&mut self, _: &mut [u8]) -> io::Result<usize> {
            Err(io::Error::new(io::ErrorKind::BrokenPipe, "closed"))
        }
    }

    fn handle(store: &mut SecretArenaStore, frame: Vec<u8>) -> (u8, Vec<u8>) {
        let mut frame = frame;
        let mut out = Vec::new();
        handle_frame(store, &mut frame, &mut out).expect("in-memory write");
        assert!(frame.iter().all(|b| *b == 0), "request frame wiped");
        assert!(out.len() >= 5, "one reply frame");
        let len = u32::from_be_bytes([out[0], out[1], out[2], out[3]]) as usize;
        assert_eq!(out.len(), 4 + len, "exactly one reply frame");
        (out[4], out[5..].to_vec())
    }

    #[test]
    fn clean_eof_on_a_frame_boundary_is_none() {
        assert!(read_frame(&mut Cursor::new(Vec::<u8>::new())).expect("eof").is_none());
        assert!(read_frame(&mut Trickle::new(Vec::new())).expect("eof").is_none());
    }

    #[test]
    fn a_partial_header_is_a_protocol_error_not_a_clean_exit() {
        for cut in 1..4 {
            let header = 5_u32.to_be_bytes()[..cut].to_vec();
            let error = read_frame(&mut Cursor::new(header.clone())).expect_err("partial header");
            assert_eq!(error.kind(), io::ErrorKind::InvalidData, "cut {cut}");
            let error = read_frame(&mut Trickle::new(header)).expect_err("partial header");
            assert_eq!(error.kind(), io::ErrorKind::InvalidData, "trickled cut {cut}");
        }
    }

    #[test]
    fn a_body_shorter_than_declared_is_an_error_at_every_cut() {
        let whole = framed(CANARY);
        for cut in 5..whole.len() {
            let error = read_frame(&mut Cursor::new(whole[..cut].to_vec())).expect_err("short body");
            assert_eq!(error.kind(), io::ErrorKind::UnexpectedEof, "cut {cut}");
            assert!(!format!("{error:?}").contains("SYNTH"), "error carries no bytes");
        }
    }

    #[test]
    fn trickled_frames_read_whole_then_stop_cleanly() {
        let mut bytes = framed(&[OP_STATUS]);
        bytes.extend(framed(&named(OP_HAS, b"synthetic-name", b"")));
        let mut reader = Trickle::new(bytes);
        assert_eq!(read_frame(&mut reader).expect("first"), Some(vec![OP_STATUS]));
        assert_eq!(
            read_frame(&mut reader).expect("second"),
            Some(named(OP_HAS, b"synthetic-name", b""))
        );
        assert!(read_frame(&mut reader).expect("boundary").is_none());
    }

    #[test]
    fn a_failing_reader_is_an_error_not_eof() {
        let error = read_frame(&mut Failing).expect_err("broken");
        assert_eq!(error.kind(), io::ErrorKind::BrokenPipe);
    }

    #[test]
    fn lookups_with_trailing_bytes_are_invalid_and_echo_nothing() {
        let mut store = SecretArenaStore::unopened_for_tests();
        for opcode in [OP_HAS, OP_GET] {
            for tail in [&b"x"[..], CANARY, &[0_u8][..]] {
                let (status, data) = handle(&mut store, named(opcode, b"synthetic-name", tail));
                assert_eq!((status, data.is_empty()), (ST_INVALID, true), "op {opcode}");
            }
            let (status, _) = handle(&mut store, named(opcode, b"synthetic-name", b""));
            assert_ne!(status, ST_INVALID, "exact lookup still accepted, op {opcode}");
        }
        assert!(!store.quarantined());
    }

    #[test]
    fn no_operand_ops_with_trailing_bytes_are_invalid() {
        let mut store = SecretArenaStore::unopened_for_tests();
        for opcode in [OP_CLEANUP, OP_STATUS, OP_EPOCH] {
            let mut frame = vec![opcode];
            frame.extend_from_slice(CANARY);
            let (status, data) = handle(&mut store, frame);
            assert_eq!((status, data.is_empty()), (ST_INVALID, true), "op {opcode}");
            let (status, data) = handle(&mut store, vec![opcode, 0]);
            assert_eq!((status, data.is_empty()), (ST_INVALID, true), "op {opcode} + NUL");
        }
        assert_eq!(handle(&mut store, vec![OP_STATUS]), (ST_OK, vec![0]));
        assert_eq!(handle(&mut store, vec![OP_EPOCH]).0, ST_OK);
        assert_eq!(handle(&mut store, vec![OP_CLEANUP]), (ST_OK, Vec::new()));
    }

    /// A CLEANUP with a trailing byte must not run: a stored name survives.
    #[test]
    fn cleanup_with_a_trailing_byte_does_not_clean_up() {
        let mut store = SecretArenaStore::unopened_for_tests();
        let (status, _) = handle(&mut store, named(OP_PUT, b"synthetic-name", b"synthetic-value"));
        if status == ST_UNSUPPORTED {
            return; // no secretmem on this host: nothing stored to observe.
        }
        assert_eq!(status, ST_OK);
        let epoch = handle(&mut store, vec![OP_EPOCH]).1;
        assert_eq!(handle(&mut store, vec![OP_CLEANUP, 1]), (ST_INVALID, Vec::new()));
        assert_eq!(
            handle(&mut store, named(OP_HAS, b"synthetic-name", b"")),
            (ST_OK, vec![1]),
            "name survives a refused cleanup"
        );
        assert_eq!(handle(&mut store, vec![OP_EPOCH]).1, epoch, "epoch unchanged");
        assert_eq!(handle(&mut store, vec![OP_CLEANUP]), (ST_OK, Vec::new()));
        assert_eq!(
            handle(&mut store, named(OP_HAS, b"synthetic-name", b"")),
            (ST_OK, vec![0])
        );
    }

    #[test]
    fn a_put_still_carries_its_value_after_the_name() {
        let mut store = SecretArenaStore::unopened_for_tests();
        let (status, data) = handle(&mut store, named(OP_PUT, b"synthetic-name", b"v"));
        assert!(status == ST_OK || status == ST_UNSUPPORTED, "put status {status}");
        assert!(data.is_empty());
        let _ = handle(&mut store, vec![OP_CLEANUP]);
    }
}

/// MEM-R25 (gap 2.5 / H8 on the wire): OP_PUT_HANDLE, OP_GET_HANDLE and
/// OP_RELEASE. Malformed handles are INVALID before the store is touched;
/// stale, forged and released handles are NOT_FOUND (no oracle) and leave the
/// live entry alone; a quarantined store refuses. Live cases accept the
/// UNSUPPORTED answer on hosts without memfd_secret and stop there.
/// Synthetic data only.
#[cfg(test)]
mod handle_op_tests {
    use super::*;

    const CANARY: &[u8] = b"SYNTH-CANARY-7f3a";
    const WINDOW: usize = 4;

    fn named(opcode: u8, name: &[u8], value: &[u8]) -> Vec<u8> {
        let mut frame = vec![opcode];
        frame.extend_from_slice(&(name.len() as u16).to_be_bytes());
        frame.extend_from_slice(name);
        frame.extend_from_slice(value);
        frame
    }

    fn with_gen(opcode: u8, name: &[u8], generation: u64) -> Vec<u8> {
        named(opcode, name, &generation.to_be_bytes())
    }

    fn has_trace(hay: &[u8]) -> bool {
        CANARY
            .windows(WINDOW)
            .any(|needle| hay.windows(WINDOW).any(|w| w == needle))
    }

    /// One request through the real frame path: the request is wiped, there
    /// is exactly one reply frame, and no canary window leaves the custodian.
    fn send(store: &mut SecretArenaStore, frame: Vec<u8>) -> (u8, Vec<u8>) {
        let mut frame = frame;
        let mut out = Vec::new();
        handle_frame(store, &mut frame, &mut out).expect("in-memory write");
        assert!(frame.iter().all(|b| *b == 0), "request frame wiped");
        assert!(out.len() >= 5, "one reply frame");
        let len = u32::from_be_bytes([out[0], out[1], out[2], out[3]]) as usize;
        assert_eq!(out.len(), 4 + len, "exactly one reply frame");
        assert!(!has_trace(&out), "canary window in reply");
        (out[4], out[5..].to_vec())
    }

    /// PUT_HANDLE on a live host: Some(generation), or None when the host
    /// has no memfd_secret (the only accepted refusal).
    fn put(store: &mut SecretArenaStore, name: &[u8], value: &[u8]) -> Option<u64> {
        let (status, data) = send(store, named(OP_PUT_HANDLE, name, value));
        if status == ST_UNSUPPORTED {
            assert!(data.is_empty());
            return None;
        }
        assert_eq!(status, ST_OK, "put_handle status");
        let bytes: [u8; 8] = data.as_slice().try_into().expect("8-byte generation");
        let generation = u64::from_be_bytes(bytes);
        assert_ne!(generation, 0, "generation 0 is never issued");
        Some(generation)
    }

    #[test]
    fn opcodes_are_pinned_and_six_stays_unassigned() {
        assert_eq!((OP_PUT_HANDLE, OP_GET_HANDLE, OP_RELEASE), (8, 9, 10));
        let mut store = SecretArenaStore::unopened_for_tests();
        for opcode in [6u8, 11, 0x7f, 0xff] {
            let (status, data) = send(&mut store, with_gen(opcode, b"k", 1));
            assert_eq!((status, data.is_empty()), (ST_INVALID, true), "opcode {opcode}");
        }
        assert!(!store.quarantined());
    }

    #[test]
    fn generation_zero_is_invalid_before_any_lookup() {
        let mut store = SecretArenaStore::unopened_for_tests();
        for opcode in [OP_GET_HANDLE, OP_RELEASE] {
            let (status, data) = send(&mut store, with_gen(opcode, b"k", 0));
            assert_eq!((status, data.is_empty()), (ST_INVALID, true), "opcode {opcode}");
        }
        assert!(SecretHandle::from_wire("k", 0).is_none());
        assert_eq!(SecretHandle::from_wire("k", 7).map(|h| h.generation()), Some(7));
    }

    #[test]
    fn generation_operand_must_be_exactly_eight_bytes() {
        let mut store = SecretArenaStore::unopened_for_tests();
        for opcode in [OP_GET_HANDLE, OP_RELEASE] {
            for len in [0usize, 1, 7, 9, 16] {
                let operand = vec![0x01; len];
                let (status, data) = send(&mut store, named(opcode, b"k", &operand));
                assert_eq!(
                    (status, data.is_empty()),
                    (ST_INVALID, true),
                    "opcode {opcode} operand {len}"
                );
            }
        }
        assert!(!store.quarantined());
    }

    #[test]
    fn malformed_names_on_handle_ops_refuse_without_echo() {
        let mut store = SecretArenaStore::unopened_for_tests();
        for opcode in [OP_PUT_HANDLE, OP_GET_HANDLE, OP_RELEASE] {
            // Name length runs past the frame.
            let mut frame = vec![opcode, 0xff, 0xff];
            frame.extend_from_slice(CANARY);
            assert_eq!(send(&mut store, frame), (ST_INVALID, Vec::new()), "overrun {opcode}");
            // Name is not UTF-8.
            let (status, data) = send(&mut store, with_gen(opcode, &[0xff, 0xfe, 0x80], 1));
            assert_eq!((status, data.is_empty()), (ST_INVALID, true), "utf8 {opcode}");
            // Bare opcode.
            assert_eq!(send(&mut store, vec![opcode]), (ST_INVALID, Vec::new()), "bare {opcode}");
        }
        // An empty value on PUT_HANDLE is refused like PUT.
        let (status, data) = send(&mut store, named(OP_PUT_HANDLE, b"k", b""));
        assert_eq!((status, data.is_empty()), (ST_INVALID, true));
    }

    #[test]
    fn forged_handles_on_an_empty_store_are_not_found() {
        let mut store = SecretArenaStore::unopened_for_tests();
        for generation in [1u64, 2, 0x8000_0000_0000_0000, u64::MAX] {
            for opcode in [OP_GET_HANDLE, OP_RELEASE] {
                let (status, data) = send(&mut store, with_gen(opcode, CANARY, generation));
                assert_eq!(
                    (status, data.is_empty()),
                    (ST_NOT_FOUND, true),
                    "opcode {opcode} generation {generation:#x}"
                );
            }
        }
        assert!(!store.quarantined());
    }

    #[test]
    fn a_quarantined_store_refuses_every_handle_op() {
        let mut store = SecretArenaStore::unopened_for_tests();
        store.force_cleanup_failure();
        let (status, data) = send(&mut store, named(OP_PUT_HANDLE, CANARY, CANARY));
        assert_eq!((status, data.is_empty()), (ST_QUARANTINED, true));
        for opcode in [OP_GET_HANDLE, OP_RELEASE] {
            let (status, data) = send(&mut store, with_gen(opcode, CANARY, 1));
            assert_eq!((status, data.is_empty()), (ST_QUARANTINED, true), "opcode {opcode}");
            // A malformed handle is still INVALID first: parsing comes
            // before the store, so quarantine can't be probed with junk.
            let (status, _) = send(&mut store, with_gen(opcode, CANARY, 0));
            assert_eq!(status, ST_INVALID, "opcode {opcode}");
        }
    }

    #[test]
    fn live_round_trip_then_release_ends_the_handle() {
        let mut store = SecretArenaStore::unopened_for_tests();
        let Some(generation) = put(&mut store, b"k", b"round-trip-synthetic") else {
            return;
        };
        assert_eq!(
            send(&mut store, with_gen(OP_GET_HANDLE, b"k", generation)),
            (ST_OK, b"round-trip-synthetic".to_vec())
        );
        // The name path sees the same entry.
        assert_eq!(send(&mut store, named(OP_HAS, b"k", b"")), (ST_OK, vec![1]));
        assert_eq!(send(&mut store, with_gen(OP_RELEASE, b"k", generation)), (ST_OK, Vec::new()));
        assert_eq!(send(&mut store, named(OP_HAS, b"k", b"")), (ST_OK, vec![0]));
        assert_eq!(
            send(&mut store, with_gen(OP_GET_HANDLE, b"k", generation)),
            (ST_NOT_FOUND, Vec::new())
        );
        assert_eq!(send(&mut store, named(OP_GET, b"k", b"")), (ST_NOT_FOUND, Vec::new()));
        // Double release is NOT_FOUND and harmless.
        assert_eq!(
            send(&mut store, with_gen(OP_RELEASE, b"k", generation)),
            (ST_NOT_FOUND, Vec::new())
        );
        assert!(!store.quarantined());
    }

    #[test]
    fn live_stale_handle_after_reput_cannot_reach_or_release_the_new_entry() {
        let mut store = SecretArenaStore::unopened_for_tests();
        let Some(old) = put(&mut store, b"k", b"first-synthetic") else {
            return;
        };
        let new = put(&mut store, b"k", b"second-synthetic").expect("second put on a live host");
        assert!(new > old, "generations increase");
        assert_eq!(send(&mut store, with_gen(OP_GET_HANDLE, b"k", old)), (ST_NOT_FOUND, Vec::new()));
        assert_eq!(send(&mut store, with_gen(OP_RELEASE, b"k", old)), (ST_NOT_FOUND, Vec::new()));
        // The live entry survived the stale release.
        assert_eq!(
            send(&mut store, with_gen(OP_GET_HANDLE, b"k", new)),
            (ST_OK, b"second-synthetic".to_vec())
        );
        // A future (never issued) generation is refused the same way.
        assert_eq!(
            send(&mut store, with_gen(OP_GET_HANDLE, b"k", new + 1)),
            (ST_NOT_FOUND, Vec::new())
        );
        assert_eq!(send(&mut store, with_gen(OP_RELEASE, b"k", new)), (ST_OK, Vec::new()));
        assert!(!store.quarantined());
    }

    #[test]
    fn live_handles_do_not_cross_names() {
        let mut store = SecretArenaStore::unopened_for_tests();
        let Some(a) = put(&mut store, b"a", b"alpha-synthetic") else {
            return;
        };
        let b = put(&mut store, b"b", b"beta-synthetic").expect("second put on a live host");
        assert_eq!(b, a + 1, "one counter across names");
        // Each generation only opens its own name.
        assert_eq!(send(&mut store, with_gen(OP_GET_HANDLE, b"b", a)), (ST_NOT_FOUND, Vec::new()));
        assert_eq!(send(&mut store, with_gen(OP_RELEASE, b"a", b)), (ST_NOT_FOUND, Vec::new()));
        assert_eq!(
            send(&mut store, with_gen(OP_GET_HANDLE, b"a", a)),
            (ST_OK, b"alpha-synthetic".to_vec())
        );
        assert_eq!(send(&mut store, with_gen(OP_RELEASE, b"b", b)), (ST_OK, Vec::new()));
        assert_eq!(send(&mut store, named(OP_HAS, b"a", b"")), (ST_OK, vec![1]));
        assert_eq!(send(&mut store, vec![OP_CLEANUP]), (ST_OK, Vec::new()));
        assert_eq!(send(&mut store, with_gen(OP_GET_HANDLE, b"a", a)), (ST_NOT_FOUND, Vec::new()));
    }

    #[test]
    fn live_generation_exhaustion_on_the_wire_quarantines() {
        let mut store = SecretArenaStore::unopened_for_tests();
        store.set_next_generation_for_tests(u64::MAX);
        let (status, data) = send(&mut store, named(OP_PUT_HANDLE, b"k", CANARY));
        assert!(data.is_empty());
        if status == ST_UNSUPPORTED {
            return;
        }
        assert_eq!(status, ST_QUARANTINED);
        assert!(store.quarantined());
        assert_eq!(send(&mut store, named(OP_HAS, b"k", b"")), (ST_QUARANTINED, Vec::new()));
        assert_eq!(send(&mut store, vec![OP_STATUS]), (ST_OK, vec![1]));
    }

    #[test]
    fn live_name_put_entries_are_not_reachable_by_guessing_generations() {
        let mut store = SecretArenaStore::unopened_for_tests();
        let (status, _) = send(&mut store, named(OP_PUT, b"k", CANARY));
        if status == ST_UNSUPPORTED {
            return;
        }
        assert_eq!(status, ST_OK);
        // A name PUT also takes a generation (1 here); a client guessing it
        // still only gets the entry it could already read by name, and a
        // wrong guess is the same NOT_FOUND as an absent name.
        for guess in [2u64, 3, u64::MAX] {
            assert_eq!(
                send(&mut store, with_gen(OP_GET_HANDLE, b"k", guess)),
                (ST_NOT_FOUND, Vec::new()),
                "guess {guess}"
            );
            assert_eq!(send(&mut store, with_gen(OP_RELEASE, b"k", guess)), (ST_NOT_FOUND, Vec::new()));
        }
        assert_eq!(send(&mut store, named(OP_HAS, b"k", b"")), (ST_OK, vec![1]));
        assert_eq!(send(&mut store, vec![OP_CLEANUP]), (ST_OK, Vec::new()));
    }
}

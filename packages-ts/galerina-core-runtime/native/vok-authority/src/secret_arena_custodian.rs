//! Stdin/stdout custodian for `SecretArenaStore`. Public so the bin can start it.

use std::fs::File;
use std::io::{self, Read, Write};
use std::os::fd::AsFd;
use std::process;
use std::sync::atomic::{compiler_fence, Ordering};

use super::secret_arena::SecretArenaError;
use super::secret_arena_store::SecretArenaStore;

const OP_PUT: u8 = 1;
const OP_HAS: u8 = 2;
const OP_GET: u8 = 3;
const OP_CLEANUP: u8 = 4;
const OP_STATUS: u8 = 5;
const OP_EPOCH: u8 = 7;

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

fn read_frame(reader: &mut impl Read) -> io::Result<Vec<u8>> {
    let mut header = [0_u8; 4];
    if let Err(error) = reader.read_exact(&mut header) {
        wipe_volatile(&mut header);
        return Err(error);
    }
    let len = u32::from_be_bytes(header);
    wipe_volatile(&mut header);
    if len == 0 || len > MAX_FRAME {
        return Err(io::Error::new(io::ErrorKind::InvalidData, "frame"));
    }
    read_exact_n(reader, len as usize)
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

/// Blocking request loop. Exits the process on a fatal protocol or store-open failure.
pub fn run_secret_arena_custodian() -> ! {
    let (mut stdin, mut stdout) = unbuffered_stdio();
    let mut store = match SecretArenaStore::open() {
        Ok(store) => store,
        Err(error) => {
            let _ = reply(&mut stdout, status_of(error), &[]);
            process::exit(2);
        }
    };

    loop {
        let mut frame = match read_frame(&mut stdin) {
            Ok(frame) => frame,
            Err(error) if error.kind() == io::ErrorKind::UnexpectedEof => process::exit(0),
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
            let (name, _) = match read_name(rest) {
                Ok(pair) => pair,
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
            let (name, _) = match read_name(rest) {
                Ok(pair) => pair,
                Err(error) => return Ok((status_of(error), Vec::new())),
            };
            match store.get(name) {
                Ok(bytes) => Ok((ST_OK, bytes)),
                Err(error) => Ok((status_of(error), Vec::new())),
            }
        }
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
        let (status, data) = one(&mut store, "get missing canary", named(OP_GET, CANARY, CANARY));
        assert_eq!(status, ST_NOT_FOUND);
        assert!(data.is_empty());
        let (status, data) = one(&mut store, "has missing canary", named(OP_HAS, CANARY, CANARY));
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

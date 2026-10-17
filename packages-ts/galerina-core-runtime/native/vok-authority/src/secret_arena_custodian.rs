//! Stdin/stdout custodian for `SecretArenaStore`. Public so the bin can start it.

use std::fs::File;
use std::io::{self, Read, Write};
use std::os::fd::AsFd;
use std::process;

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
                buf.fill(0);
                tmp.fill(0);
                return Err(io::Error::new(io::ErrorKind::UnexpectedEof, "frame"));
            }
            Ok(got) => {
                buf[filled..filled + got].copy_from_slice(&tmp[..got]);
                tmp[..got].fill(0);
                filled += got;
            }
            Err(error) if error.kind() == io::ErrorKind::Interrupted => continue,
            Err(error) => {
                buf.fill(0);
                tmp.fill(0);
                return Err(error);
            }
        }
    }
    tmp.fill(0);
    Ok(buf)
}

fn read_frame(reader: &mut impl Read) -> io::Result<Vec<u8>> {
    let mut header = [0_u8; 4];
    if let Err(error) = reader.read_exact(&mut header) {
        header.fill(0);
        return Err(error);
    }
    let len = u32::from_be_bytes(header);
    header.fill(0);
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
        self.0.fill(0);
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
        if frame.is_empty() {
            frame.fill(0);
            let _ = reply(&mut stdout, ST_INVALID, &[]);
            continue;
        }
        let opcode = frame[0];
        let rest = &frame[1..];
        let result = dispatch(&mut store, opcode, rest);
        match result {
            Ok((status, data)) => {
                let data = ZeroOnDrop(data);
                let write = reply(&mut stdout, status, data.as_slice());
                frame.fill(0);
                if write.is_err() {
                    process::exit(1);
                }
            }
            Err(_) => {
                frame.fill(0);
                let _ = reply(&mut stdout, ST_INTERNAL, &[]);
            }
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

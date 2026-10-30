//! VOK linear-memory bounds and integer-trap checker (MEM-R9, gap map 5.4 / H16).
//!
//! This is the Rust side of the trap-parity triangle SLIDE model <-> WebAssembly
//! engine <-> VOK. SLIDE owns production admission (GIR -> SLIDE); VOK is the
//! unshipped Rust checker beside it, so this module only answers "what must the
//! runtime do" for one access, range, copy, grow or division, and the parity
//! vectors in `vectors/linear-memory-trap-vectors.rows.txt` (derived from the
//! SLIDE reference model `src/linear-memory-bounds.mjs` and checked against the
//! real engine) bind it to SLIDE byte for byte.
//!
//! Rules mirrored from SLIDE:
//! * every sum is exact (u128 / i128), so nothing wraps at 2^32 or 2^64;
//! * an access is in bounds only when address + offset + width <= memory bytes;
//! * memory.copy checks both ranges before any byte moves;
//! * memory.grow past the limit returns -1 and leaves the size unchanged;
//! * div_s(MIN, -1) traps (overflow), rem_s(MIN, -1) is 0, any zero divisor traps;
//! * anything outside the admitted input shape is REFUSED with LMB-001, never guessed.
//!
//! Since MEM-R13 the crate root exports it (`pub mod linear_memory_bounds`) for
//! `lmb_verdict` and the `vok-lmb-check` binary; the parity test still pulls the
//! same file in with `#[path]`, so both paths check one source.

#![allow(dead_code)]

pub const LMB_PAGE_BYTES: u128 = 65_536;
pub const LMB_MEMORY32_MAX_PAGES: u128 = 65_536;
pub const LMB_MEMORY64_MAX_PAGES: u128 = 1 << 48;
pub const LMB_ADMITTED_WIDTHS: [u128; 5] = [1, 2, 4, 8, 16];

pub const LMB_FAILURE_INVALID: &str = "SLIDE-LMB-001";
pub const LMB_FAILURE_OUT_OF_BOUNDS: &str = "SLIDE-LMB-002";
pub const LMB_FAILURE_DIVIDE_BY_ZERO: &str = "SLIDE-LMB-003";
pub const LMB_FAILURE_OVERFLOW: &str = "SLIDE-LMB-004";
pub const LMB_FAILURE_GROW_REFUSED: &str = "SLIDE-LMB-005";
pub const LMB_FAILURE_NONE: &str = "NONE";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum IndexType {
    I32,
    I64,
}

impl IndexType {
    pub fn parse(text: &str) -> Option<IndexType> {
        match text {
            "i32" => Some(IndexType::I32),
            "i64" => Some(IndexType::I64),
            _ => None,
        }
    }

    fn address_bits(self) -> u32 {
        match self {
            IndexType::I32 => 32,
            IndexType::I64 => 64,
        }
    }

    fn max_pages(self) -> u128 {
        match self {
            IndexType::I32 => LMB_MEMORY32_MAX_PAGES,
            IndexType::I64 => LMB_MEMORY64_MAX_PAGES,
        }
    }

    fn admits_unsigned(self, value: u128) -> bool {
        value < (1u128 << self.address_bits())
    }

    fn admits_memory_bytes(self, memory_bytes: u128) -> bool {
        memory_bytes % LMB_PAGE_BYTES == 0 && memory_bytes / LMB_PAGE_BYTES <= self.max_pages()
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Status {
    Refused,
    Trap,
    InBounds,
    GrowRefused,
    Grown,
    Value,
}

impl Status {
    pub fn as_str(self) -> &'static str {
        match self {
            Status::Refused => "REFUSED",
            Status::Trap => "TRAP",
            Status::InBounds => "IN_BOUNDS",
            Status::GrowRefused => "GROW_REFUSED",
            Status::Grown => "GROWN",
            Status::Value => "VALUE",
        }
    }
}

/// One checker answer. `verdict` is +1 only for an admitted operation.
/// `result`/`pages` are set for grow, `value` for division.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Outcome {
    pub verdict: i8,
    pub status: Status,
    pub failure_id: &'static str,
    pub result: Option<i128>,
    pub pages: Option<u128>,
    pub value: Option<i128>,
}

impl Outcome {
    fn refused() -> Outcome {
        Outcome::fail(Status::Refused, LMB_FAILURE_INVALID)
    }

    fn trap(failure_id: &'static str) -> Outcome {
        Outcome::fail(Status::Trap, failure_id)
    }

    fn fail(status: Status, failure_id: &'static str) -> Outcome {
        Outcome { verdict: -1, status, failure_id, result: None, pages: None, value: None }
    }

    fn admitted(status: Status) -> Outcome {
        Outcome { verdict: 1, status, failure_id: LMB_FAILURE_NONE, result: None, pages: None, value: None }
    }

    /// Wire form shared with the parity rows: `STATUS FAILURE [extra...]`.
    pub fn row_tail(&self) -> String {
        let mut out = format!("{} {}", self.status.as_str(), self.failure_id);
        if let (Some(result), Some(pages)) = (self.result, self.pages) {
            out.push_str(&format!(" {} {}", result, pages));
        }
        if let Some(value) = self.value {
            out.push_str(&format!(" {}", value));
        }
        out
    }
}

/// One scalar load or store: in bounds only when every byte
/// address + offset .. address + offset + width - 1 is below memory_bytes.
pub fn check_linear_access(index_type: IndexType, address: u128, static_offset: u128, width: u128, memory_bytes: u128) -> Outcome {
    if !index_type.admits_unsigned(address)
        || !index_type.admits_unsigned(static_offset)
        || !LMB_ADMITTED_WIDTHS.contains(&width)
        || !index_type.admits_memory_bytes(memory_bytes)
    {
        return Outcome::refused();
    }
    let end = address + static_offset + width;
    if end > memory_bytes {
        return Outcome::trap(LMB_FAILURE_OUT_OF_BOUNDS);
    }
    Outcome::admitted(Status::InBounds)
}

/// One bulk range (memory.fill side). A zero-length range is admitted at any
/// start up to and including memory_bytes and refused past it.
pub fn check_linear_range(index_type: IndexType, start: u128, length: u128, memory_bytes: u128) -> Outcome {
    if !index_type.admits_unsigned(start)
        || !index_type.admits_unsigned(length)
        || !index_type.admits_memory_bytes(memory_bytes)
    {
        return Outcome::refused();
    }
    if start + length > memory_bytes {
        return Outcome::trap(LMB_FAILURE_OUT_OF_BOUNDS);
    }
    Outcome::admitted(Status::InBounds)
}

/// memory.copy: both ranges must be in bounds before any byte moves.
pub fn check_linear_copy(index_type: IndexType, destination: u128, source: u128, length: u128, memory_bytes: u128) -> Outcome {
    let into = check_linear_range(index_type, destination, length, memory_bytes);
    let from = check_linear_range(index_type, source, length, memory_bytes);
    if into.status == Status::Refused || from.status == Status::Refused {
        return Outcome::refused();
    }
    if into.verdict != 1 || from.verdict != 1 {
        return Outcome::trap(LMB_FAILURE_OUT_OF_BOUNDS);
    }
    Outcome::admitted(Status::InBounds)
}

/// memory.grow: past the declared maximum (or the index type's page limit)
/// the result is -1 and the page count is unchanged; a refusal value, not a trap.
pub fn check_memory_grow(index_type: IndexType, current_pages: u128, delta_pages: u128, max_pages: Option<u128>) -> Outcome {
    if let Some(declared) = max_pages {
        if declared > index_type.max_pages() {
            return Outcome::refused();
        }
    }
    let limit = max_pages.unwrap_or(index_type.max_pages());
    if current_pages > limit || !index_type.admits_unsigned(delta_pages) {
        return Outcome::refused();
    }
    let pages = current_pages + delta_pages;
    if pages > limit {
        let mut out = Outcome::fail(Status::GrowRefused, LMB_FAILURE_GROW_REFUSED);
        out.result = Some(-1);
        out.pages = Some(current_pages);
        return out;
    }
    let mut out = Outcome::admitted(Status::Grown);
    out.result = Some(current_pages as i128);
    out.pages = Some(pages);
    out
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DivOp {
    DivS,
    DivU,
    RemS,
    RemU,
}

impl DivOp {
    pub fn parse(text: &str) -> Option<DivOp> {
        match text {
            "div_s" => Some(DivOp::DivS),
            "div_u" => Some(DivOp::DivU),
            "rem_s" => Some(DivOp::RemS),
            "rem_u" => Some(DivOp::RemU),
            _ => None,
        }
    }
}

fn to_unsigned(value: i128, bits: u32) -> u128 {
    (value as u128) & ((1u128 << bits) - 1)
}

fn to_signed(value: u128, bits: u32) -> i128 {
    let masked = value & ((1u128 << bits) - 1);
    if masked >> (bits - 1) == 1 {
        masked as i128 - (1i128 << bits)
    } else {
        masked as i128
    }
}

/// Integer division and remainder with WebAssembly trap rules. a and b are
/// signed values inside the bit width; div_u/rem_u reinterpret the bits and
/// return the result as a signed value of the same width.
pub fn check_integer_division(op: DivOp, bits: u32, a: i128, b: i128) -> Outcome {
    if bits != 32 && bits != 64 {
        return Outcome::refused();
    }
    let min = -(1i128 << (bits - 1));
    let max = (1i128 << (bits - 1)) - 1;
    if a < min || a > max || b < min || b > max {
        return Outcome::refused();
    }
    if b == 0 {
        return Outcome::trap(LMB_FAILURE_DIVIDE_BY_ZERO);
    }
    let value = match op {
        DivOp::DivS => {
            if a == min && b == -1 {
                return Outcome::trap(LMB_FAILURE_OVERFLOW);
            }
            a / b
        }
        DivOp::RemS => {
            if a == min && b == -1 {
                0
            } else {
                a % b
            }
        }
        DivOp::DivU => to_signed(to_unsigned(a, bits) / to_unsigned(b, bits), bits),
        DivOp::RemU => to_signed(to_unsigned(a, bits) % to_unsigned(b, bits), bits),
    };
    let mut out = Outcome::admitted(Status::Value);
    out.value = Some(value);
    out
}

/// Evaluate one parity row's input half (`kind fields...`), as written by the
/// SLIDE-derived generator. Unknown kinds or unparsable numbers are REFUSED.
pub fn evaluate_row_input(fields: &[&str]) -> Outcome {
    fn u(text: &str) -> Option<u128> {
        text.parse::<u128>().ok()
    }
    fn i(text: &str) -> Option<i128> {
        text.parse::<i128>().ok()
    }
    let parsed = (|| -> Option<Outcome> {
        match *fields.first()? {
            "access" if fields.len() == 6 => {
                let idx = IndexType::parse(fields[1])?;
                Some(check_linear_access(idx, u(fields[2])?, u(fields[3])?, u(fields[4])?, u(fields[5])?))
            }
            "range" if fields.len() == 5 => {
                let idx = IndexType::parse(fields[1])?;
                Some(check_linear_range(idx, u(fields[2])?, u(fields[3])?, u(fields[4])?))
            }
            "copy" if fields.len() == 6 => {
                let idx = IndexType::parse(fields[1])?;
                Some(check_linear_copy(idx, u(fields[2])?, u(fields[3])?, u(fields[4])?, u(fields[5])?))
            }
            "grow" if fields.len() == 5 => {
                let idx = IndexType::parse(fields[1])?;
                let max = if fields[4] == "-" { None } else { Some(u(fields[4])?) };
                Some(check_memory_grow(idx, u(fields[2])?, u(fields[3])?, max))
            }
            "div" if fields.len() == 5 => {
                let op = DivOp::parse(fields[1])?;
                let bits = fields[2].parse::<u32>().ok()?;
                Some(check_integer_division(op, bits, i(fields[3])?, i(fields[4])?))
            }
            _ => None,
        }
    })();
    parsed.unwrap_or_else(Outcome::refused)
}

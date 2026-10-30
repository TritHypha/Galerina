//! VOK lease audit (MEM-R14, gap map H1 / 1.1 / 1.4, VOK side).
//!
//! MEM-R10 pinned SLIDE's JavaScript reference model: one receipt per lease,
//! reuse refused, refusals carry no bytes. It also found that a refused reuse
//! writes no durable record, so nothing outside the process can show that a
//! second use was refused rather than silently dropped or silently admitted.
//! This module is the VOK-side checker for that record. It reads a closed,
//! synthetic lease event log and proves, per lease:
//!
//! * the lease was opened exactly once, before any use, at one epoch;
//! * every use is answered by the very next event, with either one receipt or
//!   one refusal audit record for the same lease and epoch;
//! * at most one receipt per lease (a second receipt is an admitted reuse);
//! * every use after the receipt is answered by `refused ... REUSE 0`, and no
//!   refusal carries secret bytes (its byte count must be 0);
//! * a receipt holds only lease id, epoch, verdict and a non-zero hash (gap
//!   1.4: the closed receipt shape), so nothing else can ride in it.
//!
//! Event lines (ASCII, LF only, single spaces):
//!
//! ```text
//! open    <lease:16 hex> <epoch>
//! use     <lease> <epoch>
//! receipt <lease> <epoch> ALLOW|DENY <hash:64 hex>
//! refused <lease> <epoch> REUSE|EXPIRED|EPOCH|FOREIGN_SINK|PRE_ENTRY <bytes>
//! ```
//!
//! Per-lease verdicts fold with strong Kleene AND (minimum, DENY is final)
//! into a K3 wire byte: 0x01 ALLOW, 0xFF DENY, 0x80 UNKNOWN. A log that ends
//! on an unanswered use is UNKNOWN (truncated evidence), and a log in which no
//! lease was ever used is UNKNOWN too, because it proves nothing about reuse.
//! Gates refuse anything but ALLOW. Any clock value <= 0 refuses the whole log.
//!
//! Production leases and receipts belong to SLIDE (GIR -> SLIDE). VOK is the
//! unshipped Rust checker beside it; this verdict is evidence, not admission.

use std::collections::HashMap;

use crate::k3_frame::k3_wire_and;
use crate::sha256::sha256;

pub const LEASE_AUDIT_SCHEMA: &str = "galerina.vok.lease-audit.v1";
pub const LEASE_AUDIT_MAX_EVENTS: usize = 65_536;
pub const LEASE_AUDIT_MAX_LINE_BYTES: usize = 160;
pub const LEASE_AUDIT_MAX_INPUT_BYTES: usize =
    LEASE_AUDIT_MAX_EVENTS * (LEASE_AUDIT_MAX_LINE_BYTES + 1);
pub const LEASE_AUDIT_MAX_LEASES: usize = 4_096;

pub const LA_K3_ALLOW: u8 = 0x01;
pub const LA_K3_DENY: u8 = 0xFF;
pub const LA_K3_UNKNOWN: u8 = 0x80;

const WIRE_ALLOW: i32 = 1;
const WIRE_DENY: i32 = -1;
const WIRE_UNKNOWN: i32 = -128;

// Whole-log refusals: the log is not evidence at all.
pub const VOK_LA_INPUT_TOO_LARGE: &str = "VOK_LA_INPUT_TOO_LARGE";
pub const VOK_LA_INPUT_NOT_ASCII: &str = "VOK_LA_INPUT_NOT_ASCII";
pub const VOK_LA_INPUT_CR: &str = "VOK_LA_INPUT_CR";
pub const VOK_LA_LINE_TOO_LONG: &str = "VOK_LA_LINE_TOO_LONG";
pub const VOK_LA_LINE_MALFORMED: &str = "VOK_LA_LINE_MALFORMED";
pub const VOK_LA_FIELD: &str = "VOK_LA_FIELD";
pub const VOK_LA_EPOCH_NONPOSITIVE: &str = "VOK_LA_EPOCH_NONPOSITIVE";
pub const VOK_LA_TOO_MANY_EVENTS: &str = "VOK_LA_TOO_MANY_EVENTS";
pub const VOK_LA_TOO_MANY_LEASES: &str = "VOK_LA_TOO_MANY_LEASES";

// Per-lease findings. The first finding that lowers a lease's verdict names it.
pub const VOK_LA_OK: &str = "VOK_LA_OK";
pub const VOK_LA_UNUSED: &str = "VOK_LA_UNUSED";
pub const VOK_LA_DUP_OPEN: &str = "VOK_LA_DUP_OPEN";
pub const VOK_LA_NOT_OPENED: &str = "VOK_LA_NOT_OPENED";
pub const VOK_LA_EPOCH_MISMATCH: &str = "VOK_LA_EPOCH_MISMATCH";
pub const VOK_LA_USE_UNANSWERED: &str = "VOK_LA_USE_UNANSWERED";
pub const VOK_LA_ORPHAN_OUTCOME: &str = "VOK_LA_ORPHAN_OUTCOME";
pub const VOK_LA_SECOND_RECEIPT: &str = "VOK_LA_SECOND_RECEIPT";
pub const VOK_LA_RECEIPT_HASH_ZERO: &str = "VOK_LA_RECEIPT_HASH_ZERO";
pub const VOK_LA_REFUSAL_BYTES: &str = "VOK_LA_REFUSAL_BYTES";
pub const VOK_LA_REUSE_BEFORE_RECEIPT: &str = "VOK_LA_REUSE_BEFORE_RECEIPT";
pub const VOK_LA_REUSE_MISLABELED: &str = "VOK_LA_REUSE_MISLABELED";
pub const VOK_LA_TRUNCATED: &str = "VOK_LA_TRUNCATED";

/// Closed set of refusal reasons a refusal audit record may carry.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RefusalReason {
    Reuse,
    Expired,
    Epoch,
    ForeignSink,
    PreEntry,
}

impl RefusalReason {
    fn parse(text: &str) -> Option<Self> {
        match text {
            "REUSE" => Some(Self::Reuse),
            "EXPIRED" => Some(Self::Expired),
            "EPOCH" => Some(Self::Epoch),
            "FOREIGN_SINK" => Some(Self::ForeignSink),
            "PRE_ENTRY" => Some(Self::PreEntry),
            _ => None,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Reuse => "REUSE",
            Self::Expired => "EXPIRED",
            Self::Epoch => "EPOCH",
            Self::ForeignSink => "FOREIGN_SINK",
            Self::PreEntry => "PRE_ENTRY",
        }
    }
}

/// One parsed event line.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum LeaseEvent {
    Open { lease: String, epoch: u64 },
    Use { lease: String, epoch: u64 },
    Receipt { lease: String, epoch: u64, allow: bool, hash: [u8; 32] },
    Refused { lease: String, epoch: u64, reason: RefusalReason, bytes: u32 },
}

impl LeaseEvent {
    pub fn lease(&self) -> &str {
        match self {
            Self::Open { lease, .. }
            | Self::Use { lease, .. }
            | Self::Receipt { lease, .. }
            | Self::Refused { lease, .. } => lease,
        }
    }

    pub fn epoch(&self) -> u64 {
        match self {
            Self::Open { epoch, .. }
            | Self::Use { epoch, .. }
            | Self::Receipt { epoch, .. }
            | Self::Refused { epoch, .. } => *epoch,
        }
    }

    fn is_outcome(&self) -> bool {
        matches!(self, Self::Receipt { .. } | Self::Refused { .. })
    }
}

fn is_lower_hex(byte: u8) -> bool {
    byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte)
}

fn parse_lease(text: &str) -> Result<String, &'static str> {
    if text.len() == 16 && text.bytes().all(is_lower_hex) {
        Ok(text.to_string())
    } else {
        Err(VOK_LA_FIELD)
    }
}

/// Canonical positive decimal. Zero or a sign is a non-positive clock value
/// and refuses the whole log; leading zeros and overflow are malformed.
fn parse_epoch(text: &str) -> Result<u64, &'static str> {
    if text.starts_with('-') || text == "0" {
        return Err(VOK_LA_EPOCH_NONPOSITIVE);
    }
    if text.is_empty() || !text.bytes().all(|b| b.is_ascii_digit()) || text.starts_with('0') {
        return Err(VOK_LA_FIELD);
    }
    let value: u64 = text.parse().map_err(|_| VOK_LA_FIELD)?;
    if value > i64::MAX as u64 {
        return Err(VOK_LA_FIELD);
    }
    Ok(value)
}

fn parse_hash(text: &str) -> Result<[u8; 32], &'static str> {
    if text.len() != 64 || !text.bytes().all(is_lower_hex) {
        return Err(VOK_LA_FIELD);
    }
    let mut out = [0u8; 32];
    let bytes = text.as_bytes();
    for (index, slot) in out.iter_mut().enumerate() {
        let hi = (bytes[index * 2] as char).to_digit(16).ok_or(VOK_LA_FIELD)?;
        let lo = (bytes[index * 2 + 1] as char).to_digit(16).ok_or(VOK_LA_FIELD)?;
        *slot = ((hi << 4) | lo) as u8;
    }
    Ok(out)
}

fn parse_bytes(text: &str) -> Result<u32, &'static str> {
    if text.is_empty() || !text.bytes().all(|b| b.is_ascii_digit()) || (text.len() > 1 && text.starts_with('0')) {
        return Err(VOK_LA_FIELD);
    }
    text.parse().map_err(|_| VOK_LA_FIELD)
}

/// Parse one event line. Shape problems (kind, field count, spacing) are
/// VOK_LA_LINE_MALFORMED; a bad field value is VOK_LA_FIELD.
pub fn parse_event(line: &str) -> Result<LeaseEvent, &'static str> {
    if line.is_empty() || line.starts_with(' ') || line.ends_with(' ') || line.contains("  ") {
        return Err(VOK_LA_LINE_MALFORMED);
    }
    let fields: Vec<&str> = line.split(' ').collect();
    match (fields[0], fields.len()) {
        ("open", 3) => Ok(LeaseEvent::Open {
            lease: parse_lease(fields[1])?,
            epoch: parse_epoch(fields[2])?,
        }),
        ("use", 3) => Ok(LeaseEvent::Use {
            lease: parse_lease(fields[1])?,
            epoch: parse_epoch(fields[2])?,
        }),
        ("receipt", 5) => {
            let lease = parse_lease(fields[1])?;
            let epoch = parse_epoch(fields[2])?;
            let allow = match fields[3] {
                "ALLOW" => true,
                "DENY" => false,
                _ => return Err(VOK_LA_FIELD),
            };
            Ok(LeaseEvent::Receipt { lease, epoch, allow, hash: parse_hash(fields[4])? })
        }
        ("refused", 5) => {
            let lease = parse_lease(fields[1])?;
            let epoch = parse_epoch(fields[2])?;
            let reason = RefusalReason::parse(fields[3]).ok_or(VOK_LA_FIELD)?;
            Ok(LeaseEvent::Refused { lease, epoch, reason, bytes: parse_bytes(fields[4])? })
        }
        _ => Err(VOK_LA_LINE_MALFORMED),
    }
}

/// What the audit found for one lease.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct LeaseFinding {
    pub lease: String,
    pub epoch: Option<u64>,
    pub uses: usize,
    pub receipts: usize,
    pub refusals: usize,
    pub verdict_byte: u8,
    pub code: &'static str,
}

impl LeaseFinding {
    pub fn line(&self) -> String {
        let epoch = match self.epoch {
            Some(value) => value.to_string(),
            None => "-".to_string(),
        };
        format!(
            "lease {} epoch={} uses={} receipts={} refusals={} | {} {}",
            self.lease,
            epoch,
            self.uses,
            self.receipts,
            self.refusals,
            label(self.verdict_byte),
            self.code
        )
    }
}

/// The audit result: per-lease findings in first-seen order plus the fold.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct LeaseAuditVerdict {
    pub events: usize,
    pub findings: Vec<LeaseFinding>,
    pub verdict_byte: u8,
    pub body_sha256: [u8; 32],
}

impl LeaseAuditVerdict {
    pub fn verdict_label(&self) -> &'static str {
        label(self.verdict_byte)
    }

    pub fn finding(&self, lease: &str) -> Option<&LeaseFinding> {
        self.findings.iter().find(|f| f.lease == lease)
    }

    pub fn total(&self, pick: fn(&LeaseFinding) -> usize) -> usize {
        self.findings.iter().map(pick).sum()
    }

    pub fn report(&self) -> String {
        let mut out = String::new();
        for finding in &self.findings {
            out.push_str(&finding.line());
            out.push('\n');
        }
        out.push_str(&self.summary_line());
        out.push('\n');
        out
    }

    pub fn summary_line(&self) -> String {
        format!(
            "# {} events={} leases={} uses={} receipts={} refusals={} verdict=0x{:02X} {} body-sha256={}",
            LEASE_AUDIT_SCHEMA,
            self.events,
            self.findings.len(),
            self.total(|f| f.uses),
            self.total(|f| f.receipts),
            self.total(|f| f.refusals),
            self.verdict_byte,
            self.verdict_label(),
            hex(&self.body_sha256)
        )
    }
}

fn label(byte: u8) -> &'static str {
    match byte {
        LA_K3_ALLOW => "ALLOW",
        LA_K3_UNKNOWN => "UNKNOWN",
        _ => "DENY",
    }
}

fn wire_to_byte(wire: i32) -> u8 {
    match wire {
        WIRE_ALLOW => LA_K3_ALLOW,
        WIRE_UNKNOWN => LA_K3_UNKNOWN,
        _ => LA_K3_DENY,
    }
}

fn hex(bytes: &[u8]) -> String {
    const DIGITS: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        out.push(DIGITS[(byte >> 4) as usize] as char);
        out.push(DIGITS[(byte & 0x0F) as usize] as char);
    }
    out
}

fn admit_text(input: &[u8]) -> Result<&str, &'static str> {
    if input.len() > LEASE_AUDIT_MAX_INPUT_BYTES {
        return Err(VOK_LA_INPUT_TOO_LARGE);
    }
    if input.iter().any(|b| *b == b'\r') {
        return Err(VOK_LA_INPUT_CR);
    }
    if input.iter().any(|b| !(*b == b'\n' || (0x20..=0x7E).contains(b))) {
        return Err(VOK_LA_INPUT_NOT_ASCII);
    }
    std::str::from_utf8(input).map_err(|_| VOK_LA_INPUT_NOT_ASCII)
}

fn split_lines(text: &str) -> Result<Vec<&str>, &'static str> {
    if text.is_empty() {
        return Ok(Vec::new());
    }
    let body = text.strip_suffix('\n').unwrap_or(text);
    let lines: Vec<&str> = body.split('\n').collect();
    for line in &lines {
        if line.len() > LEASE_AUDIT_MAX_LINE_BYTES {
            return Err(VOK_LA_LINE_TOO_LONG);
        }
    }
    Ok(lines)
}

struct LeaseState {
    id: String,
    epoch: Option<u64>,
    opened: bool,
    consumed: bool,
    uses: usize,
    receipts: usize,
    refusals: usize,
    wire: i32,
    code: &'static str,
}

impl LeaseState {
    fn new(id: &str) -> Self {
        Self {
            id: id.to_string(),
            epoch: None,
            opened: false,
            consumed: false,
            uses: 0,
            receipts: 0,
            refusals: 0,
            wire: WIRE_ALLOW,
            code: VOK_LA_OK,
        }
    }

    /// Strong Kleene AND the finding in; the code names whatever lowered it.
    fn finding(&mut self, wire: i32, code: &'static str) {
        let next = k3_wire_and(self.wire, wire).unwrap_or(WIRE_DENY);
        if next != self.wire {
            self.wire = next;
            self.code = code;
        }
    }

    fn check_epoch(&mut self, epoch: u64) {
        if self.epoch.is_some_and(|opened| opened != epoch) {
            self.finding(WIRE_DENY, VOK_LA_EPOCH_MISMATCH);
        }
    }
}

/// Audit a lease event log. Malformed input refuses the whole log with a
/// typed id; a well-formed log always yields a verdict.
pub fn audit_lease_log(input: &[u8]) -> Result<LeaseAuditVerdict, &'static str> {
    let text = admit_text(input)?;
    let lines = split_lines(text)?;
    if lines.len() > LEASE_AUDIT_MAX_EVENTS {
        return Err(VOK_LA_TOO_MANY_EVENTS);
    }
    let mut events = Vec::with_capacity(lines.len());
    for line in &lines {
        events.push(parse_event(line)?);
    }

    let mut leases: Vec<LeaseState> = Vec::new();
    let mut index_of: HashMap<String, usize> = HashMap::new();
    let mut pending: Option<usize> = None;

    for event in &events {
        let idx = match index_of.get(event.lease()).copied() {
            Some(idx) => idx,
            None => {
                if leases.len() == LEASE_AUDIT_MAX_LEASES {
                    return Err(VOK_LA_TOO_MANY_LEASES);
                }
                leases.push(LeaseState::new(event.lease()));
                index_of.insert(event.lease().to_string(), leases.len() - 1);
                let idx = leases.len() - 1;
                if !matches!(event, LeaseEvent::Open { .. }) {
                    leases[idx].finding(WIRE_DENY, VOK_LA_NOT_OPENED);
                }
                idx
            }
        };

        // A use must be answered by the very next event, for the same lease.
        let answers = pending == Some(idx) && event.is_outcome();
        if let Some(waiting) = pending {
            if !answers {
                leases[waiting].finding(WIRE_DENY, VOK_LA_USE_UNANSWERED);
            }
            pending = None;
        }

        let state = &mut leases[idx];
        match event {
            LeaseEvent::Open { epoch, .. } => {
                if state.opened {
                    state.finding(WIRE_DENY, VOK_LA_DUP_OPEN);
                } else {
                    state.opened = true;
                    state.epoch = Some(*epoch);
                }
            }
            LeaseEvent::Use { epoch, .. } => {
                state.check_epoch(*epoch);
                state.uses += 1;
                pending = Some(idx);
            }
            LeaseEvent::Receipt { epoch, hash, .. } => {
                if !answers {
                    state.finding(WIRE_DENY, VOK_LA_ORPHAN_OUTCOME);
                }
                state.check_epoch(*epoch);
                if hash.iter().all(|b| *b == 0) {
                    state.finding(WIRE_DENY, VOK_LA_RECEIPT_HASH_ZERO);
                }
                if state.consumed {
                    state.finding(WIRE_DENY, VOK_LA_SECOND_RECEIPT);
                }
                state.consumed = true;
                state.receipts += 1;
            }
            LeaseEvent::Refused { epoch, reason, bytes, .. } => {
                if !answers {
                    state.finding(WIRE_DENY, VOK_LA_ORPHAN_OUTCOME);
                }
                state.check_epoch(*epoch);
                if *bytes != 0 {
                    state.finding(WIRE_DENY, VOK_LA_REFUSAL_BYTES);
                }
                match (reason, state.consumed) {
                    (RefusalReason::Reuse, false) => {
                        state.finding(WIRE_DENY, VOK_LA_REUSE_BEFORE_RECEIPT)
                    }
                    (RefusalReason::Reuse, true) | (_, false) => {}
                    (_, true) => state.finding(WIRE_DENY, VOK_LA_REUSE_MISLABELED),
                }
                state.refusals += 1;
            }
        }
    }

    if let Some(waiting) = pending {
        leases[waiting].finding(WIRE_UNKNOWN, VOK_LA_TRUNCATED);
    }

    let mut fold = WIRE_ALLOW;
    for state in &leases {
        fold = k3_wire_and(fold, state.wire).unwrap_or(WIRE_DENY);
    }
    if !leases.iter().any(|state| state.uses > 0) {
        // Nothing was used, so the log proves nothing about reuse.
        fold = k3_wire_and(fold, WIRE_UNKNOWN).unwrap_or(WIRE_DENY);
    }

    let findings: Vec<LeaseFinding> = leases
        .into_iter()
        .map(|state| {
            let code = if state.uses == 0 && state.wire == WIRE_ALLOW {
                VOK_LA_UNUSED
            } else {
                state.code
            };
            LeaseFinding {
                lease: state.id,
                epoch: state.epoch,
                uses: state.uses,
                receipts: state.receipts,
                refusals: state.refusals,
                verdict_byte: wire_to_byte(state.wire),
                code,
            }
        })
        .collect();

    let mut body = String::new();
    for finding in &findings {
        body.push_str(&finding.line());
        body.push('\n');
    }
    Ok(LeaseAuditVerdict {
        events: events.len(),
        findings,
        verdict_byte: wire_to_byte(fold),
        body_sha256: sha256(body.as_bytes()),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const A: &str = "00000000000000a1";
    const B: &str = "00000000000000b2";
    const H: &str = "5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a";
    const Z: &str = "0000000000000000000000000000000000000000000000000000000000000000";

    fn log(lines: &[String]) -> Vec<u8> {
        let mut out = lines.join("\n");
        out.push('\n');
        out.into_bytes()
    }

    fn open(l: &str, e: u64) -> String {
        format!("open {l} {e}")
    }
    fn use_(l: &str, e: u64) -> String {
        format!("use {l} {e}")
    }
    fn receipt(l: &str, e: u64) -> String {
        format!("receipt {l} {e} ALLOW {H}")
    }
    fn reuse(l: &str, e: u64) -> String {
        format!("refused {l} {e} REUSE 0")
    }

    fn audit(lines: &[String]) -> LeaseAuditVerdict {
        audit_lease_log(&log(lines)).expect("well-formed synthetic log")
    }

    #[test]
    fn wire_constants_are_the_canonical_k3_bytes() {
        assert_eq!(k3_wire_and(WIRE_ALLOW, WIRE_UNKNOWN), Some(WIRE_UNKNOWN));
        assert_eq!(k3_wire_and(WIRE_DENY, WIRE_UNKNOWN), Some(WIRE_DENY), "strong Kleene: DENY is final");
        assert_eq!(k3_wire_and(WIRE_ALLOW, WIRE_ALLOW), Some(WIRE_ALLOW));
        assert_eq!((LA_K3_ALLOW, LA_K3_DENY, LA_K3_UNKNOWN), (0x01, 0xFF, 0x80));
        assert_eq!(wire_to_byte(0), LA_K3_DENY, "legacy 0 is not UNKNOWN here");
    }

    #[test]
    fn one_receipt_then_every_reuse_audited_is_allow() {
        let mut lines = vec![open(A, 7), use_(A, 7), receipt(A, 7)];
        for _ in 0..23 {
            lines.push(use_(A, 7));
            lines.push(reuse(A, 7));
        }
        let v = audit(&lines);
        let f = v.finding(A).unwrap();
        assert_eq!((f.uses, f.receipts, f.refusals, f.code), (24, 1, 23, VOK_LA_OK));
        assert_eq!(v.verdict_byte, LA_K3_ALLOW);
        assert!(v.summary_line().contains("uses=24 receipts=1 refusals=23 verdict=0x01 ALLOW"));
    }

    #[test]
    fn second_receipt_is_an_admitted_reuse_and_denies() {
        let v = audit(&[open(A, 7), use_(A, 7), receipt(A, 7), use_(A, 7), receipt(A, 7)]);
        assert_eq!(v.finding(A).unwrap().code, VOK_LA_SECOND_RECEIPT);
        assert_eq!(v.verdict_byte, LA_K3_DENY);
    }

    #[test]
    fn a_deny_receipt_still_burns_the_lease() {
        let deny = format!("receipt {A} 7 DENY {H}");
        let v = audit(&[open(A, 7), use_(A, 7), deny, use_(A, 7), receipt(A, 7)]);
        assert_eq!(v.finding(A).unwrap().code, VOK_LA_SECOND_RECEIPT);
    }

    #[test]
    fn a_reuse_with_no_audit_record_denies() {
        let v = audit(&[open(A, 7), use_(A, 7), receipt(A, 7), use_(A, 7), use_(A, 7), reuse(A, 7)]);
        assert_eq!(v.finding(A).unwrap().code, VOK_LA_USE_UNANSWERED);
        assert_eq!(v.verdict_byte, LA_K3_DENY);
        let v = audit(&[open(A, 7), open(B, 7), use_(A, 7), receipt(A, 7), use_(A, 7), use_(B, 7), receipt(B, 7)]);
        assert_eq!(v.finding(A).unwrap().code, VOK_LA_USE_UNANSWERED);
        assert_eq!(v.finding(B).unwrap().code, VOK_LA_OK);
    }

    #[test]
    fn a_log_ending_on_a_use_is_unknown_and_deny_still_wins() {
        let v = audit(&[open(A, 7), use_(A, 7), receipt(A, 7), use_(A, 7)]);
        assert_eq!((v.finding(A).unwrap().code, v.verdict_byte), (VOK_LA_TRUNCATED, LA_K3_UNKNOWN));
        let bad_b = [open(B, 3), use_(B, 3), receipt(B, 3), use_(B, 3), receipt(B, 3)];
        let mut lines: Vec<String> = bad_b.to_vec();
        lines.extend([open(A, 7), use_(A, 7)]);
        assert_eq!(audit(&lines).verdict_byte, LA_K3_DENY);
        let mut reversed = vec![open(A, 7), use_(A, 7), receipt(A, 7)];
        reversed.extend(bad_b);
        reversed.extend([use_(A, 7)]);
        let v = audit(&reversed);
        assert_eq!(v.verdict_byte, LA_K3_DENY, "order must not matter");
        assert_eq!(v.finding(A).unwrap().code, VOK_LA_TRUNCATED);
    }

    #[test]
    fn a_refusal_that_carries_bytes_denies() {
        let leak = format!("refused {A} 7 REUSE 32");
        let v = audit(&[open(A, 7), use_(A, 7), receipt(A, 7), use_(A, 7), leak]);
        assert_eq!(v.finding(A).unwrap().code, VOK_LA_REFUSAL_BYTES);
        let one = format!("refused {A} 7 EXPIRED 1");
        assert_eq!(audit(&[open(A, 7), use_(A, 7), one]).verdict_byte, LA_K3_DENY);
    }

    #[test]
    fn refusal_reasons_must_tell_the_truth_about_consumption() {
        let v = audit(&[open(A, 7), use_(A, 7), reuse(A, 7)]);
        assert_eq!(v.finding(A).unwrap().code, VOK_LA_REUSE_BEFORE_RECEIPT);
        let expired = format!("refused {A} 7 EXPIRED 0");
        let v = audit(&[open(A, 7), use_(A, 7), receipt(A, 7), use_(A, 7), expired]);
        assert_eq!(v.finding(A).unwrap().code, VOK_LA_REUSE_MISLABELED);
        // A pre-entry refusal does not burn the lease (MEM-R10 reference rule).
        let pre = format!("refused {A} 7 PRE_ENTRY 0");
        let v = audit(&[open(A, 7), use_(A, 7), pre, use_(A, 7), receipt(A, 7), use_(A, 7), reuse(A, 7)]);
        let f = v.finding(A).unwrap();
        assert_eq!((f.code, f.receipts, f.refusals, v.verdict_byte), (VOK_LA_OK, 1, 2, LA_K3_ALLOW));
    }

    #[test]
    fn outcomes_without_their_use_are_orphans() {
        let v = audit(&[open(A, 7), receipt(A, 7)]);
        assert_eq!(v.finding(A).unwrap().code, VOK_LA_ORPHAN_OUTCOME);
        let v = audit(&[open(A, 7), open(B, 7), use_(A, 7), receipt(B, 7), receipt(A, 7)]);
        assert_eq!(v.finding(A).unwrap().code, VOK_LA_USE_UNANSWERED);
        assert_eq!(v.finding(B).unwrap().code, VOK_LA_ORPHAN_OUTCOME);
        assert_eq!(v.verdict_byte, LA_K3_DENY);
    }

    #[test]
    fn open_rules_and_epoch_binding() {
        let v = audit(&[use_(A, 7), receipt(A, 7), open(A, 7)]);
        assert_eq!(v.finding(A).unwrap().code, VOK_LA_NOT_OPENED);
        let v = audit(&[open(A, 7), open(A, 7), use_(A, 7), receipt(A, 7)]);
        assert_eq!(v.finding(A).unwrap().code, VOK_LA_DUP_OPEN);
        let v = audit(&[open(A, 7), use_(A, 8), receipt(A, 8)]);
        assert_eq!(v.finding(A).unwrap().code, VOK_LA_EPOCH_MISMATCH);
        let v = audit(&[open(A, 7), use_(A, 7), receipt(A, 7), use_(A, 7), reuse(A, 9)]);
        assert_eq!(v.finding(A).unwrap().code, VOK_LA_EPOCH_MISMATCH);
        assert_eq!(v.finding(A).unwrap().epoch, Some(7));
    }

    #[test]
    fn an_all_zero_receipt_hash_denies() {
        let zero = format!("receipt {A} 7 ALLOW {Z}");
        let v = audit(&[open(A, 7), use_(A, 7), zero]);
        assert_eq!(v.finding(A).unwrap().code, VOK_LA_RECEIPT_HASH_ZERO);
    }

    #[test]
    fn empty_or_never_used_logs_are_unknown_never_allow() {
        let v = audit_lease_log(b"").unwrap();
        assert_eq!((v.findings.len(), v.verdict_byte), (0, LA_K3_UNKNOWN));
        assert!(v.summary_line().contains("verdict=0x80 UNKNOWN"));
        let v = audit(&[open(A, 7), open(B, 7)]);
        assert_eq!(v.finding(A).unwrap().code, VOK_LA_UNUSED);
        assert_eq!(v.finding(A).unwrap().verdict_byte, LA_K3_ALLOW);
        assert_eq!(v.verdict_byte, LA_K3_UNKNOWN);
        let v = audit(&[open(A, 7), open(A, 7)]);
        assert_eq!(v.verdict_byte, LA_K3_DENY, "unused but DENY stays DENY");
        let v = audit(&[open(A, 7), open(B, 7), use_(A, 7), receipt(A, 7)]);
        assert_eq!(v.verdict_byte, LA_K3_ALLOW, "an unused lease beside a clean used one is fine");
    }

    #[test]
    fn nonpositive_clock_values_refuse_the_whole_log() {
        for bad in ["0", "-1", "-0", "-9223372036854775808"] {
            let text = format!("open {A} {bad}\n");
            assert_eq!(audit_lease_log(text.as_bytes()), Err(VOK_LA_EPOCH_NONPOSITIVE), "epoch {bad}");
        }
        let text = format!("open {A} 7\nuse {A} 0\n");
        assert_eq!(audit_lease_log(text.as_bytes()), Err(VOK_LA_EPOCH_NONPOSITIVE));
        for bad in ["07", "+7", "7a", "9223372036854775808", "18446744073709551616"] {
            let text = format!("open {A} {bad}\n");
            assert_eq!(audit_lease_log(text.as_bytes()), Err(VOK_LA_FIELD), "epoch {bad}");
        }
        let max = format!("open {A} 9223372036854775807\n");
        assert!(audit_lease_log(max.as_bytes()).is_ok());
    }

    #[test]
    fn line_and_field_shape_is_closed() {
        let ok = format!("open {A} 7\n");
        assert!(audit_lease_log(ok.as_bytes()).is_ok());
        assert_eq!(audit_lease_log(format!("open {A} 7\r\n").as_bytes()), Err(VOK_LA_INPUT_CR));
        assert_eq!(audit_lease_log(format!("open\t{A} 7\n").as_bytes()), Err(VOK_LA_INPUT_NOT_ASCII));
        assert_eq!(audit_lease_log(format!("open {A} 7 \u{e9}\n").as_bytes()), Err(VOK_LA_INPUT_NOT_ASCII));
        for bad in [
            format!("open {A} 7\n\n"),
            "\n".to_string(),
            format!(" open {A} 7\n"),
            format!("open {A} 7 \n"),
            format!("open  {A} 7\n"),
            format!("OPEN {A} 7\n"),
            format!("open {A}\n"),
            format!("open {A} 7 extra\n"),
            format!("grant {A} 7\n"),
            format!("receipt {A} 7 ALLOW\n"),
            format!("refused {A} 7 REUSE 0 note\n"),
        ] {
            assert_eq!(audit_lease_log(bad.as_bytes()), Err(VOK_LA_LINE_MALFORMED), "{bad:?}");
        }
        for bad in [
            "open 00000000000000A1 7\n".to_string(),
            "open 0000000000000a1 7\n".to_string(),
            "open 000000000000000a1 7\n".to_string(),
            "open 00000000000000g1 7\n".to_string(),
            format!("receipt {A} 7 allow {H}\n"),
            format!("receipt {A} 7 UNKNOWN {H}\n"),
            format!("receipt {A} 7 ALLOW {}\n", &H[..63]),
            format!("receipt {A} 7 ALLOW {}\n", H.to_uppercase()),
            format!("refused {A} 7 reuse 0\n"),
            format!("refused {A} 7 LOST 0\n"),
            format!("refused {A} 7 REUSE 00\n"),
            format!("refused {A} 7 REUSE -1\n"),
            format!("refused {A} 7 REUSE 4294967296\n"),
        ] {
            assert_eq!(audit_lease_log(bad.as_bytes()), Err(VOK_LA_FIELD), "{bad:?}");
        }
        let long = format!("open {A} 7{}\n", "1".repeat(LEASE_AUDIT_MAX_LINE_BYTES));
        assert_eq!(audit_lease_log(long.as_bytes()), Err(VOK_LA_LINE_TOO_LONG));
    }

    #[test]
    fn event_lease_and_byte_caps_hold() {
        let mut lines = vec![open(A, 7), open(B, 7), use_(A, 7), receipt(A, 7)];
        while lines.len() < LEASE_AUDIT_MAX_EVENTS {
            lines.push(use_(A, 7));
            lines.push(reuse(A, 7));
        }
        assert_eq!(lines.len(), LEASE_AUDIT_MAX_EVENTS);
        let v = audit(&lines);
        assert_eq!((v.events, v.verdict_byte), (LEASE_AUDIT_MAX_EVENTS, LA_K3_ALLOW));
        lines.push(open(B, 7));
        assert_eq!(audit_lease_log(&log(&lines)), Err(VOK_LA_TOO_MANY_EVENTS));

        let opens: Vec<String> = (0..LEASE_AUDIT_MAX_LEASES).map(|i| open(&format!("{i:016x}"), 1)).collect();
        assert_eq!(audit(&opens).findings.len(), LEASE_AUDIT_MAX_LEASES);
        let mut over = opens.clone();
        over.push(open(&format!("{:016x}", LEASE_AUDIT_MAX_LEASES), 1));
        assert_eq!(audit_lease_log(&log(&over)), Err(VOK_LA_TOO_MANY_LEASES));

        let huge = vec![b'a'; LEASE_AUDIT_MAX_INPUT_BYTES + 1];
        assert_eq!(audit_lease_log(&huge), Err(VOK_LA_INPUT_TOO_LARGE));
    }

    #[test]
    fn digest_covers_the_finding_lines() {
        let a = audit(&[open(A, 7), use_(A, 7), receipt(A, 7)]);
        let b = audit(&[open(A, 7), use_(A, 7), receipt(A, 7), use_(A, 7), reuse(A, 7)]);
        assert_ne!(a.body_sha256, b.body_sha256);
        let line = format!("lease {A} epoch=7 uses=1 receipts=1 refusals=0 | ALLOW VOK_LA_OK\n");
        assert_eq!(a.body_sha256, sha256(line.as_bytes()));
        let no_lf = format!("open {A} 7\nuse {A} 7\nreceipt {A} 7 ALLOW {H}");
        assert_eq!(audit_lease_log(no_lf.as_bytes()).unwrap().body_sha256, a.body_sha256);
        assert!(a.report().ends_with(&format!("body-sha256={}\n", hex(&a.body_sha256))));
        assert!(a.report().starts_with(&line));
    }

    #[test]
    fn findings_keep_first_seen_order() {
        let v = audit(&[open(B, 7), open(A, 7), use_(A, 7), receipt(A, 7)]);
        let order: Vec<&str> = v.findings.iter().map(|f| f.lease.as_str()).collect();
        assert_eq!(order, vec![B, A]);
    }
}

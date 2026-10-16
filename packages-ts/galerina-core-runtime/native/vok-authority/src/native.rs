use std::fmt;

mod platform;

pub(crate) const OBJECT_BYTES: usize = 16;
const OBJECT_MAGIC: [u8; 4] = *b"GVEO";

pub(crate) fn is_native_floor_object(bytes: &[u8]) -> bool {
    bytes.len() == OBJECT_BYTES && bytes.starts_with(&OBJECT_MAGIC)
}
const OBJECT_VERSION: u8 = 1;
const RETURN_U64_PROFILE: u8 = 1;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u8)]
pub(crate) enum NativeTarget {
    X86_64 = 1,
    Aarch64 = 2,
}

impl NativeTarget {
    fn parse(value: u8) -> Result<Self, NativeFailure> {
        match value {
            1 => Ok(Self::X86_64),
            2 => Ok(Self::Aarch64),
            _ => Err(NativeFailure::new("VOK_NATIVE_OBJECT_TARGET")),
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct NativeFailure {
    failure_id: &'static str,
}

impl NativeFailure {
    pub(crate) const fn new(failure_id: &'static str) -> Self {
        Self { failure_id }
    }

    #[must_use]
    pub(crate) const fn failure_id(&self) -> &'static str {
        self.failure_id
    }
}

impl fmt::Display for NativeFailure {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.failure_id)
    }
}

impl std::error::Error for NativeFailure {}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct VerifiedObject {
    target: NativeTarget,
    value: u64,
}

impl VerifiedObject {
    #[must_use]
    #[cfg(test)]
    pub(crate) const fn target(&self) -> NativeTarget {
        self.target
    }

    #[must_use]
    #[cfg(test)]
    pub(crate) const fn value(&self) -> u64 {
        self.value
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) struct ExecutionEvidence {
    value: u64,
    target: NativeTarget,
    executable_at_call: bool,
    writable_at_call: bool,
}

impl ExecutionEvidence {
    #[must_use]
    pub(crate) const fn value(&self) -> u64 {
        self.value
    }

    #[must_use]
    #[cfg(test)]
    pub(crate) const fn target(&self) -> NativeTarget {
        self.target
    }

    #[must_use]
    pub(crate) const fn executable_at_call(&self) -> bool {
        self.executable_at_call
    }

    #[must_use]
    pub(crate) const fn writable_at_call(&self) -> bool {
        self.writable_at_call
    }

    #[must_use]
    #[cfg(test)]
    pub(crate) const fn authority_released(&self) -> bool {
        false
    }
}

#[must_use]
pub(crate) const fn current_target() -> Option<NativeTarget> {
    #[cfg(target_arch = "x86_64")]
    {
        return Some(NativeTarget::X86_64);
    }
    #[cfg(target_arch = "aarch64")]
    {
        return Some(NativeTarget::Aarch64);
    }
    #[allow(unreachable_code)]
    None
}

#[must_use]
pub(crate) fn encode_return_u64_object(value: u64, target: NativeTarget) -> [u8; OBJECT_BYTES] {
    let mut bytes = [0_u8; OBJECT_BYTES];
    bytes[..4].copy_from_slice(&OBJECT_MAGIC);
    bytes[4] = OBJECT_VERSION;
    bytes[5] = RETURN_U64_PROFILE;
    bytes[6] = target as u8;
    bytes[8..].copy_from_slice(&value.to_le_bytes());
    bytes
}

fn validate_object(bytes: &[u8]) -> Result<VerifiedObject, NativeFailure> {
    if bytes.len() != OBJECT_BYTES {
        return Err(NativeFailure::new("VOK_NATIVE_OBJECT_LENGTH"));
    }
    if bytes[..4] != OBJECT_MAGIC {
        return Err(NativeFailure::new("VOK_NATIVE_OBJECT_MAGIC"));
    }
    if bytes[4] != OBJECT_VERSION {
        return Err(NativeFailure::new("VOK_NATIVE_OBJECT_VERSION"));
    }
    if bytes[5] != RETURN_U64_PROFILE {
        return Err(NativeFailure::new("VOK_NATIVE_OBJECT_PROFILE"));
    }
    let target = NativeTarget::parse(bytes[6])?;
    if bytes[7] != 0 {
        return Err(NativeFailure::new("VOK_NATIVE_OBJECT_FLAGS"));
    }
    let value = u64::from_le_bytes(
        bytes[8..]
            .try_into()
            .map_err(|_| NativeFailure::new("VOK_NATIVE_OBJECT_LENGTH"))?,
    );
    Ok(VerifiedObject { target, value })
}

pub(crate) fn execute(bytes: &[u8]) -> Result<ExecutionEvidence, NativeFailure> {
    let object = validate_object(bytes)?;
    let target =
        current_target().ok_or_else(|| NativeFailure::new("VOK_NATIVE_TARGET_UNSUPPORTED"))?;
    if object.target != target {
        return Err(NativeFailure::new("VOK_NATIVE_TARGET_MISMATCH"));
    }

    let image = emit_return_u64(object);
    let platform_evidence = platform::execute(&image)?;
    if platform_evidence.value != object.value {
        return Err(NativeFailure::new("VOK_NATIVE_RESULT_MISMATCH"));
    }
    if !platform_evidence.executable_at_call || platform_evidence.writable_at_call {
        return Err(NativeFailure::new("VOK_NATIVE_WX_QUERY_REFUSED"));
    }

    Ok(ExecutionEvidence {
        value: platform_evidence.value,
        target,
        executable_at_call: platform_evidence.executable_at_call,
        writable_at_call: platform_evidence.writable_at_call,
    })
}

pub(crate) fn os_random_16() -> Result<[u8; 16], NativeFailure> {
    let bytes = platform::os_random_16()?;
    if bytes == [0; 16] {
        return Err(NativeFailure::new("VOK_NATIVE_ENTROPY_ZERO"));
    }
    Ok(bytes)
}

fn emit_return_u64(object: VerifiedObject) -> Vec<u8> {
    match object.target {
        NativeTarget::X86_64 => {
            let mut image = Vec::with_capacity(11);
            image.extend_from_slice(&[0x48, 0xb8]);
            image.extend_from_slice(&object.value.to_le_bytes());
            image.push(0xc3);
            image
        }
        NativeTarget::Aarch64 => {
            let mut image = Vec::with_capacity(20);
            for halfword in 0..4_u32 {
                let immediate = ((object.value >> (halfword * 16)) & 0xffff) as u32;
                let base = if halfword == 0 {
                    0xd280_0000
                } else {
                    0xf280_0000
                };
                let instruction = base | (halfword << 21) | (immediate << 5);
                image.extend_from_slice(&instruction.to_le_bytes());
            }
            image.extend_from_slice(&0xd65f_03c0_u32.to_le_bytes());
            image
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fixed_emitters_have_exact_encodings() {
        assert_eq!(
            emit_return_u64(VerifiedObject {
                target: NativeTarget::X86_64,
                value: 0x0123_4567_89ab_cdef,
            }),
            [0x48, 0xb8, 0xef, 0xcd, 0xab, 0x89, 0x67, 0x45, 0x23, 0x01, 0xc3,]
        );
        assert_eq!(
            emit_return_u64(VerifiedObject {
                target: NativeTarget::Aarch64,
                value: 0,
            }),
            [
                0x00, 0x00, 0x80, 0xd2, 0x00, 0x00, 0xa0, 0xf2, 0x00, 0x00, 0xc0, 0xf2, 0x00, 0x00,
                0xe0, 0xf2, 0xc0, 0x03, 0x5f, 0xd6,
            ]
        );
    }

    #[test]
    fn exact_closed_object_round_trips() {
        let Some(target) = current_target() else {
            return;
        };
        let bytes = encode_return_u64_object(0x0123_4567_89ab_cdef, target);
        assert_eq!(bytes.len(), OBJECT_BYTES);
        let object = validate_object(&bytes).expect("canonical object must validate");
        assert_eq!(object.value(), 0x0123_4567_89ab_cdef);
        assert_eq!(object.target(), target);
    }

    #[test]
    fn every_closed_field_and_exact_length_are_enforced() {
        let Some(target) = current_target() else {
            return;
        };
        let canonical = encode_return_u64_object(7, target);
        for length in [0, 1, OBJECT_BYTES - 1, OBJECT_BYTES + 1] {
            let mut candidate = canonical.to_vec();
            candidate.resize(length, 0);
            let error = validate_object(&candidate).expect_err("non-exact length must refuse");
            assert_eq!(error.failure_id(), "VOK_NATIVE_OBJECT_LENGTH");
        }
        for (offset, expected) in [
            (0, "VOK_NATIVE_OBJECT_MAGIC"),
            (4, "VOK_NATIVE_OBJECT_VERSION"),
            (5, "VOK_NATIVE_OBJECT_PROFILE"),
            (6, "VOK_NATIVE_OBJECT_TARGET"),
            (7, "VOK_NATIVE_OBJECT_FLAGS"),
        ] {
            let mut candidate = canonical;
            candidate[offset] ^= 0x80;
            let error = validate_object(&candidate).expect_err("mutated closed field must refuse");
            assert_eq!(error.failure_id(), expected);
        }
    }

    #[test]
    fn target_mismatch_refuses_before_execution() {
        let Some(target) = current_target() else {
            return;
        };
        let other = match target {
            NativeTarget::X86_64 => NativeTarget::Aarch64,
            NativeTarget::Aarch64 => NativeTarget::X86_64,
        };
        let error = execute(&encode_return_u64_object(9, other))
            .expect_err("object for another architecture must refuse");
        assert_eq!(error.failure_id(), "VOK_NATIVE_TARGET_MISMATCH");
    }

    #[test]
    fn valid_object_executes_from_non_writable_executable_memory_once() {
        let Some(target) = current_target() else {
            return;
        };
        let evidence = execute(&encode_return_u64_object(0xfedc_ba98_7654_3210, target))
            .expect("bounded object must execute");
        assert_eq!(evidence.value(), 0xfedc_ba98_7654_3210);
        assert_eq!(evidence.target(), target);
        assert!(evidence.executable_at_call());
        assert!(!evidence.writable_at_call());
        assert!(!evidence.authority_released());
    }

    #[test]
    fn operating_system_entropy_is_nonzero_and_not_repeated() {
        let first = os_random_16().expect("OS CSPRNG must be available on a supported host");
        let second = os_random_16().expect("OS CSPRNG must remain available");
        assert_ne!(first, [0; 16]);
        assert_ne!(second, [0; 16]);
        assert_ne!(first, second);
    }
}

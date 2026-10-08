//! Hostile-memory isolation/integrity claims and erasure policy.
//!
//! Logical clear + unmap is the implemented bound. Physical media erasure is
//! unprovable from this userspace floor and refuses as UNKNOWN.

use crate::{Trit, VokFailure};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum MemoryErasureClass {
    LogicalClearUnmap,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum IsolationClaim {
    ForgedHandle,
    CrossTableHandle,
    ResourceAsMachineCode,
    WritableAndExecutable,
    LogicalWipeVerified,
    PhysicalMediaWipe,
}

/// Physical erasure of DRAM/storage is not a userspace proof. The floor never
/// upgrades a logical wipe into a media-wipe receipt.
pub fn claim_physical_erasure() -> Result<MemoryErasureClass, VokFailure> {
    Err(VokFailure::new(
        Trit::Unknown,
        "VOK_MEMORY_PHYSICAL_ERASURE_UNPROVEN",
    ))
}

/// Closed isolation/integrity policy. Hostile claims refuse; only a verified
/// logical wipe is admitted as the implemented erasure class.
pub fn admit_isolation_claim(claim: IsolationClaim) -> Result<MemoryErasureClass, VokFailure> {
    match claim {
        IsolationClaim::LogicalWipeVerified => Ok(MemoryErasureClass::LogicalClearUnmap),
        IsolationClaim::PhysicalMediaWipe => claim_physical_erasure(),
        IsolationClaim::ForgedHandle => Err(VokFailure::new(
            Trit::Refuse,
            "VOK_RESOURCE_HANDLE_MISMATCH",
        )),
        IsolationClaim::CrossTableHandle => Err(VokFailure::new(
            Trit::Refuse,
            "VOK_RESOURCE_HANDLE_MISMATCH",
        )),
        IsolationClaim::ResourceAsMachineCode => {
            Err(VokFailure::new(Trit::Refuse, "VOK_RESOURCE_NOT_CODE"))
        }
        IsolationClaim::WritableAndExecutable => {
            Err(VokFailure::new(Trit::Refuse, "VOK_NATIVE_WX_QUERY_REFUSED"))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn physical_erasure_stays_unproven() {
        let error = claim_physical_erasure().expect_err("userspace cannot prove media wipe");
        assert_eq!(error.outcome(), Trit::Unknown);
        assert_eq!(error.failure_id(), "VOK_MEMORY_PHYSICAL_ERASURE_UNPROVEN");
        let error = admit_isolation_claim(IsolationClaim::PhysicalMediaWipe)
            .expect_err("physical claim is the same unknown");
        assert_eq!(error.failure_id(), "VOK_MEMORY_PHYSICAL_ERASURE_UNPROVEN");
    }

    #[test]
    fn hostile_isolation_claims_refuse_and_logical_wipe_admits() {
        assert_eq!(
            admit_isolation_claim(IsolationClaim::LogicalWipeVerified)
                .expect("logical wipe is the implemented class"),
            MemoryErasureClass::LogicalClearUnmap
        );
        assert_eq!(
            admit_isolation_claim(IsolationClaim::ForgedHandle)
                .expect_err("forged")
                .failure_id(),
            "VOK_RESOURCE_HANDLE_MISMATCH"
        );
        assert_eq!(
            admit_isolation_claim(IsolationClaim::ResourceAsMachineCode)
                .expect_err("not code")
                .failure_id(),
            "VOK_RESOURCE_NOT_CODE"
        );
        assert_eq!(
            admit_isolation_claim(IsolationClaim::WritableAndExecutable)
                .expect_err("wx")
                .failure_id(),
            "VOK_NATIVE_WX_QUERY_REFUSED"
        );
    }
}

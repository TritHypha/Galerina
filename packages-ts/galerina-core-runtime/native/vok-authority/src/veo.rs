//! First RD-0656 VEO identity envelope around the bounded return-u64 floor.
//!
//! The general object/linker (imports, relocations, constructors, paths, GIR
//! lowering) is refused. Completing that profile is a separate HOLD.

use crate::native::{self, OBJECT_BYTES};
use crate::sha256::domain_separated;
use crate::{Trit, VokFailure};

pub const VEO_ACTION_DOMAIN: &[u8] = b"galerina.veo.action.v1\0";
pub const VEO_OBJECT_DOMAIN: &[u8] = b"galerina.veo.object.v1\0";
pub const VEO_SCHEMA_VERSION: u8 = 1;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u8)]
pub enum VeoProfile {
    ReturnU64 = 1,
}

impl TryFrom<u8> for VeoProfile {
    type Error = VokFailure;

    fn try_from(value: u8) -> Result<Self, Self::Error> {
        match value {
            1 => Ok(Self::ReturnU64),
            _ => Err(VokFailure::new(
                Trit::Unknown,
                "VOK_VEO_PROFILE_UNSUPPORTED",
            )),
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VeoActionIdentity {
    gir_digest: [u8; 32],
    compiler_identity: [u8; 32],
    slide_identity: [u8; 32],
    target_contract: [u8; 32],
    dependency_root: [u8; 32],
    package_manifest_root: [u8; 32],
    declared_effects: [u8; 32],
    capability_world: [u8; 32],
    policy_epoch: u64,
    revocation_epoch: u64,
    crypto_suite: [u8; 32],
    build_mode: [u8; 32],
}

impl VeoActionIdentity {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        gir_digest: [u8; 32],
        compiler_identity: [u8; 32],
        slide_identity: [u8; 32],
        target_contract: [u8; 32],
        dependency_root: [u8; 32],
        package_manifest_root: [u8; 32],
        declared_effects: [u8; 32],
        capability_world: [u8; 32],
        policy_epoch: u64,
        revocation_epoch: u64,
        crypto_suite: [u8; 32],
        build_mode: [u8; 32],
    ) -> Result<Self, VokFailure> {
        let identity = Self {
            gir_digest,
            compiler_identity,
            slide_identity,
            target_contract,
            dependency_root,
            package_manifest_root,
            declared_effects,
            capability_world,
            policy_epoch,
            revocation_epoch,
            crypto_suite,
            build_mode,
        };
        identity.check_complete()?;
        Ok(identity)
    }

    fn check_complete(&self) -> Result<(), VokFailure> {
        let fields = [
            &self.gir_digest,
            &self.compiler_identity,
            &self.slide_identity,
            &self.target_contract,
            &self.dependency_root,
            &self.package_manifest_root,
            &self.declared_effects,
            &self.capability_world,
            &self.crypto_suite,
            &self.build_mode,
        ];
        if fields.iter().any(|field| **field == [0; 32]) {
            return Err(VokFailure::new(Trit::Refuse, "VOK_VEO_IDENTITY_INCOMPLETE"));
        }
        Ok(())
    }

    fn canonical_bytes(&self, profile: VeoProfile) -> Vec<u8> {
        let mut bytes = Vec::with_capacity(338);
        bytes.push(VEO_SCHEMA_VERSION);
        bytes.push(profile as u8);
        bytes.extend_from_slice(&self.gir_digest);
        bytes.extend_from_slice(&self.compiler_identity);
        bytes.extend_from_slice(&self.slide_identity);
        bytes.extend_from_slice(&self.target_contract);
        bytes.extend_from_slice(&self.dependency_root);
        bytes.extend_from_slice(&self.package_manifest_root);
        bytes.extend_from_slice(&self.declared_effects);
        bytes.extend_from_slice(&self.capability_world);
        bytes.extend_from_slice(&self.policy_epoch.to_le_bytes());
        bytes.extend_from_slice(&self.revocation_epoch.to_le_bytes());
        bytes.extend_from_slice(&self.crypto_suite);
        bytes.extend_from_slice(&self.build_mode);
        bytes
    }
}

pub struct VeoAdmissionRequest {
    profile: VeoProfile,
    identity: VeoActionIdentity,
    object_bytes: Vec<u8>,
    import_count: u16,
    reloc_count: u16,
    constructor_count: u16,
    path_present: bool,
}

impl Drop for VeoAdmissionRequest {
    fn drop(&mut self) {
        self.object_bytes.fill(0);
        self.object_bytes.clear();
    }
}

impl VeoAdmissionRequest {
    pub fn return_u64(
        identity: VeoActionIdentity,
        object_bytes: Vec<u8>,
        import_count: u16,
        reloc_count: u16,
        constructor_count: u16,
        path_present: bool,
    ) -> Self {
        Self {
            profile: VeoProfile::ReturnU64,
            identity,
            object_bytes,
            import_count,
            reloc_count,
            constructor_count,
            path_present,
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AdmittedVeoObject {
    action_id: [u8; 32],
    object_id: [u8; 32],
    profile: VeoProfile,
    return_value: u64,
}

impl AdmittedVeoObject {
    #[must_use]
    pub const fn action_id(&self) -> &[u8; 32] {
        &self.action_id
    }

    #[must_use]
    pub const fn object_id(&self) -> &[u8; 32] {
        &self.object_id
    }

    #[must_use]
    pub const fn profile(&self) -> VeoProfile {
        self.profile
    }

    #[must_use]
    pub const fn return_value(&self) -> u64 {
        self.return_value
    }
}

/// Admit the bounded return-u64 VEO profile. General linker features refuse.
pub fn admit_veo_object(request: VeoAdmissionRequest) -> Result<AdmittedVeoObject, VokFailure> {
    if request.import_count != 0 {
        return Err(VokFailure::new(Trit::Refuse, "VOK_VEO_IMPORT_REFUSED"));
    }
    if request.reloc_count != 0 {
        return Err(VokFailure::new(Trit::Refuse, "VOK_VEO_RELOC_REFUSED"));
    }
    if request.constructor_count != 0 {
        return Err(VokFailure::new(Trit::Refuse, "VOK_VEO_CONSTRUCTOR_REFUSED"));
    }
    if request.path_present {
        return Err(VokFailure::new(Trit::Refuse, "VOK_VEO_PATH_REFUSED"));
    }
    let _profile = VeoProfile::try_from(request.profile as u8)?;
    if request.object_bytes.len() != OBJECT_BYTES {
        return Err(VokFailure::new(Trit::Refuse, "VOK_NATIVE_OBJECT_LENGTH"));
    }
    let Some(target) = native::current_target() else {
        return Err(VokFailure::new(
            Trit::Refuse,
            "VOK_NATIVE_TARGET_UNSUPPORTED",
        ));
    };
    let expected = native::encode_return_u64_object(
        u64::from_le_bytes(
            request.object_bytes[8..]
                .try_into()
                .map_err(|_| VokFailure::new(Trit::Refuse, "VOK_NATIVE_OBJECT_LENGTH"))?,
        ),
        target,
    );
    // Re-validate through the private closed parser by executing encode of the
    // declared value and requiring exact object equality, then refuse if the
    // stored header is not the canonical GVEO return-u64 object.
    if request.object_bytes.as_slice() != expected.as_slice() {
        // Still allow a well-formed object for the current target that the
        // encoder would emit; otherwise this is not the bounded profile.
        return Err(VokFailure::new(Trit::Refuse, "VOK_VEO_OBJECT_REFUSED"));
    }
    let return_value = u64::from_le_bytes(
        request.object_bytes[8..]
            .try_into()
            .map_err(|_| VokFailure::new(Trit::Refuse, "VOK_NATIVE_OBJECT_LENGTH"))?,
    );
    request.identity.check_complete()?;
    let canonical = request.identity.canonical_bytes(request.profile);
    let action_id = domain_separated(VEO_ACTION_DOMAIN, &canonical);
    let object_id = domain_separated(VEO_OBJECT_DOMAIN, &request.object_bytes);
    Ok(AdmittedVeoObject {
        action_id,
        object_id,
        profile: request.profile,
        return_value,
    })
}

/// General RD-0656 linker. Always refuses until GIR lowering and the full
/// object/linker profile exist.
pub fn admit_general_veo_linker() -> Result<AdmittedVeoObject, VokFailure> {
    Err(VokFailure::new(
        Trit::Unknown,
        "VOK_VEO_GENERAL_LINKER_UNAVAILABLE",
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::native::{self, OBJECT_BYTES};

    fn identity() -> VeoActionIdentity {
        VeoActionIdentity::new(
            [1; 32], [2; 32], [3; 32], [4; 32], [5; 32], [6; 32], [7; 32], [8; 32], 1, 1, [9; 32],
            [10; 32],
        )
        .expect("complete identity")
    }

    fn canonical_object(value: u64) -> Vec<u8> {
        let target = native::current_target().expect("supported test architecture");
        native::encode_return_u64_object(value, target).to_vec()
    }

    #[test]
    fn return_u64_profile_admits_closed_object() {
        let object = canonical_object(42);
        let admitted = admit_veo_object(VeoAdmissionRequest::return_u64(
            identity(),
            object,
            0,
            0,
            0,
            false,
        ))
        .expect("bounded VEO must admit");
        assert_eq!(admitted.return_value(), 42);
        assert_eq!(admitted.profile(), VeoProfile::ReturnU64);
        assert_ne!(admitted.action_id(), &[0; 32]);
        assert_ne!(admitted.object_id(), &[0; 32]);
    }

    #[test]
    fn linker_features_and_incomplete_identity_refuse() {
        let object = canonical_object(1);
        for (imports, relocs, ctors, path, expected) in [
            (1, 0, 0, false, "VOK_VEO_IMPORT_REFUSED"),
            (0, 1, 0, false, "VOK_VEO_RELOC_REFUSED"),
            (0, 0, 1, false, "VOK_VEO_CONSTRUCTOR_REFUSED"),
            (0, 0, 0, true, "VOK_VEO_PATH_REFUSED"),
        ] {
            let error = admit_veo_object(VeoAdmissionRequest::return_u64(
                identity(),
                object.clone(),
                imports,
                relocs,
                ctors,
                path,
            ))
            .expect_err("general linker feature must refuse");
            assert_eq!(error.failure_id(), expected);
        }
        let error = VeoActionIdentity::new(
            [0; 32], [2; 32], [3; 32], [4; 32], [5; 32], [6; 32], [7; 32], [8; 32], 1, 1, [9; 32],
            [10; 32],
        )
        .expect_err("zero gir digest is omitted identity");
        assert_eq!(error.failure_id(), "VOK_VEO_IDENTITY_INCOMPLETE");
        let mut malformed = canonical_object(9);
        malformed[0] ^= 0xff;
        let error = admit_veo_object(VeoAdmissionRequest::return_u64(
            identity(),
            malformed,
            0,
            0,
            0,
            false,
        ))
        .expect_err("non-GVEO bytes must refuse");
        assert_eq!(error.failure_id(), "VOK_VEO_OBJECT_REFUSED");
        let _ = OBJECT_BYTES;
    }

    #[test]
    fn general_linker_is_unavailable() {
        let error = admit_general_veo_linker().expect_err("general linker remains HOLD");
        assert_eq!(error.outcome(), Trit::Unknown);
        assert_eq!(error.failure_id(), "VOK_VEO_GENERAL_LINKER_UNAVAILABLE");
    }

    #[test]
    fn unsupported_profile_refuses() {
        let error = VeoProfile::try_from(2).expect_err("profile 2 is the general linker");
        assert_eq!(error.failure_id(), "VOK_VEO_PROFILE_UNSUPPORTED");
    }
}

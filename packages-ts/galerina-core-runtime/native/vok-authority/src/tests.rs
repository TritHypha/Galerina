use super::*;
use std::collections::VecDeque;

pub(crate) struct SequenceNonce {
    values: VecDeque<Result<[u8; 16], NonceFailure>>,
}

impl SequenceNonce {
    fn from_nonces(values: impl IntoIterator<Item = [u8; 16]>) -> Self {
        Self {
            values: values.into_iter().map(Ok).collect(),
        }
    }

    fn refusing(failure_id: &'static str) -> Self {
        Self {
            values: VecDeque::from([Err(NonceFailure::new(failure_id))]),
        }
    }
}

impl NonceSource for SequenceNonce {
    fn next_nonce(&mut self) -> Result<[u8; 16], NonceFailure> {
        self.values
            .pop_front()
            .unwrap_or_else(|| Err(NonceFailure::new("VOK_TEST_NONCE_EXHAUSTED")))
    }
}

pub(crate) fn context(seed: u8, policy_epoch: u64, revocation_epoch: u64) -> AuthorityContext {
    AuthorityContext::new(
        [seed; 32],
        [seed.wrapping_add(1); 32],
        [seed.wrapping_add(2); 32],
        policy_epoch,
        revocation_epoch,
    )
}

fn mint_request(gates: [Trit; 8], bytes: Vec<u8>) -> MintRequest {
    MintRequest::new(
        AuthorityTag::parse("slide.vok.execute.v1").expect("canonical test tag"),
        context(7, 3, 5),
        gates,
        bytes,
    )
}

pub(crate) fn return_u64_request(value: u64) -> MintRequest {
    MintRequest::new_return_u64(
        AuthorityTag::parse("slide.vok.execute.v1").expect("canonical test tag"),
        context(7, 3, 5),
        all_admit(),
        value,
    )
    .expect("supported test architecture")
}

pub(crate) fn all_admit() -> [Trit; 8] {
    [Trit::Admit; 8]
}

pub(crate) fn table_with_nonces(
    capacity: usize,
    nonces: impl IntoIterator<Item = [u8; 16]>,
) -> AuthorityTable<SequenceNonce> {
    AuthorityTable::new(
        capacity,
        64,
        context(7, 3, 5),
        SequenceNonce::from_nonces(nonces),
    )
    .expect("valid hostile-test table")
}

pub(crate) fn bound_native_request(value: u64) -> MintRequest {
    bound_native_request_with(all_admit(), context(7, 3, 5), value)
}

pub(crate) fn bound_native_request_with(
    gates: [Trit; 8],
    ctx: AuthorityContext,
    value: u64,
) -> MintRequest {
    MintRequest::new_return_u64(
        AuthorityTag::parse("slide.vok.execute.v1").expect("canonical test tag"),
        ctx,
        gates,
        value,
    )
    .expect("supported test architecture")
    .with_wamr_loaded_digest(
        WamrLoadedDigest::from_test_fixture(digest_d1()).expect("nonzero fixture"),
    )
    .expect("wamr loaded digest")
}

fn mint_one(table: &mut AuthorityTable<SequenceNonce>) -> AdmittedObjectHandle {
    table
        .mint_admitted(bound_native_request(7))
        .expect("valid admitted object")
}

fn duplicate_admitted(handle: &AdmittedObjectHandle) -> AdmittedObjectHandle {
    AdmittedObjectHandle {
        table_nonce: handle.table_nonce,
        slot: handle.slot,
        generation: handle.generation,
        object_nonce: handle.object_nonce,
        tag: handle.tag.clone(),
        thread_marker: Default::default(),
    }
}

fn duplicate_lease(handle: &LeaseHandle) -> LeaseHandle {
    LeaseHandle {
        table_nonce: handle.table_nonce,
        slot: handle.slot,
        generation: handle.generation,
        object_nonce: handle.object_nonce,
        tag: handle.tag.clone(),
        artifact_digest: handle.artifact_digest,
        thread_marker: Default::default(),
    }
}

#[test]
fn trit_accepts_only_the_closed_k3_domain() {
    // K3U2 lock-step (Phillip 2026-10-26 07:45 GMT, option B): canonical UNKNOWN on the wire is -128.
    assert_eq!(Trit::try_from(-1), Ok(Trit::Refuse));
    assert_eq!(Trit::try_from(-128), Ok(Trit::Unknown));
    assert_eq!(Trit::try_from(1), Ok(Trit::Admit));
    // F1 (Phillip 2026-10-26 13:40 GMT, FRAMED ONLY): a bare 0 is refused with its own id;
    // legacy 0 is UNKNOWN only through `Trit::decode_legacy_frame` (see below).
    let error = Trit::try_from(0).expect_err("bare 0 must refuse");
    assert_eq!(error.outcome(), Trit::Refuse);
    assert_eq!(error.failure_id(), VOK_TRIT_BARE_LEGACY_ZERO);

    for malformed in [i32::MIN, -129, -127, -2, 2, 7, 127, 128, 255, i32::MAX] {
        let error = Trit::try_from(malformed).expect_err("malformed trit must refuse");
        assert_eq!(error.outcome(), Trit::Refuse);
        assert_eq!(error.failure_id(), "VOK_TRIT_INVALID");
    }
}

#[test]
fn trit_wire_never_emits_zero_and_round_trips() {
    assert_eq!(K3_UNKNOWN_WIRE, -128);
    assert_eq!(Trit::Unknown.to_wire(), -128);
    for trit in [Trit::Refuse, Trit::Unknown, Trit::Admit] {
        assert_ne!(trit.to_wire(), 0, "Galerina/VOK must never emit 0 as UNKNOWN");
        assert_eq!(Trit::decode_wire(trit.to_wire()), Ok((trit, TritWireForm::Canonical)));
    }
}

#[test]
fn bare_zero_is_refused_with_its_own_id_and_counted_as_a_refusal() {
    assert_eq!(VOK_TRIT_BARE_LEGACY_ZERO, "VOK_TRIT_BARE_LEGACY_ZERO");
    assert_ne!(VOK_TRIT_BARE_LEGACY_ZERO, "VOK_TRIT_INVALID");
    let before = bare_legacy_zero_refusals();
    let error = Trit::decode_wire(0).expect_err("F1: bare 0 must refuse");
    assert_eq!(error.outcome(), Trit::Refuse);
    assert_eq!(error.failure_id(), VOK_TRIT_BARE_LEGACY_ZERO);
    assert!(bare_legacy_zero_refusals() > before, "bare-0 refusal must be counted");
}

#[test]
fn legacy_frame_reads_canonical_values_and_refuses_invalid() {
    for trit in [Trit::Refuse, Trit::Unknown, Trit::Admit] {
        assert_eq!(Trit::decode_legacy_frame(trit.to_wire()), Ok((trit, TritWireForm::Canonical)));
    }
    for malformed in [i32::MIN, -129, -127, -2, 2, 7, 127, 128, 255, i32::MAX] {
        let error = Trit::decode_legacy_frame(malformed).expect_err("malformed trit must refuse");
        assert_eq!(error.outcome(), Trit::Refuse);
        assert_eq!(error.failure_id(), "VOK_TRIT_INVALID");
    }
}

#[test]
fn legacy_unknown_zero_is_typed_counted_and_never_admit() {
    let before = legacy_unknown_zero_reads();
    let decoded = Trit::decode_legacy_frame(0).expect("bridge open: framed legacy 0 is UNKNOWN");
    assert_eq!(decoded, (Trit::Unknown, TritWireForm::LegacyUnknownZero));
    assert_ne!(decoded.0, Trit::Admit);
    assert_ne!(decoded.0, Trit::Refuse);
    assert!(legacy_unknown_zero_reads() > before, "legacy-unknown-0 read must be counted");
    assert_eq!(
        Trit::decode_wire(-128),
        Ok((Trit::Unknown, TritWireForm::Canonical))
    );
}

#[test]
fn sunset_step_z_legacy_unknown_zero_bridge_still_open() {
    // SUNSET (Step Z, before SLIDE is the default execution path): this test FLIPS when the
    // bridge closes. Then assert !LEGACY_UNKNOWN_ZERO_BRIDGE and that framed 0 fails VOK_TRIT_LEGACY_CLOSED.
    assert_eq!(
        Trit::decode_legacy_frame(0).map(|(_, form)| form),
        Ok(TritWireForm::LegacyUnknownZero),
        "Option B bridge is still open (LEGACY_UNKNOWN_ZERO_BRIDGE = {LEGACY_UNKNOWN_ZERO_BRIDGE})"
    );
}

#[test]
fn authority_tag_is_bounded_and_canonical() {
    let tag = AuthorityTag::parse("slide.vok.execute.v1").expect("canonical tag");
    assert_eq!(tag.as_str(), "slide.vok.execute.v1");

    for malformed in [
        "",
        ".slide",
        "SLIDE.vok.execute.v1",
        "slide/vok",
        "slide..vok",
        "slide.vok.",
    ] {
        let error = AuthorityTag::parse(malformed).expect_err("malformed tag must refuse");
        assert_eq!(error.outcome(), Trit::Refuse);
        assert_eq!(error.failure_id(), "VOK_TAG_INVALID");
    }

    let oversized = "a".repeat(MAX_AUTHORITY_TAG_BYTES + 1);
    let error = AuthorityTag::parse(&oversized).expect_err("oversized tag must refuse");
    assert_eq!(error.failure_id(), "VOK_TAG_TOO_LARGE");
}

#[test]
fn authority_context_preserves_every_exact_identity_and_epoch() {
    let context = AuthorityContext::new([1; 32], [2; 32], [3; 32], 17, 29);
    assert_eq!(context.target_digest(), &[1; 32]);
    assert_eq!(context.policy_digest(), &[2; 32]);
    assert_eq!(context.verifier_digest(), &[3; 32]);
    assert_eq!(context.policy_epoch(), 17);
    assert_eq!(context.revocation_epoch(), 29);
}

#[test]
fn injected_nonce_source_has_a_stable_fail_close_error() {
    struct RefusingNonce;

    impl NonceSource for RefusingNonce {
        fn next_nonce(&mut self) -> Result<[u8; 16], NonceFailure> {
            Err(NonceFailure::new("VOK_NONCE_UNAVAILABLE"))
        }
    }

    let error = RefusingNonce
        .next_nonce()
        .expect_err("nonce source refusal must remain explicit");
    assert_eq!(error.outcome(), Trit::Refuse);
    assert_eq!(error.failure_id(), "VOK_NONCE_UNAVAILABLE");
}

#[test]
fn opaque_handle_debug_output_reveals_no_authority_material() {
    let tag = AuthorityTag::parse("slide.vok.execute.v1").expect("canonical tag");
    let admitted = AdmittedObjectHandle {
        table_nonce: [0x11; 16],
        slot: 42,
        generation: 9,
        object_nonce: [0x22; 16],
        tag: tag.clone(),
        thread_marker: Default::default(),
    };
    let lease = LeaseHandle {
        table_nonce: [0x33; 16],
        slot: 7,
        generation: 11,
        object_nonce: [0x44; 16],
        tag,
        artifact_digest: [0xAB; 32],
        thread_marker: Default::default(),
    };

    assert_eq!(format!("{admitted:?}"), "AdmittedObjectHandle(REDACTED)");
    assert_eq!(format!("{lease:?}"), "LeaseHandle(REDACTED)");

    let request = mint_request(all_admit(), b"secret-object-bytes".to_vec());
    let request_debug = format!("{request:?}");
    assert!(request_debug.contains("REDACTED"));
    assert!(!request_debug.contains("secret-object-bytes"));
}

#[test]
fn table_configuration_is_bounded_before_nonce_intake() {
    for (capacity, byte_ceiling, failure_id) in [
        (0, 1, "VOK_CAPACITY_INVALID"),
        (MAX_TABLE_CAPACITY + 1, 1, "VOK_CAPACITY_INVALID"),
        (1, 0, "VOK_BYTE_CEILING_INVALID"),
        (1, MAX_OBJECT_BYTES_LIMIT + 1, "VOK_BYTE_CEILING_INVALID"),
    ] {
        let error = AuthorityTable::new(
            capacity,
            byte_ceiling,
            context(7, 3, 5),
            SequenceNonce::from_nonces([]),
        )
        .expect_err("invalid table configuration must refuse");
        assert_eq!(error.outcome(), Trit::Refuse);
        assert_eq!(error.failure_id(), failure_id);
    }
}

#[test]
fn table_requires_an_injected_nonzero_instance_nonce() {
    let missing = AuthorityTable::new(
        1,
        64,
        context(7, 3, 5),
        SequenceNonce::refusing("VOK_NONCE_UNAVAILABLE"),
    )
    .expect_err("nonce source refusal must block table construction");
    assert_eq!(missing.failure_id(), "VOK_NONCE_UNAVAILABLE");

    let zero = AuthorityTable::new(
        1,
        64,
        context(7, 3, 5),
        SequenceNonce::from_nonces([[0; 16]]),
    )
    .expect_err("zero table nonce must refuse");
    assert_eq!(zero.failure_id(), "VOK_NONCE_ZERO");
}

#[test]
fn mint_requires_exact_context_and_bounded_nonempty_bytes() {
    let mut table = AuthorityTable::new(
        2,
        4,
        context(7, 3, 5),
        SequenceNonce::from_nonces([[1; 16], [2; 16]]),
    )
    .expect("valid bounded table");

    let empty = table
        .mint_admitted(mint_request(all_admit(), vec![]))
        .expect_err("empty object must refuse");
    assert_eq!(empty.failure_id(), "VOK_OBJECT_EMPTY");

    let oversized = table
        .mint_admitted(mint_request(all_admit(), vec![0; 5]))
        .expect_err("oversized object must refuse");
    assert_eq!(oversized.failure_id(), "VOK_OBJECT_TOO_LARGE");

    let mut context_table = table_with_nonces(1, [[1; 16], [2; 16]]);
    let mismatch = context_table
        .mint_admitted(bound_native_request_with(
            all_admit(),
            context(8, 3, 5),
            7,
        ))
        .expect_err("wrong context must refuse");
    assert_eq!(mismatch.failure_id(), "VOK_CONTEXT_MISMATCH");
    assert_eq!(context_table.live_len(), 0);
    assert_eq!(table.live_len(), 0);
}

#[test]
fn all_eight_k3_admission_gates_are_exhaustive_and_only_one_vector_mints() {
    let mut table = AuthorityTable::new(
        1,
        64,
        context(7, 3, 5),
        SequenceNonce::from_nonces([[1; 16], [2; 16]]),
    )
    .expect("valid bounded table");
    let values = [Trit::Refuse, Trit::Unknown, Trit::Admit];
    let mut admitted = 0;
    let mut vectors = 0;

    for ordinal in 0..3_usize.pow(8) {
        let mut remainder = ordinal;
        let mut gates = [Trit::Refuse; 8];
        for gate in &mut gates {
            *gate = values[remainder % 3];
            remainder /= 3;
        }
        let expected = gates.iter().copied().min().expect("eight gates");
        match table.mint_admitted(bound_native_request_with(gates, context(7, 3, 5), 1)) {
            Ok(_) => {
                assert_eq!(expected, Trit::Admit);
                admitted += 1;
            }
            Err(error) => {
                assert_eq!(error.outcome(), expected);
                assert_eq!(error.failure_id(), "VOK_ADMISSION_GATES_BLOCKED");
            }
        }
        vectors += 1;
    }

    assert_eq!(vectors, 6_561);
    assert_eq!(admitted, 1);
    assert_eq!(table.live_len(), 1);
}

#[test]
fn mint_refuses_missing_zero_and_repeated_object_nonces_without_mutation() {
    let mut missing = AuthorityTable::new(
        1,
        64,
        context(7, 3, 5),
        SequenceNonce::from_nonces([[1; 16]]),
    )
    .expect("valid table before object nonce intake");
    let error = missing
        .mint_admitted(bound_native_request(1))
        .expect_err("missing object nonce must refuse");
    assert_eq!(error.failure_id(), "VOK_TEST_NONCE_EXHAUSTED");
    assert_eq!(missing.live_len(), 0);

    let mut zero = AuthorityTable::new(
        1,
        64,
        context(7, 3, 5),
        SequenceNonce::from_nonces([[1; 16], [0; 16]]),
    )
    .expect("valid table before zero object nonce");
    let error = zero
        .mint_admitted(bound_native_request(1))
        .expect_err("zero object nonce must refuse");
    assert_eq!(error.failure_id(), "VOK_NONCE_ZERO");
    assert_eq!(zero.live_len(), 0);

    let mut repeated = AuthorityTable::new(
        2,
        64,
        context(7, 3, 5),
        SequenceNonce::from_nonces([[1; 16], [2; 16], [2; 16]]),
    )
    .expect("valid table before repeated object nonce");
    let first = repeated
        .mint_admitted(bound_native_request(1))
        .expect("first unique object nonce");
    assert_eq!(format!("{first:?}"), "AdmittedObjectHandle(REDACTED)");
    let error = repeated
        .mint_admitted(bound_native_request(2))
        .expect_err("repeated object nonce must refuse");
    assert_eq!(error.failure_id(), "VOK_NONCE_REPEATED");
    assert_eq!(repeated.live_len(), 1);
}

#[test]
fn fixed_capacity_exhaustion_is_unknown_and_does_not_request_more_entropy() {
    let mut table = AuthorityTable::new(
        1,
        64,
        context(7, 3, 5),
        SequenceNonce::from_nonces([[1; 16], [2; 16]]),
    )
    .expect("valid single-slot table");
    let _handle = table
        .mint_admitted(bound_native_request(1))
        .expect("first mint fills capacity");
    let error = table
        .mint_admitted(bound_native_request(2))
        .expect_err("full table must block");
    assert_eq!(error.outcome(), Trit::Unknown);
    assert_eq!(error.failure_id(), "VOK_CAPACITY_EXHAUSTED");
    assert_eq!(table.live_len(), 1);
}

#[test]
fn every_private_admitted_handle_field_is_revalidated() {
    for dimension in 0..5 {
        let mut table = table_with_nonces(1, [[1; 16], [2; 16], [3; 16]]);
        let mut handle = mint_one(&mut table);
        match dimension {
            0 => handle.table_nonce[0] ^= 1,
            1 => handle.slot = usize::MAX,
            2 => handle.generation = handle.generation.wrapping_add(1),
            3 => handle.object_nonce[0] ^= 1,
            4 => handle.tag = AuthorityTag::parse("slide.vok.other.v1").expect("other valid tag"),
            _ => unreachable!(),
        }

        let error = table
            .open_lease_for_artifact(handle, &context(7, 3, 5), &digest_d1())
            .expect_err("forged admitted handle must refuse");
        assert_eq!(error.outcome(), Trit::Refuse);
        assert_eq!(error.failure_id(), "VOK_HANDLE_MISMATCH");
        assert_eq!(table.live_len(), 1);
    }
}

#[test]
fn admitted_handle_is_affine_and_a_stale_duplicate_cannot_open_twice() {
    let mut table = table_with_nonces(1, [[1; 16], [2; 16], [3; 16]]);
    let admitted = mint_one(&mut table);
    let stale = duplicate_admitted(&admitted);
    let lease = table
        .open_lease_for_artifact(admitted, &context(7, 3, 5), &digest_d1())
        .expect("first exact transition");
    assert_eq!(format!("{lease:?}"), "LeaseHandle(REDACTED)");

    let error = table
        .open_lease_for_artifact(stale, &context(7, 3, 5), &digest_d1())
        .expect_err("stale duplicate must refuse");
    assert_eq!(error.failure_id(), "VOK_HANDLE_MISMATCH");
    assert_eq!(table.live_len(), 1);
}

#[test]
fn every_private_lease_handle_field_is_revalidated() {
    for dimension in 0..5 {
        let mut table = table_with_nonces(1, [[1; 16], [2; 16], [3; 16]]);
        let admitted = mint_one(&mut table);
        let mut lease = table
            .open_lease_for_artifact(admitted, &context(7, 3, 5), &digest_d1())
            .expect("valid lease before hostile mutation");
        match dimension {
            0 => lease.table_nonce[0] ^= 1,
            1 => lease.slot = usize::MAX,
            2 => lease.generation = lease.generation.wrapping_add(1),
            3 => lease.object_nonce[0] ^= 1,
            4 => lease.tag = AuthorityTag::parse("slide.vok.other.v1").expect("other valid tag"),
            _ => unreachable!(),
        }

        let error = table
            .consume_lease_for_artifact(lease, &context(7, 3, 5), Trit::Admit, &digest_d1())
            .expect_err("forged lease handle must refuse");
        assert_eq!(error.outcome(), Trit::Refuse);
        assert_eq!(error.failure_id(), "VOK_HANDLE_MISMATCH");
        assert_eq!(table.live_len(), 1);
    }
}

#[test]
fn lease_is_affine_and_receipt_is_terminal_value_only() {
    let mut table = table_with_nonces(1, [[1; 16], [2; 16], [3; 16]]);
    let admitted = mint_one(&mut table);
    let lease = table
        .open_lease_for_artifact(admitted, &context(7, 3, 5), &digest_d1())
        .expect("first exact transition");
    let stale = duplicate_lease(&lease);
    let receipt = table
        .consume_lease_for_artifact(lease, &context(7, 3, 5), Trit::Admit, &digest_d1())
        .expect("terminal close");
    assert_eq!(receipt.tag(), "slide.vok.execute.v1");
    assert_eq!(receipt.byte_length(), RETURN_U64_OBJECT_BYTES);
    assert_eq!(receipt.terminal_outcome(), Trit::Admit);
    assert!(!receipt.authority_released());
    assert_eq!(table.live_len(), 0);

    let error = table
        .consume_lease_for_artifact(stale, &context(7, 3, 5), Trit::Admit, &digest_d1())
        .expect_err("stale lease must refuse");
    assert_eq!(error.failure_id(), "VOK_HANDLE_MISMATCH");
}

#[test]
fn exact_current_context_is_required_for_both_affine_transitions() {
    let mut open_table = table_with_nonces(1, [[1; 16], [2; 16], [3; 16]]);
    let admitted = mint_one(&mut open_table);
    let error = open_table
        .open_lease(admitted, &context(8, 3, 5))
        .expect_err("wrong open context must refuse");
    assert_eq!(error.failure_id(), "VOK_CONTEXT_MISMATCH");
    assert_eq!(open_table.live_len(), 0);

    let mut close_table = table_with_nonces(1, [[1; 16], [2; 16], [3; 16]]);
    let admitted = mint_one(&mut close_table);
    let lease = close_table
        .open_lease_for_artifact(admitted, &context(7, 3, 5), &digest_d1())
        .expect("first exact transition");
    let error = close_table
        .consume_lease(lease, &context(7, 4, 5), Trit::Admit)
        .expect_err("wrong close context must refuse");
    assert_eq!(error.failure_id(), "VOK_CONTEXT_MISMATCH");
    assert_eq!(close_table.live_len(), 0);
}

#[test]
fn lease_nonce_failure_revokes_the_now_unreachable_admission() {
    let mut table = table_with_nonces(1, [[1; 16], [2; 16]]);
    let admitted = mint_one(&mut table);
    let error = table
        .open_lease_for_artifact(admitted, &context(7, 3, 5), &digest_d1())
        .expect_err("missing transition nonce must fail closed");
    assert_eq!(error.failure_id(), "VOK_TEST_NONCE_EXHAUSTED");
    assert_eq!(table.live_len(), 0);
}

#[test]
fn bounded_nonce_history_exhaustion_refuses_and_revokes_transition_state() {
    let mut table = table_with_nonces(1, [[1; 16], [2; 16], [3; 16]]);
    let admitted = mint_one(&mut table);
    table.nonce_history_limit = 2;
    let error = table
        .open_lease_for_artifact(admitted, &context(7, 3, 5), &digest_d1())
        .expect_err("nonce-history budget exhaustion must fail closed");
    assert_eq!(error.outcome(), Trit::Unknown);
    assert_eq!(error.failure_id(), "VOK_NONCE_BUDGET_EXHAUSTED");
    assert_eq!(table.live_len(), 0);
}

#[test]
fn context_advance_is_monotonic_and_eagerly_revokes_old_entries() {
    let mut table = table_with_nonces(2, [[1; 16], [2; 16], [3; 16]]);
    let old_handle = mint_one(&mut table);
    let regression = table
        .advance_context(context(7, 2, 5))
        .expect_err("policy epoch regression must refuse");
    assert_eq!(regression.failure_id(), "VOK_CONTEXT_REGRESSION");
    assert_eq!(table.live_len(), 1);

    let changed_without_epoch = table
        .advance_context(context(8, 3, 5))
        .expect_err("identity change without revocation epoch must refuse");
    assert_eq!(
        changed_without_epoch.failure_id(),
        "VOK_CONTEXT_CHANGE_WITHOUT_EPOCH"
    );
    assert_eq!(table.live_len(), 1);

    let summary = table
        .advance_context(context(8, 4, 6))
        .expect("strict epoch advance revokes older state");
    assert_eq!(summary.revoked(), 1);
    assert_eq!(summary.retired(), 0);
    assert_eq!(table.live_len(), 0);
    let error = table
        .open_lease(old_handle, &context(8, 4, 6))
        .expect_err("revoked old handle must refuse");
    assert_eq!(error.failure_id(), "VOK_HANDLE_MISMATCH");
}

#[test]
fn context_advance_revokes_an_open_lease_before_consumption() {
    let mut table = table_with_nonces(1, [[1; 16], [2; 16], [3; 16], [4; 16], [5; 16]]);
    let admitted = mint_one(&mut table);
    let lease = table
        .open_lease_for_artifact(admitted, &context(7, 3, 5), &digest_d1())
        .expect("current context may open one lease");
    assert_eq!(table.live_len(), 1);

    let summary = table
        .advance_context(context(7, 3, 6))
        .expect("a monotonic revocation epoch advance must revoke an open lease");
    assert_eq!(summary.revoked(), 1);
    assert_eq!(summary.retired(), 0);
    assert_eq!(table.live_len(), 0);

    let error = table
        .consume_lease(lease, &context(7, 3, 6), Trit::Admit)
        .expect_err("an open lease from the prior revocation epoch must not be consumed");
    assert_eq!(error.failure_id(), "VOK_HANDLE_MISMATCH");
    assert_eq!(error.outcome(), Trit::Refuse);

    let current_context = context(7, 3, 6);
    let current_handle = table
        .mint_admitted(bound_native_request_with(
            all_admit(),
            current_context.clone(),
            7,
        ))
        .expect("new authority context remains usable after revocation");
    let current_lease = table
        .open_lease_for_artifact(current_handle, &current_context, &digest_d1())
        .expect("slot capacity is reusable under the new epoch");
    let receipt = table
        .consume_lease_for_artifact(
            current_lease,
            &current_context,
            Trit::Admit,
            &digest_d1(),
        )
        .expect("a newly admitted current-epoch lease remains consumable");
    assert_eq!(receipt.revocation_epoch(), 6);
    assert_eq!(table.live_len(), 0);
}

#[test]
fn generation_overflow_retires_the_slot_instead_of_wrapping() {
    let mut table = table_with_nonces(1, [[1; 16], [2; 16], [3; 16]]);
    let mut admitted = mint_one(&mut table);
    admitted.generation = u64::MAX;
    table.slots[admitted.slot].generation = u64::MAX;

    let error = table
        .open_lease_for_artifact(admitted, &context(7, 3, 5), &digest_d1())
        .expect_err("generation exhaustion must refuse");
    assert_eq!(error.failure_id(), "VOK_GENERATION_EXHAUSTED");
    assert_eq!(table.live_len(), 0);
    assert!(table.slots[0].retired);

    let error = table
        .mint_admitted(bound_native_request(4))
        .expect_err("retired capacity cannot be reused");
    assert_eq!(error.failure_id(), "VOK_CAPACITY_EXHAUSTED");
}

#[test]
fn native_nine_gate_fold_matches_all_k3_vectors() {
    let values = [Trit::Refuse, Trit::Unknown, Trit::Admit];
    let mut authorizing = 0;
    for ordinal in 0..3_usize.pow(9) {
        let mut remainder = ordinal;
        let mut vector = [Trit::Refuse; 9];
        for gate in &mut vector {
            *gate = values[remainder % 3];
            remainder /= 3;
        }
        let expected = vector.iter().copied().min().expect("nine gates");
        let actual = authority_verdict(
            vector[..8].try_into().expect("eight admission gates"),
            vector[8],
        );
        assert_eq!(actual, expected);
        if actual == Trit::Admit {
            authorizing += 1;
        }
    }
    assert_eq!(authorizing, 1);
}

#[test]
fn operating_system_nonce_source_is_linked_and_nonzero() {
    let mut source = OsNonceSource;
    let first = source
        .next_nonce()
        .expect("supported host OS CSPRNG must provide a nonce");
    let second = source
        .next_nonce()
        .expect("supported host OS CSPRNG must remain available");
    assert_ne!(first, [0; 16]);
    assert_ne!(second, [0; 16]);
    assert_ne!(first, second);
}

#[test]
fn admitted_object_executes_once_and_returns_only_terminal_evidence() {
    let mut table = table_with_nonces(1, [[1; 16], [2; 16], [3; 16]]);
    let admitted = table
        .mint_admitted(bound_native_request(42))
        .expect("closed object admission");
    let lease = table
        .open_lease_for_artifact(admitted, &context(7, 3, 5), &digest_d1())
        .expect("affine lease");
    let stale = duplicate_lease(&lease);

    let receipt = table
        .execute_lease_for_artifact(lease, &context(7, 3, 5), &digest_d1())
        .expect("bounded W^X execution");
    assert_eq!(receipt.tag(), "slide.vok.execute.v1");
    assert_eq!(receipt.byte_length(), RETURN_U64_OBJECT_BYTES);
    assert_eq!(receipt.value(), 42);
    assert_eq!(receipt.terminal_outcome(), Trit::Admit);
    assert!(receipt.executable_at_call());
    assert!(!receipt.writable_at_call());
    assert!(!receipt.authority_released());
    assert_eq!(table.live_len(), 0);

    let error = table
        .execute_lease_for_artifact(stale, &context(7, 3, 5), &digest_d1())
        .expect_err("stale execution lease must refuse");
    assert_eq!(error.failure_id(), "VOK_HANDLE_MISMATCH");
}

#[test]
fn execute_lease_for_artifact_mismatch_clears_and_advances_the_slot() {
    let mut table = table_with_nonces(1, [[1; 16], [2; 16], [3; 16]]);
    let admitted = table
        .mint_admitted(bound_native_request(7))
        .expect("bound mint");
    let lease = table
        .open_lease_for_artifact(admitted, &context(7, 3, 5), &digest_d1())
        .expect("bound open");
    let stale = duplicate_lease(&lease);
    let error = table
        .execute_lease_for_artifact(lease, &context(7, 3, 5), &digest_d2())
        .expect_err("swapped digest at execute must refuse");
    assert_eq!(error.outcome(), Trit::Refuse);
    assert_eq!(error.failure_id(), "VOK_ARTIFACT_MISMATCH");
    assert_eq!(table.live_len(), 0);

    let later = table
        .execute_lease_for_artifact(stale, &context(7, 3, 5), &digest_d1())
        .expect_err("old lease after execute mismatch must refuse");
    assert_eq!(later.failure_id(), "VOK_HANDLE_MISMATCH");
}

#[test]
fn execute_lease_for_artifact_zero_expected_is_missing() {
    let mut table = table_with_nonces(1, [[1; 16], [2; 16], [3; 16]]);
    let admitted = table
        .mint_admitted(bound_native_request(7))
        .expect("bound mint");
    let lease = table
        .open_lease_for_artifact(admitted, &context(7, 3, 5), &digest_d1())
        .expect("bound open");
    let error = table
        .execute_lease_for_artifact(lease, &context(7, 3, 5), &[0; 32])
        .expect_err("all-zero expected at execute is missing");
    assert_eq!(error.failure_id(), "VOK_ARTIFACT_DIGEST_MISSING");
    assert_eq!(table.live_len(), 0);
}

#[test]
fn execute_lease_with_resources_mismatch_clears_and_advances_the_slot() {
    let mut table = table_with_nonces(1, [[1; 16], [2; 16], [3; 16]]);
    let admitted = table
        .mint_admitted(bound_native_request(7))
        .expect("bound mint");
    let lease = table
        .open_lease_for_artifact(admitted, &context(7, 3, 5), &digest_d1())
        .expect("bound open");
    let stale = duplicate_lease(&lease);
    let error = table
        .execute_lease_with_resources(lease, &context(7, 3, 5), Vec::new(), &digest_d2())
        .expect_err("swapped digest at execute-with-resources must refuse");
    assert_eq!(error.failure_id(), "VOK_ARTIFACT_MISMATCH");
    assert_eq!(table.live_len(), 0);

    let later = table
        .execute_lease_with_resources(stale, &context(7, 3, 5), Vec::new(), &digest_d1())
        .expect_err("old lease after resource-execute mismatch must refuse");
    assert_eq!(later.failure_id(), "VOK_HANDLE_MISMATCH");
}

#[test]
fn execute_lease_with_resources_zero_expected_is_missing() {
    let mut table = table_with_nonces(1, [[1; 16], [2; 16], [3; 16]]);
    let admitted = table
        .mint_admitted(bound_native_request(7))
        .expect("bound mint");
    let lease = table
        .open_lease_for_artifact(admitted, &context(7, 3, 5), &digest_d1())
        .expect("bound open");
    let error = table
        .execute_lease_with_resources(lease, &context(7, 3, 5), Vec::new(), &[0; 32])
        .expect_err("all-zero expected at execute-with-resources is missing");
    assert_eq!(error.failure_id(), "VOK_ARTIFACT_DIGEST_MISSING");
    assert_eq!(table.live_len(), 0);
}

#[test]
fn malformed_execution_and_context_drift_are_terminal() {
    let mut malformed_table = table_with_nonces(1, [[1; 16], [2; 16], [3; 16]]);
    let error = malformed_table
        .mint_admitted(mint_request(all_admit(), vec![1, 2, 3]))
        .expect_err("malformed object must refuse at mint");
    assert_eq!(error.failure_id(), "VOK_NATIVE_OBJECT_REQUIRED");
    assert_eq!(malformed_table.live_len(), 0);

    let mut drift_table = table_with_nonces(1, [[1; 16], [2; 16], [3; 16]]);
    let admitted = drift_table
        .mint_admitted(bound_native_request(7))
        .expect("closed object admission");
    let lease = drift_table
        .open_lease_for_artifact(admitted, &context(7, 3, 5), &digest_d1())
        .expect("lease before context drift");
    let error = drift_table
        .execute_lease(lease, &context(7, 4, 5))
        .expect_err("context drift must refuse");
    assert_eq!(error.failure_id(), "VOK_CONTEXT_MISMATCH");
    assert_eq!(drift_table.live_len(), 0);
}

#[test]
#[cfg(all(
    target_os = "linux",
    target_pointer_width = "64",
    any(target_arch = "x86_64", target_arch = "aarch64")
))]
#[ignore = "requires a memfd_secret-enabled 64-bit Linux kernel; run explicitly on the target"]
fn secret_arena_refuses_access_before_allocation_and_keeps_status_total() {
    const RESERVED: usize = 4097;
    let mut arena = SecretArena::reserve(RESERVED).expect("supported Linux secretmem");
    assert_eq!(arena.status(), MemoryStatus::Reserved);
    assert_eq!(arena.unresolved_bytes(), RESERVED);
    assert_eq!(arena.allocated_bytes(), 0);
    assert_eq!(
        arena.with_bytes_mut(|bytes| bytes[0] = 7),
        Err(SecretArenaError::NotAllocated)
    );
    assert_eq!(arena.status(), MemoryStatus::Reserved);
}

#[test]
#[cfg(all(
    target_os = "linux",
    target_pointer_width = "64",
    any(target_arch = "x86_64", target_arch = "aarch64")
))]
#[ignore = "requires a memfd_secret-enabled 64-bit Linux kernel; run explicitly on the target"]
fn secret_arena_callback_panic_cleans_and_consumes_the_arena() {
    use std::panic::{catch_unwind, AssertUnwindSafe};

    let mut arena = SecretArena::reserve(4097).expect("supported Linux secretmem");
    arena
        .allocate_pages()
        .expect("secret pages must be faulted in");

    let panic = catch_unwind(AssertUnwindSafe(|| {
        let _ = arena.with_bytes_mut(|bytes| {
            bytes[0] = 0xA5;
            panic!("simulated verifier failure");
        });
    }));

    assert!(panic.is_err());
    assert_eq!(arena.status(), MemoryStatus::Cleaned);
    assert_eq!(arena.unresolved_bytes(), 0);
    assert_eq!(arena.allocate_pages(), Err(SecretArenaError::NotActive));
}

#[test]
#[cfg(all(
    target_os = "linux",
    target_pointer_width = "64",
    any(target_arch = "x86_64", target_arch = "aarch64")
))]
#[ignore = "counterexample: requires memfd_secret and intentionally demonstrates copy escape"]
fn secret_arena_owned_copy_survives_arena_cleanup() {
    let mut arena = SecretArena::reserve(4097).expect("supported Linux secretmem");
    arena
        .allocate_pages()
        .expect("secret pages must be faulted in");

    let mut copied = Vec::new();
    arena
        .with_bytes_mut(|bytes| {
            bytes[0] = 0xA5;
            copied.extend_from_slice(&bytes[..1]);
        })
        .expect("the in-crate callback can access the arena");

    arena.cleanup().expect("the arena cleanup must succeed");
    assert_eq!(arena.status(), MemoryStatus::Cleaned);
    assert_eq!(copied, [0xA5], "the owned copy is outside arena cleanup");
}

#[test]
#[cfg(all(
    target_os = "linux",
    target_pointer_width = "64",
    any(target_arch = "x86_64", target_arch = "aarch64")
))]
#[ignore = "requires a memfd_secret-enabled 64-bit Linux kernel; run explicitly on the target"]
fn secret_arena_cleans_nonzero_test_bytes_before_releasing_the_charge() {
    const RESERVED: usize = 4097;
    const MARKER: [u8; 8] = [0xA5, 0x5A, 0xC3, 0x3C, 0x96, 0x69, 0xF0, 0x0F];

    let mut arena = SecretArena::reserve(RESERVED).expect("supported Linux secretmem");
    arena
        .allocate_pages()
        .expect("secret pages must be faulted in");
    assert_eq!(arena.status(), MemoryStatus::Allocated);
    assert_eq!(arena.unresolved_bytes(), RESERVED);

    let observed = arena
        .with_bytes_mut(|bytes| {
            bytes[..MARKER.len()].copy_from_slice(&MARKER);
            let mut observed = [0; MARKER.len()];
            observed.copy_from_slice(&bytes[..MARKER.len()]);
            observed
        })
        .expect("owned secret-memory bytes must be accessible while active");
    assert_eq!(observed, MARKER);
    assert_eq!(arena.status(), MemoryStatus::Retained);
    assert!(arena.allocated_bytes() >= RESERVED);
    assert!(arena.retained_bytes() > 0);
    assert_eq!(arena.retained_bytes(), arena.allocated_bytes());
    assert_eq!(arena.unresolved_bytes(), RESERVED);

    arena
        .cleanup()
        .expect("wipe, read-back, unmap and close must all succeed");
    assert_eq!(arena.status(), MemoryStatus::Cleaned);
    assert_eq!(arena.allocated_bytes(), 0);
    assert_eq!(arena.retained_bytes(), 0);
    assert_eq!(arena.unresolved_bytes(), 0);
    assert_eq!(
        arena.with_bytes_mut(|_| ()),
        Err(SecretArenaError::NotActive)
    );
}

#[test]
#[cfg(all(
    target_os = "linux",
    target_pointer_width = "64",
    any(target_arch = "x86_64", target_arch = "aarch64")
))]
#[ignore = "requires a memfd_secret-enabled 64-bit Linux kernel; run explicitly on the target"]
fn cleanup_of_region_a_allows_region_b_to_compute_until_a_is_retired() {
    use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
    use std::sync::{mpsc, Arc};
    use std::thread;
    use std::time::Duration;

    // Leave room under this WSL runner's 64 MiB RLIMIT_MEMLOCK for region B.
    const REGION_A_BYTES: usize = 48 * 1024 * 1024;
    const REGION_B_BYTES: usize = 4096;

    let cleanup_started = Arc::new(AtomicBool::new(false));
    let cleanup_done = Arc::new(AtomicBool::new(false));
    let b_steps_during_cleanup = Arc::new(AtomicUsize::new(0));
    let (b_ready_tx, b_ready_rx) = mpsc::sync_channel(1);

    // Arena B is created and remains owned by this worker thread; the !Send arena
    // never crosses the thread boundary. Its actual secret-memory mapping is used
    // continuously while arena A performs its real wipe/read-back/unmap/close path.
    let b_cleanup_started = Arc::clone(&cleanup_started);
    let b_cleanup_done = Arc::clone(&cleanup_done);
    let b_progress = Arc::clone(&b_steps_during_cleanup);
    let region_b = thread::spawn(move || {
        let mut arena_b = SecretArena::reserve(REGION_B_BYTES).expect("reserve region B");
        arena_b.allocate_pages().expect("allocate region B");
        let outcome = arena_b
            .with_bytes_mut(|bytes| {
                bytes[0] = 0xB7;
                b_ready_tx.send(()).expect("signal region B ready");
                let mut compute_steps = 0usize;
                while !b_cleanup_done.load(Ordering::Acquire) {
                    if b_cleanup_started.load(Ordering::Acquire) {
                        bytes[1] = bytes[1].wrapping_add(1);
                        compute_steps = compute_steps.wrapping_add(1);
                        b_progress.fetch_add(1, Ordering::Relaxed);
                    }
                    std::hint::spin_loop();
                }
                (bytes[0], compute_steps)
            })
            .expect("region B stays available while A is cleaned");

        assert_eq!(arena_b.status(), MemoryStatus::Retained);
        assert_eq!(arena_b.unresolved_bytes(), REGION_B_BYTES);
        arena_b.cleanup().expect("clean region B independently");
        (outcome, arena_b.status(), arena_b.unresolved_bytes())
    });

    let a_cleanup_started = Arc::clone(&cleanup_started);
    let a_cleanup_done = Arc::clone(&cleanup_done);
    let region_a = thread::spawn(move || {
        let mut arena_a = SecretArena::reserve(REGION_A_BYTES).expect("reserve region A");
        arena_a.allocate_pages().expect("allocate region A");
        arena_a
            .with_bytes_mut(|bytes| bytes[0] = 0xA3)
            .expect("write region A");
        b_ready_rx
            .recv_timeout(Duration::from_secs(10))
            .expect("region B reached its compute loop");

        a_cleanup_started.store(true, Ordering::Release);
        let cleanup_result = arena_a.cleanup();
        a_cleanup_done.store(true, Ordering::Release);
        cleanup_result.expect("region A wipe, read-back and release succeed");
        (arena_a.status(), arena_a.unresolved_bytes())
    });

    assert_eq!(
        region_a.join().expect("region A worker completes"),
        (MemoryStatus::Cleaned, 0)
    );
    let (b_outcome, b_status, b_unresolved) = region_b.join().expect("region B worker completes");
    assert_eq!(b_outcome.0, 0xB7, "A cleanup must not alter B's bytes");
    assert!(b_outcome.1 > 0, "B must make progress during A cleanup");
    assert!(b_steps_during_cleanup.load(Ordering::Relaxed) > 0);
    assert_eq!(b_status, MemoryStatus::Cleaned);
    assert_eq!(b_unresolved, 0);
}

#[test]
fn secret_arena_errors_have_unique_canonical_runtime_code_metadata() {
    let cases = [
        (
            SecretArenaError::InvalidLength,
            "ERR_SECRET_ARENA_INVALID_LENGTH",
            "SECRET_ARENA_INVALID_LENGTH",
        ),
        (
            SecretArenaError::UnsupportedPlatform,
            "ERR_SECRET_ARENA_UNSUPPORTED_PLATFORM",
            "SECRET_ARENA_UNSUPPORTED_PLATFORM",
        ),
        (
            SecretArenaError::CreateRefused { os_errno: 1 },
            "ERR_SECRET_ARENA_CREATE_REFUSED",
            "SECRET_ARENA_CREATE_REFUSED",
        ),
        (
            SecretArenaError::ResizeRefused,
            "ERR_SECRET_ARENA_RESIZE_REFUSED",
            "SECRET_ARENA_RESIZE_REFUSED",
        ),
        (
            SecretArenaError::MapRefused,
            "ERR_SECRET_ARENA_MAP_REFUSED",
            "SECRET_ARENA_MAP_REFUSED",
        ),
        (
            SecretArenaError::PageSizeRefused,
            "ERR_SECRET_ARENA_PAGE_SIZE_REFUSED",
            "SECRET_ARENA_PAGE_SIZE_REFUSED",
        ),
        (
            SecretArenaError::NotAllocated,
            "ERR_SECRET_ARENA_NOT_ALLOCATED",
            "SECRET_ARENA_NOT_ALLOCATED",
        ),
        (
            SecretArenaError::NotActive,
            "ERR_SECRET_ARENA_NOT_ACTIVE",
            "SECRET_ARENA_NOT_ACTIVE",
        ),
        (
            SecretArenaError::CleanupFailed,
            "ERR_SECRET_ARENA_CLEANUP_FAILED",
            "SECRET_ARENA_CLEANUP_FAILED",
        ),
    ];

    let mut seen = std::collections::HashSet::new();
    for (error, code, name) in cases {
        let metadata = error.runtime_code();
        assert_eq!(metadata.code, code);
        assert_eq!(metadata.name, name);
        assert_eq!(metadata.severity, "error");
        assert!(!metadata.message.is_empty());
        assert!(seen.insert(metadata.code), "runtime code must be unique");
        // Display preserves the pre-registration identifier; canonical code
        // consumers use runtime_code(), not formatted user-facing text.
        assert!(format!("{error}").starts_with(metadata.name));
    }
    assert!(format!("{}", SecretArenaError::CreateRefused { os_errno: 13 }).ends_with(":13"));
}

pub(crate) fn digest_d1() -> [u8; 32] {
    [0xA1; 32]
}

fn digest_d2() -> [u8; 32] {
    [0xB2; 32]
}

#[test]
fn artifact_digest_binds_open_and_consume() {
    let digest = digest_d1();
    let mut table = table_with_nonces(1, [[1; 16], [2; 16], [3; 16]]);
    let admitted = table
        .mint_admitted(bound_native_request(7))
        .expect("bound mint");
    let lease = table
        .open_lease_for_artifact(admitted, &context(7, 3, 5), &digest)
        .expect("bound open");
    assert_eq!(lease.artifact_digest, digest);
    let receipt = table
        .consume_lease_for_artifact(lease, &context(7, 3, 5), Trit::Admit, &digest)
        .expect("bound consume");
    assert_eq!(receipt.artifact_digest(), &digest);
    assert_eq!(receipt.tag(), "slide.vok.execute.v1");
    assert!(!receipt.authority_released());
    assert_eq!(table.live_len(), 0);
}

#[test]
fn artifact_mismatch_at_open_clears_and_advances_the_slot() {
    let mut table = table_with_nonces(1, [[1; 16], [2; 16], [3; 16]]);
    let admitted = table
        .mint_admitted(
            bound_native_request(7),
        )
        .expect("bound mint");
    let stale = duplicate_admitted(&admitted);
    let error = table
        .open_lease_for_artifact(admitted, &context(7, 3, 5), &digest_d2())
        .expect_err("swapped digest must refuse");
    assert_eq!(error.outcome(), Trit::Refuse);
    assert_eq!(error.failure_id(), "VOK_ARTIFACT_MISMATCH");
    assert_eq!(table.live_len(), 0);

    let later = table
        .open_lease_for_artifact(stale, &context(7, 3, 5), &digest_d1())
        .expect_err("old handle after mismatch must refuse");
    assert_eq!(later.failure_id(), "VOK_HANDLE_MISMATCH");
}

#[test]
fn artifact_mismatch_at_consume_clears_and_advances_the_slot() {
    let mut table = table_with_nonces(1, [[1; 16], [2; 16], [3; 16]]);
    let admitted = table
        .mint_admitted(
            bound_native_request(7),
        )
        .expect("bound mint");
    let lease = table
        .open_lease_for_artifact(admitted, &context(7, 3, 5), &digest_d1())
        .expect("bound open");
    let stale = duplicate_lease(&lease);
    let error = table
        .consume_lease_for_artifact(lease, &context(7, 3, 5), Trit::Admit, &digest_d2())
        .expect_err("swapped digest at consume must refuse");
    assert_eq!(error.failure_id(), "VOK_ARTIFACT_MISMATCH");
    assert_eq!(table.live_len(), 0);

    let later = table
        .consume_lease_for_artifact(stale, &context(7, 3, 5), Trit::Admit, &digest_d1())
        .expect_err("old lease after mismatch must refuse");
    assert_eq!(later.failure_id(), "VOK_HANDLE_MISMATCH");
}

#[test]
fn artifact_missing_refuses_on_bound_entry_points() {
    let missing = mint_request(all_admit(), vec![1, 2, 3])
        .with_artifact_digest([0; 32])
        .expect_err("all-zero builder digest is missing");
    assert_eq!(missing.failure_id(), "VOK_ARTIFACT_DIGEST_MISSING");

    let mut mint_table = table_with_nonces(1, [[1; 16], [2; 16], [3; 16]]);
    let error = mint_table
        .mint_admitted(return_u64_request(7))
        .expect_err("native object without digest must refuse at mint");
    assert_eq!(error.failure_id(), "VOK_ARTIFACT_DIGEST_MISSING");
    assert_eq!(mint_table.live_len(), 0);

    let mut expected_table = table_with_nonces(1, [[1; 16], [2; 16], [3; 16]]);
    let admitted = expected_table
        .mint_admitted(bound_native_request(7))
        .expect("bound mint");
    let error = expected_table
        .open_lease_for_artifact(admitted, &context(7, 3, 5), &[0; 32])
        .expect_err("all-zero expected is missing");
    assert_eq!(error.failure_id(), "VOK_ARTIFACT_DIGEST_MISSING");
    assert_eq!(expected_table.live_len(), 0);
}

#[test]
fn unbound_open_and_consume_keep_legacy_and_bound_entries() {
    let mut bound_table = table_with_nonces(1, [[1; 16], [2; 16], [3; 16]]);
    let admitted = mint_one(&mut bound_table);
    let error = bound_table
        .open_lease(admitted, &context(7, 3, 5))
        .expect_err("unbound open must refuse");
    assert_eq!(error.failure_id(), "VOK_ARTIFACT_DIGEST_MISSING");
    assert_eq!(bound_table.live_len(), 0);

    let mut bound_consume = table_with_nonces(1, [[1; 16], [2; 16], [3; 16]]);
    let admitted = mint_one(&mut bound_consume);
    let lease = bound_consume
        .open_lease_for_artifact(admitted, &context(7, 3, 5), &digest_d1())
        .expect("bound open");
    let error = bound_consume
        .consume_lease(lease, &context(7, 3, 5), Trit::Admit)
        .expect_err("unbound consume of bound lease must refuse");
    assert_eq!(error.failure_id(), "VOK_ARTIFACT_DIGEST_MISSING");
    assert_eq!(bound_consume.live_len(), 0);

    let mut bound_execute = table_with_nonces(1, [[1; 16], [2; 16], [3; 16]]);
    let admitted = mint_one(&mut bound_execute);
    let lease = bound_execute
        .open_lease_for_artifact(admitted, &context(7, 3, 5), &digest_d1())
        .expect("bound open");
    let error = bound_execute
        .execute_lease(lease, &context(7, 3, 5))
        .expect_err("unbound execute of bound lease must refuse");
    assert_eq!(error.failure_id(), "VOK_ARTIFACT_DIGEST_MISSING");
    assert_eq!(bound_execute.live_len(), 0);
}

#[test]
fn admitted_entry_and_lease_drop_zero_the_artifact_digest() {
    let mut entry = AdmittedEntry {
        object_nonce: [1; 16],
        tag: AuthorityTag::parse("slide.vok.execute.v1").expect("canonical tag"),
        context: context(7, 3, 5),
        bytes: vec![1, 2, 3],
        artifact_digest: digest_d1(),
    };
    entry.clear();
    assert_eq!(entry.artifact_digest, [0; 32]);
    assert!(entry.bytes.is_empty());

    let lease = LeaseHandle {
        table_nonce: [0x33; 16],
        slot: 7,
        generation: 11,
        object_nonce: [0x44; 16],
        tag: AuthorityTag::parse("slide.vok.execute.v1").expect("canonical tag"),
        artifact_digest: digest_d1(),
        thread_marker: Default::default(),
    };
    assert_eq!(lease.artifact_digest, digest_d1());
    super::LAST_DROPPED_LEASE_ARTIFACT_DIGEST.with(|cell| cell.set(digest_d1()));
    drop(lease);
    super::LAST_DROPPED_LEASE_ARTIFACT_DIGEST.with(|cell| {
        assert_eq!(cell.get(), [0; 32], "Drop must record zeros after fill");
    });
}

#[test]
fn vok_receipt_debug_and_eq_expose_the_public_module_digest() {
    let receipt = VokReceipt {
        tag: "slide.vok.execute.v1".to_owned(),
        byte_length: 3,
        terminal_outcome: Trit::Admit,
        policy_epoch: 3,
        revocation_epoch: 5,
        artifact_digest: digest_d1(),
    };
    let debug = format!("{receipt:?}");
    assert!(debug.contains("artifact_digest"));
    assert!(debug.contains("REDACTED"));
    assert!(!debug.contains("161"), "Debug must not print digest bytes");
    assert_eq!(receipt.artifact_digest(), &digest_d1());
    let other = VokReceipt {
        tag: receipt.tag.clone(),
        byte_length: receipt.byte_length,
        terminal_outcome: receipt.terminal_outcome,
        policy_epoch: receipt.policy_epoch,
        revocation_epoch: receipt.revocation_epoch,
        artifact_digest: digest_d2(),
    };
    assert_ne!(receipt, other);
}

#[test]
fn mint_request_debug_redacts_the_artifact_digest() {
    let request = mint_request(all_admit(), vec![1, 2, 3])
        .with_artifact_digest(digest_d1())
        .expect("nonzero digest");
    let debug = format!("{request:?}");
    assert!(debug.contains("REDACTED"));
    assert!(!debug.contains("161"), "Debug must not print digest bytes");
}

#[test]
fn prefixed_wasm_module_magic_is_refused() {
    let prefixed = vec![0xff, 0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00];
    let mut table = table_with_nonces(1, [[1; 16], [2; 16]]);
    let error = table
        .mint_admitted(mint_request(all_admit(), prefixed))
        .expect_err("prefixed wasm magic must refuse");
    assert_eq!(error.failure_id(), "VOK_WASM_BYTES_REFUSED");
    assert_eq!(table.live_len(), 0);
}

#[test]
fn composed_wamr_digest_handoff_admits_native_object_and_refuses_wasm_bytes() {
    let wasm_like: [u8; 8] = [0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00];
    let digest = crate::sha256::sha256(&wasm_like);

    let mut refuse_table = table_with_nonces(1, [[1; 16], [2; 16], [3; 16]]);
    let error = refuse_table
        .mint_admitted(mint_request(all_admit(), wasm_like.to_vec()))
        .expect_err("wasm magic must never enter VOK");
    assert_eq!(error.failure_id(), "VOK_WASM_BYTES_REFUSED");
    assert_eq!(refuse_table.live_len(), 0);

    let mut missing_table = table_with_nonces(1, [[1; 16], [2; 16], [3; 16]]);
    let admitted = missing_table
        .mint_admitted(
            return_u64_request(7)
                .with_artifact_digest(digest)
                .expect("nonzero digest"),
        )
        .expect("digest-only native mint");
    let error = missing_table
        .open_lease_for_artifact(admitted, &context(7, 3, 5), &[0; 32])
        .expect_err("missing expected digest");
    assert_eq!(error.failure_id(), "VOK_ARTIFACT_DIGEST_MISSING");
    assert_eq!(missing_table.live_len(), 0);

    let mut mismatch_table = table_with_nonces(1, [[1; 16], [2; 16], [3; 16]]);
    let admitted = mismatch_table
        .mint_admitted(
            return_u64_request(7)
                .with_artifact_digest(digest)
                .expect("nonzero digest"),
        )
        .expect("digest-only native mint");
    let error = mismatch_table
        .open_lease_for_artifact(admitted, &context(7, 3, 5), &digest_d2())
        .expect_err("swapped digest");
    assert_eq!(error.failure_id(), "VOK_ARTIFACT_MISMATCH");
    assert_eq!(mismatch_table.live_len(), 0);

    let mut table = table_with_nonces(1, [[1; 16], [2; 16], [3; 16]]);
    let admitted = table
        .mint_admitted(
            return_u64_request(7)
                .with_artifact_digest(digest)
                .expect("nonzero digest"),
        )
        .expect("digest-only native mint");
    let lease = table
        .open_lease_for_artifact(admitted, &context(7, 3, 5), &digest)
        .expect("matching digest open");
    let receipt = table
        .consume_lease_for_artifact(lease, &context(7, 3, 5), Trit::Admit, &digest)
        .expect("matching digest consume");
    assert_eq!(receipt.artifact_digest(), &digest);
    assert_eq!(receipt.byte_length(), RETURN_U64_OBJECT_BYTES);
    assert_eq!(table.live_len(), 0);
}

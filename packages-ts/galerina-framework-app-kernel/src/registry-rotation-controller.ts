import {
  Verdict,
  activeEpoch,
  buildRegistryRotationTransition,
  checkReadiness,
  commitTripleLock,
  confirmDrain,
  confirmTripleVerify,
  createRegistryRotationContext,
  decideAtBoundary,
  fallbackToOldEpoch,
  isRestoredRegistryRotationState,
  registryRotationKeyCommit,
  registryRotationTriggerVerdict,
  retireVerdict,
  retireOldEpoch,
  switchEpoch,
  type DrainEvidence,
  type GovernanceDiagnostic,
  type PhaseOutcome,
  type ReadinessEvidence,
  type RegistryRotationCustody,
  type RegistryRotationPublicBundle,
  type RegistryRotationTrigger,
  type RegistryRotationState,
  type RetirePolicy,
  type RotationProcess,
  type SignerVote,
  type VerifyEvidence,
} from "@galerina/tower-citizen";
import {
  isAdmittedRegistryRotationCandidate,
  isAdmittedRegistryRotationIndex,
  stageAdmittedRegistryRotationCandidate,
  type AdmittedRegistryRotationCandidate,
  type AdmittedRegistryRotationIndex,
} from "./registry-rotation-authority.js";
import {
  consumeRegistryGenerationForwardProbe,
  isProductionAdmittedRegistryGeneration,
  type PersistedRegistryGeneration,
  type RegistryGenerationForwardProbe,
} from "./registry-generation-store.js";
import {
  registryDurabilityProfileMatchesRotation,
  type ReleasedRegistryDurabilityProfile,
} from "./registry-durability-production-admission.js";

export interface AdvanceRegistryRotationOptions {
  readonly process: RotationProcess;
  readonly ringMacKey: Uint8Array;
  readonly trigger: RegistryRotationTrigger;
  readonly readiness: ReadinessEvidence;
  readonly receipt: AdmittedRegistryRotationCandidate;
  readonly candidatePublicBundle: RegistryRotationPublicBundle;
  readonly custodyRef: string;
  readonly createdTick: number;
  readonly authorityAt: string;
  readonly oldPublicBundle: RegistryRotationPublicBundle;
  readonly custody: RegistryRotationCustody;
  readonly chainHead: string;
  readonly votes: readonly SignerVote[];
  readonly quorum: number;
  readonly transitionTick: number;
  readonly switchTick: number;
  readonly verifyEvidence: VerifyEvidence;
  readonly drainEvidence: DrainEvidence;
  readonly retirePolicy: RetirePolicy;
  readonly retireTick: number;
  readonly verifyCurrentChain: () => boolean;
  readonly verifyForwardProbe: () => boolean;
  readonly verifyBackwardSample: () => boolean;
  readonly onDiagnostic?: (diagnostic: GovernanceDiagnostic) => void;
}

function refused(
  options: AdvanceRegistryRotationOptions,
  verdict: Verdict,
  reason: string,
): PhaseOutcome {
  return {
    process: options.process,
    decision: decideAtBoundary(verdict, options.onDiagnostic),
    reasons: [reason],
  };
}

function bundlesMatchRing(
  options: AdvanceRegistryRotationOptions,
): boolean {
  try {
    const oldCommit = registryRotationKeyCommit(options.oldPublicBundle);
    const newCommit = registryRotationKeyCommit(
      options.candidatePublicBundle,
    );
    const oldEpoch = options.process.ring.epochs.find(
      (epoch) => epoch.keyId === options.oldPublicBundle.keyId,
    );
    const newEpoch = options.process.ring.epochs.find(
      (epoch) => epoch.keyId === options.candidatePublicBundle.keyId,
    );
    return oldEpoch?.keyCommit === oldCommit
      && newEpoch?.keyCommit === newCommit;
  } catch {
    return false;
  }
}

function contextFor(
  options: AdvanceRegistryRotationOptions,
) {
  if (options.process.transition === null || !bundlesMatchRing(options)) {
    return null;
  }
  try {
    return createRegistryRotationContext({
      transition: options.process.transition,
      oldKey: options.oldPublicBundle,
      newKey: options.candidatePublicBundle,
      custody: options.custody,
      verifyCurrentChain: options.verifyCurrentChain,
      verifyForwardProbe: options.verifyForwardProbe,
      verifyBackwardSample: options.verifyBackwardSample,
    });
  } catch {
    return null;
  }
}

/**
 * Advance at most one authorized phase. Calling this function repeatedly is
 * the automatic driver; each call re-runs the evidence gate for its current
 * phase. A caller cannot request a target phase or skip ahead.
 */
export function advanceRegistryRotation(
  options: AdvanceRegistryRotationOptions,
): PhaseOutcome {
  const phase = options.process.phase;

  if (phase === "idle") {
    const trigger = registryRotationTriggerVerdict(
      options.trigger,
      options.onDiagnostic,
    );
    if (trigger !== Verdict.ALLOW) {
      return refused(
        options,
        trigger,
        trigger === Verdict.DENY
          ? "DENY: registry rotation trigger facts are malformed"
          : "ABSTAIN: registry rotation is not due",
      );
    }
    return checkReadiness(
      options.process,
      options.readiness,
      { verifyCurrentChain: options.verifyCurrentChain },
      options.onDiagnostic,
    );
  }

  if (phase === "ready") {
    return stageAdmittedRegistryRotationCandidate({
      process: options.process,
      ringMacKey: options.ringMacKey,
      receipt: options.receipt,
      publicBundle: options.candidatePublicBundle,
      custodyRef: options.custodyRef,
      createdTick: options.createdTick,
      at: options.authorityAt,
      ...(options.onDiagnostic === undefined
        ? {}
        : { onDiagnostic: options.onDiagnostic }),
    });
  }

  if (phase === "staged") {
    if (
      !isAdmittedRegistryRotationCandidate(options.receipt)
      || !bundlesMatchRing(options)
    ) {
      return refused(
        options,
        Verdict.DENY,
        "DENY: staged registry candidate no longer matches root-admitted public authority",
      );
    }
    const active = activeEpoch(options.process.ring);
    const staged = options.process.ring.epochs.find(
      (epoch) => epoch.status === "staged",
    );
    if (
      active === null
      || staged === undefined
      || active.keyId !== options.oldPublicBundle.keyId
      || staged.keyId !== options.candidatePublicBundle.keyId
    ) {
      return refused(
        options,
        Verdict.DENY,
        "DENY: registry ring identities do not match the admitted transition",
      );
    }
    let transition;
    try {
      transition = buildRegistryRotationTransition({
        fromEpoch: active.epochId,
        toEpoch: staged.epochId,
        atTick: options.transitionTick,
        prevChainHead: options.chainHead,
        oldKey: options.oldPublicBundle,
        newKey: options.candidatePublicBundle,
        custody: options.custody,
      });
    } catch {
      return refused(
        options,
        Verdict.DENY,
        "DENY: custody could not produce complete dual-signed transition evidence",
      );
    }
    const context = createRegistryRotationContext({
      transition,
      oldKey: options.oldPublicBundle,
      newKey: options.candidatePublicBundle,
      custody: options.custody,
      verifyCurrentChain: options.verifyCurrentChain,
      verifyForwardProbe: options.verifyForwardProbe,
      verifyBackwardSample: options.verifyBackwardSample,
    });
    return commitTripleLock(
      options.process,
      options.ringMacKey,
      transition,
      options.chainHead,
      options.votes,
      options.quorum,
      context,
      options.onDiagnostic,
    );
  }

  if (phase === "locked") {
    if (!bundlesMatchRing(options)) {
      return refused(
        options,
        Verdict.DENY,
        "DENY: registry public authority changed before switch",
      );
    }
    return switchEpoch(
      options.process,
      options.ringMacKey,
      options.switchTick,
      options.onDiagnostic,
    );
  }

  if (phase === "switched") {
    const context = contextFor(options);
    if (context === null) {
      return refused(
        options,
        Verdict.DENY,
        "DENY: post-switch registry authority evidence is unavailable",
      );
    }
    const verified = confirmTripleVerify(
      options.process,
      options.verifyEvidence,
      context,
      options.onDiagnostic,
    );
    if (
      verified.decision.verdict === Verdict.DENY
      && verified.process === options.process
    ) {
      return fallbackToOldEpoch(
        options.process,
        options.ringMacKey,
        options.switchTick,
        options.onDiagnostic,
      );
    }
    return verified;
  }

  if (phase === "verified") {
    return confirmDrain(
      options.process,
      options.drainEvidence,
      options.votes,
      options.quorum,
      options.onDiagnostic,
    );
  }

  if (phase === "drained") {
    const active = activeEpoch(options.process.ring);
    const oldEpoch = active === null
      ? undefined
      : options.process.ring.epochs.find(
        (epoch) => epoch.epochId === active.epochId - 1,
      );
    if (
      oldEpoch === undefined
      || options.retirePolicy.mode !== "destroy-private"
      || retireVerdict(
        options.process.ring,
        options.ringMacKey,
        oldEpoch.epochId,
        options.retirePolicy,
      ).verdict !== Verdict.ALLOW
    ) {
      return refused(
        options,
        Verdict.DENY,
        "DENY: automatic registry retirement admits destroy-private only after a clean drain",
      );
    }
    if (options.custody.retirePrivate === undefined) {
      return refused(
        options,
        Verdict.INDETERMINATE,
        "ABSTAIN: private-key retirement custody is unavailable",
      );
    }
    let retired = false;
    try {
      retired = options.custody.retirePrivate(oldEpoch.keyId) === true;
    } catch {
      retired = false;
    }
    if (!retired) {
      return refused(
        options,
        Verdict.DENY,
        "DENY: custody did not confirm idempotent private-key destruction",
      );
    }
    return retireOldEpoch(
      options.process,
      options.ringMacKey,
      options.retirePolicy,
      options.retireTick,
      options.onDiagnostic,
    );
  }

  return refused(
    options,
    Verdict.DENY,
    "DENY: registry rotation is already retired; a new process and candidate are required",
  );
}

export interface AdvanceRegistryRotationStateOptions
  extends Omit<
    AdvanceRegistryRotationOptions,
    "process" | "verifyForwardProbe"
  > {
  readonly state: RegistryRotationState;
  readonly admittedIndex: AdmittedRegistryRotationIndex;
  readonly candidateGeneration: PersistedRegistryGeneration;
  readonly durabilityProfile: ReleasedRegistryDurabilityProfile;
  readonly acceptedCheckpointDigest: string;
  readonly forwardProbe: RegistryGenerationForwardProbe;
}

export interface RegistryRotationStateOutcome
  extends Omit<PhaseOutcome, "process"> {
  readonly state: RegistryRotationState;
}

/**
 * Production driver: every call starts from an authenticated restored
 * checkpoint and returns an unbranded next state which must be sealed and
 * restored before another phase may advance. The exact accepted delegation
 * and index identity move forward only after the post-switch canary verifies.
 */
export function advanceRegistryRotationState(
  options: AdvanceRegistryRotationStateOptions,
): RegistryRotationStateOutcome {
  const forwardProbeVerified = consumeRegistryGenerationForwardProbe(
    options.forwardProbe,
    options.candidateGeneration,
  );
  if (!forwardProbeVerified) {
    return {
      state: options.state,
      decision: decideAtBoundary(Verdict.DENY, options.onDiagnostic),
      reasons: [
        "DENY: exact one-use persisted-object-bound forward probe receipt is unavailable",
      ],
    };
  }
  const candidateAlreadyAccepted = [
    "verified",
    "drained",
    "retired",
  ].includes(options.state.process.phase);
  const generationFactsValid =
    isProductionAdmittedRegistryGeneration(options.candidateGeneration)
    && options.candidateGeneration.delegationSerial
      === options.receipt.delegationSerial
    && options.candidateGeneration.operationalKeyId
      === options.receipt.keyId
    && options.candidateGeneration.indexIssuedAt
      === options.admittedIndex.issuedAt
    && options.candidateGeneration.generation.index.entries.length
      === options.admittedIndex.entryCount;
  const candidateFactsValid = generationFactsValid
    && (
      candidateAlreadyAccepted
        ? options.receipt.delegationSerial
            === options.state.acceptedDelegationSerial
          && options.admittedIndex.issuedAt
            === options.state.acceptedIndexIssuedAt
          && options.candidateGeneration.generationId
            === options.state.acceptedGenerationId
        : options.receipt.delegationSerial
            > options.state.acceptedDelegationSerial
          && Date.parse(options.admittedIndex.issuedAt)
            > Date.parse(options.state.acceptedIndexIssuedAt)
          && options.candidateGeneration.generationId
            !== options.state.acceptedGenerationId
    );
  if (
    !isRestoredRegistryRotationState(options.state)
    || !isAdmittedRegistryRotationCandidate(options.receipt)
    || !isAdmittedRegistryRotationIndex(options.admittedIndex)
    || options.receipt.keyId !== options.admittedIndex.keyId
    || !registryDurabilityProfileMatchesRotation({
      profile: options.durabilityProfile,
      candidateGeneration: options.candidateGeneration,
      receipt: options.receipt,
      admittedIndex: options.admittedIndex,
      acceptedCheckpointDigest: options.acceptedCheckpointDigest,
      authorityAt: options.authorityAt,
    })
    || !candidateFactsValid
  ) {
    return {
      state: options.state,
      decision: decideAtBoundary(Verdict.DENY, options.onDiagnostic),
      reasons: [
        "DENY: production rotation state or candidate generation identity is unauthenticated, stale, or mismatched",
      ],
    };
  }
  const priorPhase = options.state.process.phase;
  const outcome = advanceRegistryRotation({
    ...options,
    process: options.state.process,
    verifyForwardProbe: () => forwardProbeVerified,
  });
  if (outcome.process === options.state.process) {
    return {
      state: options.state,
      decision: outcome.decision,
      reasons: outcome.reasons,
    };
  }
  const accepted = priorPhase === "switched"
    && outcome.process.phase === "verified";
  const state: RegistryRotationState = accepted
    ? {
      process: outcome.process,
      delegationSerialFloor:
        options.state.acceptedDelegationSerial,
      indexIssuedAtFloor:
        options.state.acceptedIndexIssuedAt,
      acceptedDelegationSerial:
        options.receipt.delegationSerial,
      acceptedIndexIssuedAt:
        options.admittedIndex.issuedAt,
      acceptedGenerationId:
        options.candidateGeneration.generationId,
    }
    : {
      ...options.state,
      process: outcome.process,
    };
  return {
    state,
    decision: outcome.decision,
    reasons: outcome.reasons,
  };
}

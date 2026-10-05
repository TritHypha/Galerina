export type NeuralTask =
  | "classification"
  | "generation"
  | "embedding"
  | "regression"
  | "segmentation"
  | "detection";

export type ActivationFunction =
  | "relu"
  | "gelu"
  | "sigmoid"
  | "tanh"
  | "softmax"
  | "linear";

export type LossFunction =
  | "cross_entropy"
  | "mean_squared_error"
  | "contrastive"
  | "custom";

export type OptimizerName = "sgd" | "adam" | "adamw" | "rmsprop" | "custom";

export interface TensorShapeRef {
  readonly dimensions: readonly number[];
}

export interface NeuralTensorRef {
  readonly elementType: string;
  readonly shape: TensorShapeRef;
}

export interface NeuralLayer {
  readonly name: string;
  readonly kind:
    | "dense"
    | "convolution"
    | "pooling"
    | "attention"
    | "embedding"
    | "normalization"
    | "dropout"
    | "custom";
  readonly input: NeuralTensorRef;
  readonly output: NeuralTensorRef;
  readonly activation?: ActivationFunction;
}

export interface NeuralModelDefinition {
  readonly name: string;
  readonly task: NeuralTask;
  readonly inputs: readonly NeuralTensorRef[];
  readonly outputs: readonly NeuralTensorRef[];
  readonly layers: readonly NeuralLayer[];
}

export interface NeuralInferencePlan {
  readonly flow: string;
  readonly model: string;
  readonly targetPreference: readonly string[];
  readonly maxMemoryBytes: number;
  readonly timeoutMs: number;
  readonly outputTrusted: false;
}

export interface NeuralTrainingPlan {
  readonly flow: string;
  readonly model: string;
  readonly dataset: string;
  readonly loss: LossFunction;
  readonly optimizer: OptimizerName;
  readonly epochs: number;
  readonly batchSize: number;
  readonly maxMemoryBytes: number;
  readonly timeoutMs: number;
  readonly dataPolicy: string;
}

export interface NeuralReport {
  readonly model: string;
  readonly task: NeuralTask;
  readonly inferencePlans: readonly NeuralInferencePlan[];
  readonly trainingPlans: readonly NeuralTrainingPlan[];
  readonly diagnostics: readonly NeuralDiagnostic[];
  readonly warnings: readonly string[];
}

export type NeuralDiagnosticSeverity = "warning" | "error";

export interface NeuralDiagnostic {
  readonly code: string;
  readonly severity: NeuralDiagnosticSeverity;
  readonly message: string;
  readonly path?: string;
}

export function validateNeuralTensor(
  tensor: NeuralTensorRef,
  path = "tensor",
): readonly NeuralDiagnostic[] {
  const diagnostics: NeuralDiagnostic[] = [];

  if (tensor.elementType.trim().length === 0) {
    diagnostics.push(createNeuralDiagnostic(
      "Galerina_NEURAL_TENSOR_ELEMENT_TYPE_REQUIRED",
      "error",
      "Neural tensor requires an element type.",
      `${path}.elementType`,
    ));
  }

  if (tensor.shape.dimensions.length === 0) {
    diagnostics.push(createNeuralDiagnostic(
      "Galerina_NEURAL_TENSOR_SHAPE_REQUIRED",
      "error",
      "Neural tensor requires at least one shape dimension.",
      `${path}.shape.dimensions`,
    ));
  }

  tensor.shape.dimensions.forEach((dimension, index) => {
    if (!Number.isSafeInteger(dimension) || dimension <= 0) {
      diagnostics.push(createNeuralDiagnostic(
        "Galerina_NEURAL_TENSOR_DIMENSION_INVALID",
        "error",
        "Neural tensor dimensions must be positive safe integers.",
        `${path}.shape.dimensions.${index}`,
      ));
    }
  });

  return diagnostics;
}

export function validateNeuralModel(
  model: NeuralModelDefinition,
): readonly NeuralDiagnostic[] {
  const diagnostics: NeuralDiagnostic[] = [];

  if (model.name.trim().length === 0) {
    diagnostics.push(createNeuralDiagnostic(
      "Galerina_NEURAL_MODEL_NAME_REQUIRED",
      "error",
      "Neural model requires a name.",
      "model.name",
    ));
  }

  model.inputs.forEach((tensor, index) => {
    diagnostics.push(...validateNeuralTensor(tensor, `model.inputs.${index}`));
  });
  model.outputs.forEach((tensor, index) => {
    diagnostics.push(...validateNeuralTensor(tensor, `model.outputs.${index}`));
  });

  return diagnostics;
}

export function isSameTensorShape(
  left: NeuralTensorRef,
  right: NeuralTensorRef,
): boolean {
  return (
    left.elementType === right.elementType &&
    left.shape.dimensions.length === right.shape.dimensions.length &&
    left.shape.dimensions.every(
      (dimension, index) => dimension === right.shape.dimensions[index],
    )
  );
}

export function createNeuralReport(input: {
  readonly model: NeuralModelDefinition;
  readonly inferencePlans?: readonly NeuralInferencePlan[];
  readonly trainingPlans?: readonly NeuralTrainingPlan[];
}): NeuralReport {
  const diagnostics = validateNeuralModel(input.model);

  return {
    model: input.model.name,
    task: input.model.task,
    inferencePlans: input.inferencePlans ?? [],
    trainingPlans: input.trainingPlans ?? [],
    diagnostics,
    warnings: diagnostics
      .filter((diagnostic) => diagnostic.severity === "warning")
      .map((diagnostic) => diagnostic.message),
  };
}

function createNeuralDiagnostic(
  code: string,
  severity: NeuralDiagnosticSeverity,
  message: string,
  path?: string,
): NeuralDiagnostic {
  return {
    code,
    severity,
    message,
    ...(path === undefined ? {} : { path }),
  };
}

// ---------------------------------------------------------------------------
// Inference result and confidence policy contracts (TODO row; zero-trust
// default, owner may revisit). A result is advisory only: it never carries
// authority, and anything not provably above the policy floor is refused.
// ---------------------------------------------------------------------------

export type NeuralConfidence =
  | { readonly kind: "scored"; readonly value: number }
  | { readonly kind: "unscored" };

export interface NeuralInferenceResult {
  readonly model: string;
  readonly outputs: readonly NeuralTensorRef[];
  readonly confidence: NeuralConfidence;
  readonly outputTrusted: false;
}

export interface NeuralConfidencePolicy {
  /** Inclusive floor in [0, 1]. */
  readonly minimumConfidence: number;
  /** Single-valued: a score below the floor is refused, never downgraded to a warning. */
  readonly onBelowMinimum: "refuse";
  /** Single-valued: a result without a score is refused. */
  readonly onUnscored: "refuse";
}

export const DEFAULT_NEURAL_CONFIDENCE_POLICY: NeuralConfidencePolicy = Object.freeze({
  minimumConfidence: 0.9,
  onBelowMinimum: "refuse",
  onUnscored: "refuse",
});

export type NeuralInferenceVerdict =
  | { readonly status: "ADMITTED_ADVISORY"; readonly authorityReleased: false; readonly diagnostics: readonly NeuralDiagnostic[] }
  | { readonly status: "REFUSED"; readonly authorityReleased: false; readonly diagnostics: readonly NeuralDiagnostic[] };

function isUnitInterval(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

export function validateNeuralConfidencePolicy(policy: NeuralConfidencePolicy): readonly NeuralDiagnostic[] {
  const diagnostics: NeuralDiagnostic[] = [];
  if (!isUnitInterval(policy.minimumConfidence)) {
    diagnostics.push(createNeuralDiagnostic("Galerina_NEURAL_CONFIDENCE_POLICY_FLOOR_INVALID", "error", "Confidence floor must be a finite number in [0, 1].", "policy.minimumConfidence"));
  }
  if (policy.onBelowMinimum !== "refuse") {
    diagnostics.push(createNeuralDiagnostic("Galerina_NEURAL_CONFIDENCE_POLICY_ACTION_INVALID", "error", "Below-floor results can only be refused.", "policy.onBelowMinimum"));
  }
  if (policy.onUnscored !== "refuse") {
    diagnostics.push(createNeuralDiagnostic("Galerina_NEURAL_CONFIDENCE_POLICY_ACTION_INVALID", "error", "Unscored results can only be refused.", "policy.onUnscored"));
  }
  return diagnostics;
}

export function evaluateNeuralInferenceResult(
  result: NeuralInferenceResult,
  expectedOutputs: readonly NeuralTensorRef[],
  policy: NeuralConfidencePolicy = DEFAULT_NEURAL_CONFIDENCE_POLICY,
): NeuralInferenceVerdict {
  const diagnostics: NeuralDiagnostic[] = [...validateNeuralConfidencePolicy(policy)];
  if (result.outputTrusted !== false) {
    diagnostics.push(createNeuralDiagnostic("Galerina_NEURAL_RESULT_TRUST_CLAIM", "error", "Inference output can never be marked trusted.", "result.outputTrusted"));
  }
  if (result.outputs.length !== expectedOutputs.length
    || !result.outputs.every((tensor, index) => index < expectedOutputs.length && isSameTensorShape(tensor, expectedOutputs[index]!))) {
    diagnostics.push(createNeuralDiagnostic("Galerina_NEURAL_RESULT_SHAPE_MISMATCH", "error", "Inference outputs must match the model's declared output tensors exactly.", "result.outputs"));
  }
  const confidence = result.confidence;
  if (confidence.kind === "unscored") {
    diagnostics.push(createNeuralDiagnostic("Galerina_NEURAL_RESULT_UNSCORED", "error", "Unscored inference results are refused.", "result.confidence"));
  } else if (confidence.kind !== "scored" || !isUnitInterval(confidence.value)) {
    diagnostics.push(createNeuralDiagnostic("Galerina_NEURAL_RESULT_CONFIDENCE_INVALID", "error", "Confidence must be a finite number in [0, 1].", "result.confidence.value"));
  } else if (isUnitInterval(policy.minimumConfidence) && confidence.value < policy.minimumConfidence) {
    diagnostics.push(createNeuralDiagnostic("Galerina_NEURAL_RESULT_BELOW_CONFIDENCE_FLOOR", "error", "Confidence is below the policy floor.", "result.confidence.value"));
  }
  const frozen = Object.freeze(diagnostics);
  return diagnostics.some((diagnostic) => diagnostic.severity === "error")
    ? Object.freeze({ status: "REFUSED", authorityReleased: false, diagnostics: frozen })
    : Object.freeze({ status: "ADMITTED_ADVISORY", authorityReleased: false, diagnostics: frozen });
}

// ---------------------------------------------------------------------------
// Training data policy contracts. A training plan may only name a data policy
// that is registered, digest-pinned and lawful for personal data.
// ---------------------------------------------------------------------------

export type NeuralDatasetProvenance = "owner-supplied" | "licensed" | "public-domain" | "synthetic";
export type NeuralPersonalDataBasis = "no-personal-data" | "consent-recorded" | "contract-recorded";

export interface NeuralTrainingDataPolicy {
  readonly id: string;
  readonly dataset: string;
  readonly provenance: NeuralDatasetProvenance;
  /** SPDX identifier or an owner licence reference; required for every provenance. */
  readonly licence: string;
  /** "sha256:" followed by 64 lowercase hex characters. */
  readonly datasetDigest: string;
  readonly containsPersonalData: boolean;
  readonly personalDataBasis: NeuralPersonalDataBasis;
  readonly maxRecords: number;
}

const NEURAL_PROVENANCE: ReadonlySet<string> = new Set(["owner-supplied", "licensed", "public-domain", "synthetic"]);
const NEURAL_PERSONAL_DATA_BASIS: ReadonlySet<string> = new Set(["no-personal-data", "consent-recorded", "contract-recorded"]);
const SHA256_DIGEST = /^sha256:[0-9a-f]{64}$/u;
const POLICY_ID = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+){0,7}$/u;

export function validateNeuralTrainingDataPolicy(policy: NeuralTrainingDataPolicy, path = "dataPolicy"): readonly NeuralDiagnostic[] {
  const diagnostics: NeuralDiagnostic[] = [];
  const fail = (code: string, message: string, field: string) => diagnostics.push(createNeuralDiagnostic(code, "error", message, `${path}.${field}`));
  if (typeof policy.id !== "string" || !POLICY_ID.test(policy.id)) fail("Galerina_NEURAL_DATA_POLICY_ID_INVALID", "Data policy id must be a lowercase dotted token.", "id");
  if (typeof policy.dataset !== "string" || policy.dataset.trim().length === 0) fail("Galerina_NEURAL_DATA_POLICY_DATASET_REQUIRED", "Data policy requires a dataset name.", "dataset");
  if (!NEURAL_PROVENANCE.has(policy.provenance)) fail("Galerina_NEURAL_DATA_POLICY_PROVENANCE_UNKNOWN", "Dataset provenance is not one of the closed set.", "provenance");
  if (typeof policy.licence !== "string" || policy.licence.trim().length === 0) fail("Galerina_NEURAL_DATA_POLICY_LICENCE_REQUIRED", "Every dataset needs a recorded licence.", "licence");
  if (typeof policy.datasetDigest !== "string" || !SHA256_DIGEST.test(policy.datasetDigest)) fail("Galerina_NEURAL_DATA_POLICY_DIGEST_INVALID", "Dataset digest must be sha256:<64 lowercase hex>.", "datasetDigest");
  if (typeof policy.containsPersonalData !== "boolean") fail("Galerina_NEURAL_DATA_POLICY_PERSONAL_DATA_FLAG", "containsPersonalData must be an explicit boolean.", "containsPersonalData");
  if (!NEURAL_PERSONAL_DATA_BASIS.has(policy.personalDataBasis)) {
    fail("Galerina_NEURAL_DATA_POLICY_BASIS_UNKNOWN", "Personal-data basis is not one of the closed set.", "personalDataBasis");
  } else if (policy.containsPersonalData === true && policy.personalDataBasis === "no-personal-data") {
    fail("Galerina_NEURAL_DATA_POLICY_BASIS_REQUIRED", "Personal data requires a recorded consent or contract basis.", "personalDataBasis");
  } else if (policy.containsPersonalData === false && policy.personalDataBasis !== "no-personal-data") {
    fail("Galerina_NEURAL_DATA_POLICY_BASIS_CONTRADICTION", "A basis is recorded for data declared free of personal data.", "personalDataBasis");
  }
  if (!Number.isSafeInteger(policy.maxRecords) || policy.maxRecords <= 0) fail("Galerina_NEURAL_DATA_POLICY_MAX_RECORDS_INVALID", "maxRecords must be a positive safe integer.", "maxRecords");
  return diagnostics;
}

export function validateNeuralTrainingPlanDataPolicy(
  plan: NeuralTrainingPlan,
  policies: readonly NeuralTrainingDataPolicy[],
): readonly NeuralDiagnostic[] {
  const diagnostics: NeuralDiagnostic[] = [];
  const ids = new Set<string>();
  policies.forEach((policy, index) => {
    diagnostics.push(...validateNeuralTrainingDataPolicy(policy, `policies.${index}`));
    if (ids.has(policy.id)) diagnostics.push(createNeuralDiagnostic("Galerina_NEURAL_DATA_POLICY_DUPLICATE", "error", "Data policy ids must be unique.", `policies.${index}.id`));
    ids.add(policy.id);
  });
  const matches = policies.filter((policy) => policy.id === plan.dataPolicy);
  if (matches.length !== 1) {
    diagnostics.push(createNeuralDiagnostic("Galerina_NEURAL_DATA_POLICY_UNREGISTERED", "error", "Training plan names a data policy that is not registered exactly once.", "plan.dataPolicy"));
  } else if (matches[0]!.dataset !== plan.dataset) {
    diagnostics.push(createNeuralDiagnostic("Galerina_NEURAL_DATA_POLICY_DATASET_MISMATCH", "error", "Training plan dataset differs from its data policy dataset.", "plan.dataset"));
  }
  return diagnostics;
}

// ---------------------------------------------------------------------------
// Model verification and loading contracts. Verification compares an observed
// digest and size against a pinned reference; it never reads, deserialises or
// executes model bytes. Pickle-style formats are not representable.
// ---------------------------------------------------------------------------

export type NeuralModelFormat = "onnx" | "safetensors" | "gguf";

export interface NeuralModelArtifactRef {
  readonly model: string;
  readonly format: NeuralModelFormat;
  /** "sha256:" followed by 64 lowercase hex characters. */
  readonly sha256: string;
  readonly byteLength: number;
}

export interface NeuralModelLoadPolicy {
  readonly allowedFormats: readonly NeuralModelFormat[];
  readonly maxBytes: number;
}

export const DEFAULT_NEURAL_MODEL_LOAD_POLICY: NeuralModelLoadPolicy = Object.freeze({
  allowedFormats: Object.freeze(["safetensors", "onnx"] as const),
  maxBytes: 4 * 1024 * 1024 * 1024,
});

export interface NeuralObservedArtifact {
  readonly sha256: string;
  readonly byteLength: number;
}

export type NeuralModelVerification =
  | { readonly status: "VERIFIED_NOT_LOADED"; readonly loadAuthorized: false; readonly diagnostics: readonly NeuralDiagnostic[] }
  | { readonly status: "REFUSED"; readonly loadAuthorized: false; readonly diagnostics: readonly NeuralDiagnostic[] };

const NEURAL_MODEL_FORMATS: ReadonlySet<string> = new Set(["onnx", "safetensors", "gguf"]);

export function verifyNeuralModelArtifact(
  reference: NeuralModelArtifactRef,
  observed: NeuralObservedArtifact,
  policy: NeuralModelLoadPolicy = DEFAULT_NEURAL_MODEL_LOAD_POLICY,
): NeuralModelVerification {
  const diagnostics: NeuralDiagnostic[] = [];
  const fail = (code: string, message: string, field: string) => diagnostics.push(createNeuralDiagnostic(code, "error", message, field));
  if (typeof reference.model !== "string" || reference.model.trim().length === 0) fail("Galerina_NEURAL_ARTIFACT_MODEL_REQUIRED", "Artifact must name its model.", "reference.model");
  if (!NEURAL_MODEL_FORMATS.has(reference.format)) fail("Galerina_NEURAL_ARTIFACT_FORMAT_UNKNOWN", "Artifact format is not one of the closed set.", "reference.format");
  else if (!policy.allowedFormats.includes(reference.format)) fail("Galerina_NEURAL_ARTIFACT_FORMAT_DENIED", "Artifact format is not allowed by the load policy.", "reference.format");
  if (typeof reference.sha256 !== "string" || !SHA256_DIGEST.test(reference.sha256)) fail("Galerina_NEURAL_ARTIFACT_DIGEST_INVALID", "Pinned digest must be sha256:<64 lowercase hex>.", "reference.sha256");
  if (!Number.isSafeInteger(reference.byteLength) || reference.byteLength <= 0) fail("Galerina_NEURAL_ARTIFACT_SIZE_INVALID", "Pinned byteLength must be a positive safe integer.", "reference.byteLength");
  else if (!Number.isSafeInteger(policy.maxBytes) || policy.maxBytes <= 0 || reference.byteLength > policy.maxBytes) fail("Galerina_NEURAL_ARTIFACT_TOO_LARGE", "Artifact exceeds the load policy size ceiling.", "reference.byteLength");
  if (typeof observed.sha256 !== "string" || !SHA256_DIGEST.test(observed.sha256) || observed.sha256 !== reference.sha256) fail("Galerina_NEURAL_ARTIFACT_DIGEST_MISMATCH", "Observed digest does not equal the pinned digest.", "observed.sha256");
  if (observed.byteLength !== reference.byteLength) fail("Galerina_NEURAL_ARTIFACT_SIZE_MISMATCH", "Observed size does not equal the pinned size.", "observed.byteLength");
  const frozen = Object.freeze(diagnostics);
  return diagnostics.length === 0
    ? Object.freeze({ status: "VERIFIED_NOT_LOADED", loadAuthorized: false, diagnostics: frozen })
    : Object.freeze({ status: "REFUSED", loadAuthorized: false, diagnostics: frozen });
}

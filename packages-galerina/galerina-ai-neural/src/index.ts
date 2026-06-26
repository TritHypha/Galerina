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

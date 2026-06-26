export interface VectorDimension {
  readonly lanes: number;
}

export type NumericElementType =
  | "Float16"
  | "Float32"
  | "Float64"
  | "Int8"
  | "Int16"
  | "Int32"
  | "UInt8"
  | "LowBit"
  | "Quantized";

export interface VectorType {
  readonly elementType: string;
  readonly dimension: VectorDimension;
}

export interface MatrixShape {
  readonly rows: number;
  readonly columns: number;
}

export interface MatrixType {
  readonly elementType: NumericElementType | string;
  readonly shape: MatrixShape;
}

export interface TensorShape {
  readonly dimensions: readonly number[];
}

export interface TensorType {
  readonly elementType: NumericElementType | string;
  readonly shape: TensorShape;
}

export interface QuantizedType {
  readonly sourceElementType: NumericElementType | string;
  readonly bits: number;
  readonly scheme: "symmetric" | "asymmetric" | "ternary" | "low-bit";
}

export interface VectorOperation {
  readonly name: string;
  readonly inputs: readonly VectorType[];
  readonly output: VectorType;
}

export interface TensorOperation {
  readonly name: string;
  readonly inputs: readonly TensorType[];
  readonly output: TensorType;
  readonly pure: boolean;
}

export interface VectorReport {
  readonly operations: readonly VectorOperation[];
  readonly tensorOperations?: readonly TensorOperation[];
  readonly diagnostics: readonly VectorDiagnostic[];
  readonly warnings: readonly string[];
}

export type VectorDiagnosticSeverity = "warning" | "error";

export interface VectorDiagnostic {
  readonly code: string;
  readonly severity: VectorDiagnosticSeverity;
  readonly message: string;
  readonly path?: string;
}

export function defineVectorType(
  elementType: NumericElementType | string,
  lanes: number,
): VectorType {
  const vector = { elementType, dimension: { lanes } };
  const diagnostics = validateVectorType(vector);

  if (diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
    throw new Error(diagnostics.map((diagnostic) => diagnostic.message).join(" "));
  }

  return vector;
}

export function validateVectorType(
  vector: VectorType,
  path = "vector",
): readonly VectorDiagnostic[] {
  const diagnostics: VectorDiagnostic[] = [];

  if (vector.elementType.trim().length === 0) {
    diagnostics.push(createVectorDiagnostic(
      "Galerina_VECTOR_ELEMENT_TYPE_REQUIRED",
      "error",
      "Vector element type is required.",
      `${path}.elementType`,
    ));
  }

  if (!isPositiveSafeInteger(vector.dimension.lanes)) {
    diagnostics.push(createVectorDiagnostic(
      "Galerina_VECTOR_LANES_INVALID",
      "error",
      "Vector lane count must be a positive safe integer.",
      `${path}.dimension.lanes`,
    ));
  }

  return diagnostics;
}

export function validateMatrixType(
  matrix: MatrixType,
  path = "matrix",
): readonly VectorDiagnostic[] {
  const diagnostics: VectorDiagnostic[] = [];

  if (!isPositiveSafeInteger(matrix.shape.rows)) {
    diagnostics.push(createVectorDiagnostic(
      "Galerina_MATRIX_ROWS_INVALID",
      "error",
      "Matrix rows must be a positive safe integer.",
      `${path}.shape.rows`,
    ));
  }

  if (!isPositiveSafeInteger(matrix.shape.columns)) {
    diagnostics.push(createVectorDiagnostic(
      "Galerina_MATRIX_COLUMNS_INVALID",
      "error",
      "Matrix columns must be a positive safe integer.",
      `${path}.shape.columns`,
    ));
  }

  return diagnostics;
}

export function validateTensorType(
  tensor: TensorType,
  path = "tensor",
): readonly VectorDiagnostic[] {
  if (tensor.shape.dimensions.length === 0) {
    return [
      createVectorDiagnostic(
        "Galerina_TENSOR_DIMENSIONS_REQUIRED",
        "error",
        "Tensor shape requires at least one dimension.",
        `${path}.shape.dimensions`,
      ),
    ];
  }

  return tensor.shape.dimensions.flatMap((dimension, index) =>
    isPositiveSafeInteger(dimension)
      ? []
      : [
          createVectorDiagnostic(
            "Galerina_TENSOR_DIMENSION_INVALID",
            "error",
            "Tensor dimensions must be positive safe integers.",
            `${path}.shape.dimensions.${index}`,
          ),
        ],
  );
}

export function validateVectorOperation(
  operation: VectorOperation,
): readonly VectorDiagnostic[] {
  const diagnostics: VectorDiagnostic[] = [];

  if (operation.name.trim().length === 0) {
    diagnostics.push(createVectorDiagnostic(
      "Galerina_VECTOR_OPERATION_NAME_REQUIRED",
      "error",
      "Vector operation requires a name.",
      "operation.name",
    ));
  }

  operation.inputs.forEach((input, index) => {
    diagnostics.push(...validateVectorType(input, `operation.inputs.${index}`));
  });
  diagnostics.push(...validateVectorType(operation.output, "operation.output"));

  const mismatchedInput = operation.inputs.find(
    (input) =>
      input.dimension.lanes !== operation.output.dimension.lanes ||
      input.elementType !== operation.output.elementType,
  );

  if (mismatchedInput !== undefined) {
    diagnostics.push(createVectorDiagnostic(
      "Galerina_VECTOR_OPERATION_SHAPE_MISMATCH",
      "error",
      "Vector operation inputs must match the output element type and lane count.",
      "operation.inputs",
    ));
  }

  return diagnostics;
}

export function validateTensorOperation(
  operation: TensorOperation,
): readonly VectorDiagnostic[] {
  const diagnostics: VectorDiagnostic[] = [];

  if (operation.name.trim().length === 0) {
    diagnostics.push(createVectorDiagnostic(
      "Galerina_TENSOR_OPERATION_NAME_REQUIRED",
      "error",
      "Tensor operation requires a name.",
      "operation.name",
    ));
  }

  operation.inputs.forEach((input, index) => {
    diagnostics.push(...validateTensorType(input, `operation.inputs.${index}`));
  });
  diagnostics.push(...validateTensorType(operation.output, "operation.output"));

  return diagnostics;
}

export function createVectorReport(input: {
  readonly operations?: readonly VectorOperation[];
  readonly tensorOperations?: readonly TensorOperation[];
} = {}): VectorReport {
  const operations = input.operations ?? [];
  const tensorOperations = input.tensorOperations ?? [];
  const diagnostics = [
    ...operations.flatMap((operation) => validateVectorOperation(operation)),
    ...tensorOperations.flatMap((operation) =>
      validateTensorOperation(operation),
    ),
  ];

  return {
    operations,
    tensorOperations,
    diagnostics,
    warnings: diagnostics
      .filter((diagnostic) => diagnostic.severity === "warning")
      .map((diagnostic) => diagnostic.message),
  };
}

function createVectorDiagnostic(
  code: string,
  severity: VectorDiagnosticSeverity,
  message: string,
  path?: string,
): VectorDiagnostic {
  return {
    code,
    severity,
    message,
    ...(path === undefined ? {} : { path }),
  };
}

function isPositiveSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

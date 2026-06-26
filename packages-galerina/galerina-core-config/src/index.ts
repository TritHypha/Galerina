/**
 * Canonical environment mode constants for the Galerina platform.
 *
 * EnvironmentMode is owned by this package (@galerina/core-config).
 * All other packages that need EnvironmentMode should import from here.
 * Once workspace links are established this will be a direct package import.
 */
import {
  resolveProjectGovernance,
  GOVERNANCE_MODES,
  type GovernanceMode,
} from "./governance.js";
export const GALERINA_ENVIRONMENT_MODES = [
  "development",
  "test",
  "staging",
  "production",
] as const;

export type EnvironmentMode = (typeof GALERINA_ENVIRONMENT_MODES)[number];

// #195 — OS/HW-compromised security posture (off|auto|on, default auto, fail-secure).
export * from "./posture.js";

// JOB 0011 (a) — project governance ceiling (full|auto|lean, default full, fail-closed).
export * from "./governance.js";

/**
 * Diagnostic severity levels for config diagnostics.
 * Structurally compatible with DiagnosticSeverity in @galerina/core.
 */
export type ConfigDiagnosticSeverity = "info" | "warning" | "error";

/**
 * Diagnostic produced by config validation functions.
 * Structurally compatible with BaseDiagnostic in @galerina/core.
 * Additional fields: path (config key), suggestedFix (human-readable fix hint).
 */
export interface ConfigDiagnostic {
  /** Structured diagnostic code in SPORE-SERIES-NNN format. */
  readonly code: string;
  /** Screaming-snake-case name. Example: "REQUIRED_ENVIRONMENT_VARIABLE_MISSING". */
  readonly name: string;
  readonly severity: ConfigDiagnosticSeverity;
  readonly message: string;
  /** Dot-path to the config key that triggered the diagnostic. */
  readonly path?: string;
  /** Human-readable fix suggestion. */
  readonly suggestedFix?: string;
}

export interface ProjectPackageReference {
  readonly path: string;
  readonly role?: string;
}

export interface ProductionPackageOverride {
  readonly path: string;
  readonly reason: string;
  readonly expires?: string;
}

export type ConfigPathMap = Readonly<Record<string, string>>;

export interface ProjectConfig {
  readonly name: string;
  readonly version: string;
  readonly root: string;
  readonly entryFiles: readonly string[];
  readonly packages: readonly ProjectPackageReference[];
  readonly strict: boolean;
  /** Governance ceiling — full|auto|lean, default full (secure pole). JOB 0011 (a). */
  readonly governance: GovernanceMode;
  readonly targets: readonly string[];
  readonly defaultPackage?: string;
  readonly productionPackageOverrides: readonly ProductionPackageOverride[];
  readonly docs?: ConfigPathMap;
  readonly tools?: ConfigPathMap;
}

export type EnvironmentVariableScope =
  | "build"
  | "deployment"
  | "runtime"
  | "test";

export interface EnvironmentVariableReference {
  readonly kind: "env";
  readonly name: string;
  readonly required: boolean;
  readonly secret: boolean;
  readonly scope: EnvironmentVariableScope;
  readonly defaultValue?: string;
  readonly description?: string;
}

export interface EnvironmentConfig {
  readonly mode: EnvironmentMode;
  readonly variables: readonly EnvironmentVariableReference[];
  readonly secrets: readonly EnvironmentVariableReference[];
}

export interface ProductionStrictnessPolicy {
  readonly requireStrictProject: boolean;
  readonly allowDefaultedSecrets: boolean;
  readonly allowMissingRequiredVariables: boolean;
  readonly requireRuntimeHandoffValidation: boolean;
  readonly disabledPackagePatterns: readonly string[];
  readonly allowProductionPackageOverrides: boolean;
  readonly maxWarnings: number;
}

export interface RuntimeConfigHandoff {
  readonly project: ProjectConfig;
  readonly environment: EnvironmentConfig;
  readonly productionPolicy: ProductionStrictnessPolicy;
  readonly activeProductionPackageOverrides: readonly ProductionPackageOverride[];
  readonly diagnostics: readonly ConfigDiagnostic[];
  readonly canRun: boolean;
  readonly generatedAt: string;
}

export interface ConfigLoadResult {
  readonly project?: ProjectConfig;
  readonly environment?: EnvironmentConfig;
  readonly productionPolicy?: ProductionStrictnessPolicy;
  readonly runtime?: RuntimeConfigHandoff;
  readonly diagnostics: readonly ConfigDiagnostic[];
}

export interface RuntimeConfigHandoffOptions {
  readonly generatedAt?: string;
  readonly availableEnvironment?: Readonly<Record<string, string | undefined>>;
  readonly diagnostics?: readonly ConfigDiagnostic[];
  readonly productionPolicy?: Partial<ProductionStrictnessPolicy>;
}

export interface HostPackageManifestBoundaryPolicy {
  readonly manifestPath: string;
  readonly forbiddenLoKeys: readonly string[];
  readonly dependencyFields: readonly string[];
}

const ENVIRONMENT_MODE_SET: ReadonlySet<string> = new Set(GALERINA_ENVIRONMENT_MODES);

const ENVIRONMENT_VARIABLE_SCOPES: readonly EnvironmentVariableScope[] = [
  "build",
  "deployment",
  "runtime",
  "test",
];

const ENVIRONMENT_VARIABLE_SCOPE_SET: ReadonlySet<string> = new Set(
  ENVIRONMENT_VARIABLE_SCOPES,
);

const ENVIRONMENT_VARIABLE_NAME_PATTERN = /^[A-Z_][A-Z0-9_]*$/;

export const DEFAULT_HOST_PACKAGE_MANIFEST_BOUNDARY_POLICY: HostPackageManifestBoundaryPolicy =
  {
    manifestPath: "package.json",
    forbiddenLoKeys: [
      "Galerina",
      "loPackages",
      "loDependencies",
      "loProfiles",
      "loTargets",
      "packageLo",
      "package-Galerina",
      "loLock",
      "Galerina.lock",
      "productionPackageOverrides",
    ],
    dependencyFields: [
      "dependencies",
      "devDependencies",
      "optionalDependencies",
      "peerDependencies",
    ],
  };

export const DEFAULT_PRODUCTION_STRICTNESS_POLICY: ProductionStrictnessPolicy =
  {
    requireStrictProject: true,
    allowDefaultedSecrets: false,
    allowMissingRequiredVariables: false,
    requireRuntimeHandoffValidation: true,
    disabledPackagePatterns: [
      "packages-galerina/galerina-tools-benchmark",
      "packages-galerina/galerina-devtools-",
    ],
    allowProductionPackageOverrides: true,
    maxWarnings: 0,
  };

export function isEnvironmentMode(value: string): value is EnvironmentMode {
  return ENVIRONMENT_MODE_SET.has(value);
}

export function createConfigDiagnostic(
  code: string,
  name: string,
  severity: ConfigDiagnosticSeverity,
  message: string,
  path?: string,
  suggestedFix?: string,
): ConfigDiagnostic {
  return {
    code,
    name,
    severity,
    message,
    ...(path === undefined ? {} : { path }),
    ...(suggestedFix === undefined ? {} : { suggestedFix }),
  };
}

export function resolveEnvironmentMode(
  value: unknown,
  fallback: EnvironmentMode = "development",
): Pick<EnvironmentConfig, "mode"> & {
  readonly diagnostics: readonly ConfigDiagnostic[];
} {
  if (typeof value === "string" && isEnvironmentMode(value)) {
    return { mode: value, diagnostics: [] };
  }

  if (typeof value === "string") {
    return {
      mode: fallback,
      diagnostics: [
        createConfigDiagnostic(
          "SPORE-CONFIG-001",
          "INVALID_ENVIRONMENT_MODE",
          "error",
          `Unsupported environment mode "${value}".`,
          "environment.mode",
          `Use one of: ${GALERINA_ENVIRONMENT_MODES.join(", ")}.`,
        ),
      ],
    };
  }

  return {
    mode: fallback,
    diagnostics: [
      createConfigDiagnostic(
        "SPORE-CONFIG-002",
        "MISSING_ENVIRONMENT_MODE",
        "warning",
        `Environment mode was not set; using "${fallback}".`,
        "environment.mode",
      ),
    ],
  };
}

export function defineProductionStrictnessPolicy(
  policy: Partial<ProductionStrictnessPolicy> = {},
): ProductionStrictnessPolicy {
  return {
    requireStrictProject:
      policy.requireStrictProject ??
      DEFAULT_PRODUCTION_STRICTNESS_POLICY.requireStrictProject,
    allowDefaultedSecrets:
      policy.allowDefaultedSecrets ??
      DEFAULT_PRODUCTION_STRICTNESS_POLICY.allowDefaultedSecrets,
    allowMissingRequiredVariables:
      policy.allowMissingRequiredVariables ??
      DEFAULT_PRODUCTION_STRICTNESS_POLICY.allowMissingRequiredVariables,
    requireRuntimeHandoffValidation:
      policy.requireRuntimeHandoffValidation ??
      DEFAULT_PRODUCTION_STRICTNESS_POLICY.requireRuntimeHandoffValidation,
    disabledPackagePatterns:
      policy.disabledPackagePatterns ??
      DEFAULT_PRODUCTION_STRICTNESS_POLICY.disabledPackagePatterns,
    allowProductionPackageOverrides:
      policy.allowProductionPackageOverrides ??
      DEFAULT_PRODUCTION_STRICTNESS_POLICY.allowProductionPackageOverrides,
    maxWarnings:
      policy.maxWarnings ?? DEFAULT_PRODUCTION_STRICTNESS_POLICY.maxWarnings,
  };
}

export function parseProjectConfig(
  input: unknown,
): Pick<ConfigLoadResult, "project" | "diagnostics"> {
  const diagnostics: ConfigDiagnostic[] = [];

  if (!isRecord(input)) {
    return {
      diagnostics: [
        createConfigDiagnostic(
          "SPORE-CONFIG-003",
          "PROJECT_NOT_OBJECT",
          "error",
          "Project config must be an object.",
          "project",
        ),
      ],
    };
  }

  const name = readRequiredString(input, "name", diagnostics);
  const version = readRequiredString(input, "version", diagnostics);
  const root = readOptionalString(input, "root") ?? ".";
  const entryFiles = readStringArray(input, "entryFiles", diagnostics);
  const packages = readPackageReferences(input, "packages", diagnostics);
  const strict = readOptionalBoolean(input, "strict") ?? true;
  const governanceResolved = resolveProjectGovernance(input["governance"]);
  if (governanceResolved.invalid) {
    diagnostics.push(
      createConfigDiagnostic(
        "SPORE-CONFIG-GOV-003",
        "INVALID_GOVERNANCE_MODE",
        "error",
        `Unsupported governance mode "${String(governanceResolved.requested)}" — forcing 'full' (fail-closed).`,
        "project.governance",
        `Use one of: ${GOVERNANCE_MODES.join(", ")}.`,
      ),
    );
  }
  const targets = readStringArray(input, "targets", diagnostics);
  const defaultPackage = readOptionalString(input, "defaultPackage");
  const productionPackageOverrides = readProductionPackageOverrides(
    input["production"],
    "production.packageOverrides",
    diagnostics,
  );
  const docs = readStringMap(input, "docs", diagnostics);
  const tools = readStringMap(input, "tools", diagnostics);

  if (name === undefined || version === undefined) {
    return { diagnostics };
  }

  const project: ProjectConfig = {
    name,
    version,
    root,
    entryFiles,
    packages,
    strict,
    governance: governanceResolved.mode,
    targets,
    productionPackageOverrides,
    ...(defaultPackage === undefined ? {} : { defaultPackage }),
    ...(docs === undefined ? {} : { docs }),
    ...(tools === undefined ? {} : { tools }),
  };

  return { project, diagnostics };
}

export function defineEnvironmentVariableReference(
  name: string,
  options: {
    readonly required?: boolean;
    readonly secret?: boolean;
    readonly scope?: EnvironmentVariableScope;
    readonly defaultValue?: string;
    readonly description?: string;
  } = {},
): EnvironmentVariableReference {
  return {
    kind: "env",
    name,
    required: options.required ?? true,
    secret: options.secret ?? false,
    scope: options.scope ?? "runtime",
    ...(options.defaultValue === undefined
      ? {}
      : { defaultValue: options.defaultValue }),
    ...(options.description === undefined
      ? {}
      : { description: options.description }),
  };
}

export function parseEnvironmentConfig(
  input: unknown,
): Pick<ConfigLoadResult, "environment" | "diagnostics"> {
  const diagnostics: ConfigDiagnostic[] = [];

  if (!isRecord(input)) {
    const modeResult = resolveEnvironmentMode(input);
    return {
      environment: { mode: modeResult.mode, variables: [], secrets: [] },
      diagnostics: modeResult.diagnostics,
    };
  }

  const modeResult = resolveEnvironmentMode(input["mode"]);
  diagnostics.push(...modeResult.diagnostics);

  const variableRefs = readEnvironmentVariableReferences(
    input["variables"],
    "environment.variables",
    false,
    diagnostics,
  );
  const secretRefs = readEnvironmentVariableReferences(
    input["secrets"],
    "environment.secrets",
    true,
    diagnostics,
  );

  return {
    environment: {
      mode: modeResult.mode,
      variables: variableRefs,
      secrets: secretRefs,
    },
    diagnostics,
  };
}

export function validateRuntimeEnvironment(
  environment: EnvironmentConfig,
  availableEnvironment: Readonly<Record<string, string | undefined>>,
  policy: ProductionStrictnessPolicy = DEFAULT_PRODUCTION_STRICTNESS_POLICY,
): readonly ConfigDiagnostic[] {
  const diagnostics: ConfigDiagnostic[] = [];
  const references = [...environment.variables, ...environment.secrets];

  for (const reference of references) {
    const value = availableEnvironment[reference.name];
    if (reference.required && (value === undefined || value === "")) {
      const severity =
        environment.mode === "production" &&
        !policy.allowMissingRequiredVariables
          ? "error"
          : "warning";
      diagnostics.push(
        createConfigDiagnostic(
          "SPORE-CONFIG-004",
          "REQUIRED_ENVIRONMENT_VARIABLE_MISSING",
          severity,
          `Required environment variable "${reference.name}" is missing.`,
          `environment.${reference.secret ? "secrets" : "variables"}.${reference.name}`,
        ),
      );
    }
  }

  return diagnostics;
}

export function createRuntimeConfigHandoff(
  project: ProjectConfig,
  environment: EnvironmentConfig,
  options: RuntimeConfigHandoffOptions = {},
): RuntimeConfigHandoff {
  const productionPolicy = defineProductionStrictnessPolicy(
    options.productionPolicy,
  );
  const diagnostics: ConfigDiagnostic[] = [...(options.diagnostics ?? [])];

  diagnostics.push(
    ...validateProductionStrictness(project, environment, productionPolicy),
  );
  const activeProductionPackageOverrides =
    environment.mode === "production" ? project.productionPackageOverrides : [];

  if (
    environment.mode === "production" &&
    productionPolicy.requireRuntimeHandoffValidation &&
    options.availableEnvironment === undefined
  ) {
    diagnostics.push(
      createConfigDiagnostic(
        "SPORE-CONFIG-005",
        "PRODUCTION_REQUIRES_ENVIRONMENT_VALIDATION",
        "error",
        "Production config handoff requires environment variable presence validation.",
        "environment",
      ),
    );
  }

  if (options.availableEnvironment !== undefined) {
    diagnostics.push(
      ...validateRuntimeEnvironment(
        environment,
        options.availableEnvironment,
        productionPolicy,
      ),
    );
  }

  const warningCount = diagnostics.filter(
    (diagnostic) => diagnostic.severity === "warning",
  ).length;
  const hasError = diagnostics.some(
    (diagnostic) => diagnostic.severity === "error",
  );
  const warningsAllowed =
    environment.mode !== "production" ||
    warningCount <= productionPolicy.maxWarnings;

  return {
    project,
    environment,
    productionPolicy,
    activeProductionPackageOverrides,
    diagnostics,
    canRun: !hasError && warningsAllowed,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
  };
}

export function loadConfigFromObjects(input: {
  readonly project: unknown;
  readonly environment?: unknown;
  readonly availableEnvironment?: Readonly<Record<string, string | undefined>>;
  readonly productionPolicy?: Partial<ProductionStrictnessPolicy>;
  readonly generatedAt?: string;
}): ConfigLoadResult {
  const projectResult = parseProjectConfig(input.project);
  const environmentResult = parseEnvironmentConfig(input.environment);
  const diagnostics = [
    ...projectResult.diagnostics,
    ...environmentResult.diagnostics,
  ];

  const productionPolicy = defineProductionStrictnessPolicy(
    input.productionPolicy,
  );

  if (
    projectResult.project === undefined ||
    environmentResult.environment === undefined
  ) {
    return { productionPolicy, diagnostics };
  }

  const runtime = createRuntimeConfigHandoff(
    projectResult.project,
    environmentResult.environment,
    {
      diagnostics,
      productionPolicy,
      ...(input.availableEnvironment === undefined
        ? {}
        : { availableEnvironment: input.availableEnvironment }),
      ...(input.generatedAt === undefined
        ? {}
        : { generatedAt: input.generatedAt }),
    },
  );

  return {
    project: projectResult.project,
    environment: environmentResult.environment,
    productionPolicy,
    runtime,
    diagnostics: runtime.diagnostics,
  };
}

export function validateHostPackageManifestBoundary(
  input: unknown,
  policy: HostPackageManifestBoundaryPolicy =
    DEFAULT_HOST_PACKAGE_MANIFEST_BOUNDARY_POLICY,
): readonly ConfigDiagnostic[] {
  if (!isRecord(input)) {
    return [
      createConfigDiagnostic(
        "SPORE-CONFIG-006",
        "HOST_PACKAGE_MANIFEST_NOT_OBJECT",
        "error",
        "Host package manifest must be an object.",
        policy.manifestPath,
      ),
    ];
  }

  const diagnostics: ConfigDiagnostic[] = [];

  for (const key of policy.forbiddenLoKeys) {
    if (Object.hasOwn(input, key)) {
      diagnostics.push(
        createConfigDiagnostic(
          "SPORE-CONFIG-007",
          "GALERINA_KEY_IN_HOST_MANIFEST",
          "error",
          `Host package manifest must not define Galerina package graph key "${key}". Use package-galerina.json and Galerina.lock.json for Galerina packages.`,
          `${policy.manifestPath}.${key}`,
        ),
      );
    }
  }

  for (const field of policy.dependencyFields) {
    const dependencies = input[field];

    if (dependencies === undefined) {
      continue;
    }

    if (!isRecord(dependencies)) {
      diagnostics.push(
        createConfigDiagnostic(
          "SPORE-CONFIG-008",
          "HOST_DEPENDENCIES_NOT_OBJECT",
          "error",
          `Host package manifest field "${field}" must be an object.`,
          `${policy.manifestPath}.${field}`,
        ),
      );
      continue;
    }

    for (const packageName of Object.keys(dependencies)) {
      if (isLoPackageGraphAlias(packageName)) {
        diagnostics.push(
          createConfigDiagnostic(
            "SPORE-CONFIG-009",
            "GALERINA_ALIAS_IN_HOST_DEPENDENCIES",
            "error",
            `Host package dependency "${packageName}" looks like a Galerina package graph alias. Use package-galerina.json for Galerina package resolution.`,
            `${policy.manifestPath}.${field}.${packageName}`,
          ),
        );
      }
    }
  }

  return diagnostics;
}

function validateProductionStrictness(
  project: ProjectConfig,
  environment: EnvironmentConfig,
  policy: ProductionStrictnessPolicy,
): readonly ConfigDiagnostic[] {
  if (environment.mode !== "production") {
    return [];
  }

  const diagnostics: ConfigDiagnostic[] = [];

  if (policy.requireStrictProject && !project.strict) {
    diagnostics.push(
      createConfigDiagnostic(
        "SPORE-CONFIG-010",
        "PRODUCTION_REQUIRES_STRICT_PROJECT",
        "error",
        "Production mode requires strict project configuration.",
        "project.strict",
      ),
    );
  }

  if (!policy.allowDefaultedSecrets) {
    for (const secret of environment.secrets) {
      if (secret.defaultValue !== undefined) {
        diagnostics.push(
          createConfigDiagnostic(
            "SPORE-CONFIG-011",
            "SECRET_DEFAULT_NOT_ALLOWED",
            "error",
            `Secret environment variable "${secret.name}" must not define a default value.`,
            `environment.secrets.${secret.name}`,
          ),
        );
      }
    }
  }

  const overridePaths = new Set(
    project.productionPackageOverrides.map((override) => override.path),
  );

  for (const packageRef of project.packages) {
    const matchedPattern = policy.disabledPackagePatterns.find((pattern) =>
      packageRef.path.includes(pattern),
    );

    if (matchedPattern === undefined) {
      continue;
    }

    if (!overridePaths.has(packageRef.path)) {
      diagnostics.push(
        createConfigDiagnostic(
          "SPORE-CONFIG-012",
          "PRODUCTION_PACKAGE_DISABLED",
          "error",
          `Production mode disables package "${packageRef.path}" by default.`,
          "project.packages",
          "Remove this package from the production profile or add an explicit production.packageOverrides entry with a reason.",
        ),
      );
      continue;
    }

    if (!policy.allowProductionPackageOverrides) {
      diagnostics.push(
        createConfigDiagnostic(
          "SPORE-CONFIG-013",
          "PRODUCTION_PACKAGE_OVERRIDE_NOT_ALLOWED",
          "error",
          `Production package override is not allowed for "${packageRef.path}".`,
          "project.production.packageOverrides",
        ),
      );
    }
  }

  return diagnostics;
}

function readProductionPackageOverrides(
  input: unknown,
  path: string,
  diagnostics: ConfigDiagnostic[],
): readonly ProductionPackageOverride[] {
  if (input === undefined) {
    return [];
  }

  if (!isRecord(input)) {
    diagnostics.push(
      createConfigDiagnostic(
        "SPORE-CONFIG-014",
        "PRODUCTION_POLICY_INVALID",
        "error",
        "Production package policy must be an object.",
        "production",
      ),
    );
    return [];
  }

  const overrides = input["packageOverrides"];
  if (overrides === undefined) {
    return [];
  }

  if (!Array.isArray(overrides)) {
    diagnostics.push(
      createConfigDiagnostic(
        "SPORE-CONFIG-015",
        "PRODUCTION_PACKAGE_OVERRIDES_INVALID",
        "error",
        "Production package overrides must be an array.",
        path,
      ),
    );
    return [];
  }

  const parsedOverrides: ProductionPackageOverride[] = [];

  overrides.forEach((override, index) => {
    const overridePath = `${path}.${index}`;
    if (!isRecord(override)) {
      diagnostics.push(
        createConfigDiagnostic(
          "SPORE-CONFIG-016",
          "PRODUCTION_PACKAGE_OVERRIDE_INVALID",
          "error",
          "Production package override must be an object.",
          overridePath,
        ),
      );
      return;
    }

    const packagePath = readRequiredString(
      override,
      "path",
      diagnostics,
      overridePath,
    );
    const reason = readRequiredString(
      override,
      "reason",
      diagnostics,
      overridePath,
    );
    const expires = readOptionalString(override, "expires");

    if (packagePath !== undefined && reason !== undefined) {
      parsedOverrides.push({
        path: packagePath,
        reason,
        ...(expires === undefined ? {} : { expires }),
      });
    }
  });

  return parsedOverrides;
}

function readEnvironmentVariableReferences(
  input: unknown,
  path: string,
  forceSecret: boolean,
  diagnostics: ConfigDiagnostic[],
): readonly EnvironmentVariableReference[] {
  if (input === undefined) {
    return [];
  }

  if (!Array.isArray(input)) {
    diagnostics.push(
      createConfigDiagnostic(
        "SPORE-CONFIG-017",
        "ENVIRONMENT_REFERENCES_NOT_ARRAY",
        "error",
        "Environment variable references must be an array.",
        path,
      ),
    );
    return [];
  }

  const references: EnvironmentVariableReference[] = [];

  input.forEach((value, index) => {
    const referencePath = `${path}.${index}`;
    const reference = parseEnvironmentVariableReference(
      value,
      referencePath,
      forceSecret,
      diagnostics,
    );
    if (reference !== undefined) {
      references.push(reference);
    }
  });

  return references;
}

function parseEnvironmentVariableReference(
  input: unknown,
  path: string,
  forceSecret: boolean,
  diagnostics: ConfigDiagnostic[],
): EnvironmentVariableReference | undefined {
  if (typeof input === "string") {
    return checkedEnvironmentVariableReference(
      defineEnvironmentVariableReference(input, { secret: forceSecret }),
      path,
      diagnostics,
    );
  }

  if (!isRecord(input)) {
    diagnostics.push(
      createConfigDiagnostic(
        "SPORE-CONFIG-018",
        "ENVIRONMENT_REFERENCE_INVALID",
        "error",
        "Environment variable reference must be a string or object.",
        path,
      ),
    );
    return undefined;
  }

  const name = readRequiredString(input, "name", diagnostics, path);
  if (name === undefined) {
    return undefined;
  }

  const scopeInput = input["scope"];
  const scope =
    typeof scopeInput === "string" &&
    ENVIRONMENT_VARIABLE_SCOPE_SET.has(scopeInput)
      ? (scopeInput as EnvironmentVariableScope)
      : "runtime";

  if (scopeInput !== undefined && scopeInput !== scope) {
    diagnostics.push(
      createConfigDiagnostic(
        "SPORE-CONFIG-019",
        "ENVIRONMENT_REFERENCE_SCOPE_INVALID",
        "error",
        `Unsupported environment variable scope "${String(scopeInput)}".`,
        `${path}.scope`,
        `Use one of: ${ENVIRONMENT_VARIABLE_SCOPES.join(", ")}.`,
      ),
    );
  }

  const defaultValue = readOptionalString(input, "defaultValue");
  const description = readOptionalString(input, "description");

  return checkedEnvironmentVariableReference(
    defineEnvironmentVariableReference(name, {
      required: readOptionalBoolean(input, "required") ?? true,
      secret: forceSecret || (readOptionalBoolean(input, "secret") ?? false),
      scope,
      ...(defaultValue === undefined ? {} : { defaultValue }),
      ...(description === undefined ? {} : { description }),
    }),
    path,
    diagnostics,
  );
}

function checkedEnvironmentVariableReference(
  reference: EnvironmentVariableReference,
  path: string,
  diagnostics: ConfigDiagnostic[],
): EnvironmentVariableReference | undefined {
  if (!ENVIRONMENT_VARIABLE_NAME_PATTERN.test(reference.name)) {
    diagnostics.push(
      createConfigDiagnostic(
        "SPORE-CONFIG-020",
        "ENVIRONMENT_REFERENCE_NAME_INVALID",
        "error",
        `Environment variable "${reference.name}" must be uppercase snake case.`,
        `${path}.name`,
      ),
    );
    return undefined;
  }

  return reference;
}

function readRequiredString(
  input: Readonly<Record<string, unknown>>,
  key: string,
  diagnostics: ConfigDiagnostic[],
  pathPrefix?: string,
): string | undefined {
  const value = input[key];
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }

  diagnostics.push(
    createConfigDiagnostic(
      "SPORE-CONFIG-021",
      "REQUIRED_STRING_MISSING",
      "error",
      `Required string "${key}" is missing.`,
      pathPrefix === undefined ? key : `${pathPrefix}.${key}`,
    ),
  );
  return undefined;
}

function readOptionalString(
  input: Readonly<Record<string, unknown>>,
  key: string,
): string | undefined {
  const value = input[key];
  return typeof value === "string" && value.trim().length > 0
    ? value
    : undefined;
}

function readOptionalBoolean(
  input: Readonly<Record<string, unknown>>,
  key: string,
): boolean | undefined {
  const value = input[key];
  return typeof value === "boolean" ? value : undefined;
}

function readStringArray(
  input: Readonly<Record<string, unknown>>,
  key: string,
  diagnostics: ConfigDiagnostic[],
): readonly string[] {
  const value = input[key];

  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    diagnostics.push(
      createConfigDiagnostic(
        "SPORE-CONFIG-022",
        "STRING_ARRAY_INVALID",
        "error",
        `"${key}" must be an array of strings.`,
        key,
      ),
    );
    return [];
  }

  const strings = value.filter(
    (item): item is string => typeof item === "string",
  );
  if (strings.length !== value.length) {
    diagnostics.push(
      createConfigDiagnostic(
        "SPORE-CONFIG-023",
        "STRING_ARRAY_ITEM_INVALID",
        "error",
        `"${key}" contains a non-string value.`,
        key,
      ),
    );
  }

  return strings;
}

function readPackageReferences(
  input: Readonly<Record<string, unknown>>,
  key: string,
  diagnostics: ConfigDiagnostic[],
): readonly ProjectPackageReference[] {
  const value = input[key];

  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    diagnostics.push(
      createConfigDiagnostic(
        "SPORE-CONFIG-024",
        "PACKAGE_REFERENCES_INVALID",
        "error",
        `"${key}" must be an array of package references.`,
        key,
      ),
    );
    return [];
  }

  const references: ProjectPackageReference[] = [];

  value.forEach((item, index) => {
    if (typeof item === "string") {
      references.push({ path: item });
      return;
    }

    if (isRecord(item)) {
      const path = readRequiredString(
        item,
        "path",
        diagnostics,
        `${key}.${index}`,
      );
      const role = readOptionalString(item, "role");
      if (path !== undefined) {
        references.push({
          path,
          ...(role === undefined ? {} : { role }),
        });
      }
      return;
    }

    diagnostics.push(
      createConfigDiagnostic(
        "SPORE-CONFIG-025",
        "PACKAGE_REFERENCE_INVALID",
        "error",
        "Package reference must be a string or object.",
        `${key}.${index}`,
      ),
    );
  });

  return references;
}

function readStringMap(
  input: Readonly<Record<string, unknown>>,
  key: string,
  diagnostics: ConfigDiagnostic[],
): ConfigPathMap | undefined {
  const value = input[key];

  if (value === undefined) {
    return undefined;
  }

  if (!isRecord(value)) {
    diagnostics.push(
      createConfigDiagnostic(
        "SPORE-CONFIG-026",
        "STRING_MAP_INVALID",
        "error",
        `"${key}" must be an object whose values are strings.`,
        key,
      ),
    );
    return undefined;
  }

  const entries: Record<string, string> = {};

  for (const [entryKey, entryValue] of Object.entries(value)) {
    if (typeof entryValue === "string") {
      entries[entryKey] = entryValue;
      continue;
    }

    diagnostics.push(
      createConfigDiagnostic(
        "SPORE-CONFIG-027",
        "STRING_MAP_VALUE_INVALID",
        "error",
        `"${key}.${entryKey}" must be a string.`,
        `${key}.${entryKey}`,
      ),
    );
  }

  return entries;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isLoPackageGraphAlias(packageName: string): boolean {
  return /^(?:package-Galerina|Galerina\.lock|Galerina-profile|Galerina-package-graph)$/i.test(
    packageName,
  );
}

// =============================================================================
// v0.2 ADDITIONS — SecretConfigSource, EnvironmentPolicy, ConfigValue, Vault
// =============================================================================

// ---------------------------------------------------------------------------
// SecretConfigSource
//
// Discriminated union for where a secret value comes from.
// Used in galerina-core-config (4 values). The security package adds oauth and
// token (6 values total — defined separately in galerina-core-security).
// ---------------------------------------------------------------------------

export type SecretConfigSource =
  | { readonly kind: "env";     readonly variableName: string }
  | { readonly kind: "vault";   readonly storeId: string; readonly keyPath: string }
  | { readonly kind: "kms";     readonly keyId: string;   readonly provider?: string }
  | { readonly kind: "runtime" };

export type SecretConfigSourceKind = SecretConfigSource["kind"];

export const SECRET_CONFIG_SOURCE_KINDS: readonly SecretConfigSourceKind[] = [
  "env",
  "vault",
  "kms",
  "runtime",
];

export function isSecretConfigSourceKind(
  value: unknown,
): value is SecretConfigSourceKind {
  return (
    typeof value === "string" &&
    (SECRET_CONFIG_SOURCE_KINDS as readonly string[]).includes(value)
  );
}

// ---------------------------------------------------------------------------
// SecretCategory — classifies the nature of a secret
// ---------------------------------------------------------------------------

export type SecretCategory =
  | "api-key"
  | "signing-key"
  | "password"
  | "token"
  | "certificate"
  | "database-credential"
  | "webhook-secret"
  | "oauth-secret"
  | "generic";

// ---------------------------------------------------------------------------
// SecretRedactionPolicy — how a secret value should be redacted in output
// ---------------------------------------------------------------------------

export interface SecretRedactionPolicy {
  /**
   * String to substitute when the secret value must appear in output.
   * Default: "[REDACTED]"
   */
  readonly placeholder: string;
  /**
   * Whether to include the secret's name (not value) in reports.
   * Default: true
   */
  readonly includeNameInReports: boolean;
  /**
   * Whether to include the secret source kind (not value/path) in reports.
   * Default: true
   */
  readonly includeSourceKindInReports: boolean;
}

export const DEFAULT_SECRET_REDACTION_POLICY: SecretRedactionPolicy = {
  placeholder: "[REDACTED]",
  includeNameInReports: true,
  includeSourceKindInReports: true,
};

// ---------------------------------------------------------------------------
// EnvironmentPolicy — per-mode access policy for environment sources
// ---------------------------------------------------------------------------

export interface EnvironmentPolicy {
  /**
   * Whether .env files are allowed as a secret or config source.
   * Should be false in staging and production.
   */
  readonly allowDotEnvFiles: boolean;

  /**
   * Whether process.env overrides are permitted.
   * Should be false in all non-development modes.
   */
  readonly allowUnsafeOverrides: boolean;

  /**
   * Raw secret values must NEVER appear in reports.
   * This field is always false — it exists to make the prohibition explicit
   * and type-checkable so callers cannot accidentally set it to true.
   */
  readonly allowSecretValuesInReports: false;
}

/**
 * Default EnvironmentPolicy per environment mode.
 *
 * | Mode        | allowDotEnvFiles | allowUnsafeOverrides |
 * | development | true             | true                 |
 * | test        | true             | false                |
 * | staging     | false            | false                |
 * | production  | false            | false                |
 */
export function defaultEnvironmentPolicy(mode: EnvironmentMode): EnvironmentPolicy {
  switch (mode) {
    case "development":
      return { allowDotEnvFiles: true,  allowUnsafeOverrides: true,  allowSecretValuesInReports: false };
    case "test":
      return { allowDotEnvFiles: true,  allowUnsafeOverrides: false, allowSecretValuesInReports: false };
    case "staging":
      return { allowDotEnvFiles: false, allowUnsafeOverrides: false, allowSecretValuesInReports: false };
    case "production":
      return { allowDotEnvFiles: false, allowUnsafeOverrides: false, allowSecretValuesInReports: false };
  }
}

// ---------------------------------------------------------------------------
// ConfigValue — typed value kinds for the Config Vault
// ---------------------------------------------------------------------------

export type ConfigValue =
  | { readonly kind: "string";   readonly value: string }
  | { readonly kind: "number";   readonly value: number }
  | { readonly kind: "boolean";  readonly value: boolean }
  | { readonly kind: "url";      readonly value: string }
  | { readonly kind: "duration"; readonly value: string }
  | { readonly kind: "bytes";    readonly value: number }
  | { readonly kind: "region";   readonly value: string }
  | { readonly kind: "semver";   readonly value: string }
  | { readonly kind: "currency"; readonly value: string }
  | { readonly kind: "mime-type"; readonly value: string }
  | { readonly kind: "array";    readonly value: readonly ConfigValue[] };

export type ConfigValueKind = ConfigValue["kind"];

// ---------------------------------------------------------------------------
// Config Vault types
//
// The Config Vault holds typed, non-secret, read-only application config.
// Secrets must NEVER appear in the Config Vault (SPORE-VAULT-001).
// ---------------------------------------------------------------------------

export interface ConfigVaultEntry<T> {
  /** Dot-path key. Example: "app.name", "limits.maxUploadMb". */
  readonly key: string;
  readonly value: T;
  readonly type: ConfigValueKind;
}

export interface ConfigVaultSchema {
  readonly [dotPath: string]: ConfigVaultEntry<unknown>;
}

export interface ConfigVaultResult {
  readonly entries: ConfigVaultSchema;
  readonly diagnostics: readonly ConfigDiagnostic[];
}

/**
 * Retrieve a typed vault entry by dot-path key.
 * Returns undefined if the key is absent.
 */
export function getVaultEntry<T>(
  vault: ConfigVaultSchema,
  key: string,
): T | undefined {
  return vault[key]?.value as T | undefined;
}

// ---------------------------------------------------------------------------
// Config Vault diagnostic codes — LN-VAULT series
// ---------------------------------------------------------------------------

/** SPORE-VAULT-001: Secret-like value found in config vault — use secret {} reference instead. */
export const SPORE_VAULT_001 = "SPORE-VAULT-001";
/** SPORE-VAULT-002: Config vault key does not match segment.segment dot-path format. */
export const SPORE_VAULT_002 = "SPORE-VAULT-002";
/** SPORE-VAULT-003: Config vault value cannot be coerced to declared type. */
export const SPORE_VAULT_003 = "SPORE-VAULT-003";
/** SPORE-VAULT-004: Required vault key is not present in vault global block. */
export const SPORE_VAULT_004 = "SPORE-VAULT-004";
/** SPORE-VAULT-005: Attempt to write to config vault at runtime (config vault is read-only). */
export const SPORE_VAULT_005 = "SPORE-VAULT-005";

export function vaultDiagnosticSecretInVault(key: string): ConfigDiagnostic {
  return createConfigDiagnostic(
    SPORE_VAULT_001,
    "SECRET_IN_VAULT",
    "error",
    `Config vault key "${key}" contains a secret-like value. Use a secret {} reference instead.`,
    key,
    `secret ${key.toUpperCase().replace(/\./g, "_")} { from vault "vault://..." }`,
  );
}

export function vaultDiagnosticKeyInvalid(key: string): ConfigDiagnostic {
  return createConfigDiagnostic(
    SPORE_VAULT_002,
    "VAULT_KEY_INVALID",
    "error",
    `Config vault key "${key}" does not match the required segment.segment dot-path format.`,
    key,
    `Keys must match the pattern: segment.segment (e.g. "app.name", "limits.maxUploadMb").`,
  );
}

export function vaultDiagnosticTypeMismatch(
  key: string,
  declared: string,
  actual: string,
): ConfigDiagnostic {
  return createConfigDiagnostic(
    SPORE_VAULT_003,
    "VAULT_TYPE_MISMATCH",
    "error",
    `Config vault key "${key}" declares type "${declared}" but value is "${actual}".`,
    key,
  );
}

export function vaultDiagnosticKeyMissing(key: string): ConfigDiagnostic {
  return createConfigDiagnostic(
    SPORE_VAULT_004,
    "VAULT_KEY_MISSING",
    "error",
    `Required vault key "${key}" is not present in the vault global block.`,
    key,
  );
}

export function vaultDiagnosticMutationDenied(key: string): ConfigDiagnostic {
  return createConfigDiagnostic(
    SPORE_VAULT_005,
    "VAULT_MUTATION_DENIED",
    "error",
    `Config vault key "${key}" cannot be written at runtime. The config vault is read-only after boot.`,
    key,
  );
}

// ---------------------------------------------------------------------------
// EnvironmentConfigReport and SecretReportValue
//
// Safe report types: never expose raw secret values.
// ---------------------------------------------------------------------------

/**
 * A secret value as it appears in reports.
 * The raw value is never included — only the source kind and redacted marker.
 */
export interface SecretReportValue {
  readonly name: string;
  /** Source kind (env, vault, kms, runtime) — never the raw path or value. */
  readonly sourceKind: SecretConfigSourceKind;
  readonly redacted: true;
  readonly category?: SecretCategory;
}

export interface EnvironmentConfigReport {
  readonly schemaVersion: "logicn.config.environment.v1";
  readonly mode: EnvironmentMode;
  readonly policy: EnvironmentPolicy;
  readonly variableCount: number;
  readonly secretCount: number;
  readonly secrets: readonly SecretReportValue[];
  readonly diagnostics: readonly ConfigDiagnostic[];
}

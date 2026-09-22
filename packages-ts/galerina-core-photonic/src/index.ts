export interface Wavelength {
  readonly nanometers: number;
}

export interface Phase {
  readonly degrees: number;
}

export interface Amplitude {
  readonly value: number;
}

export interface OpticalSignal {
  readonly wavelength: Wavelength;
  readonly phase: Phase;
  readonly amplitude: Amplitude;
}

export interface OpticalChannel {
  readonly name: string;
  readonly signal: OpticalSignal;
}

export interface PhotonicMapping {
  readonly logicPackage: "@galerina/core-logic";
  readonly galeriname: string;
  readonly states: readonly {
    readonly state: string;
    readonly signal: OpticalSignal;
  }[];
}

export type PhotonicMode =
  | "planning"
  | "simulation"
  | "wavelength-division-multiplexing"
  | "mach-zehnder"
  | "optical-matrix-multiply";

export const PHOTONIC_DIAGNOSTIC_SCHEMA = "fungi.photonic.diagnostic.v1";

export type PhotonicDiagnosticSeverity = "warning" | "error";

export interface PhotonicDiagnostic {
  readonly schema: typeof PHOTONIC_DIAGNOSTIC_SCHEMA;
  readonly code: string;
  readonly severity: PhotonicDiagnosticSeverity;
  readonly message: string;
  readonly path?: string;
  readonly suggestedFix?: string;
}

export type PhotonicDiagnosticDecode =
  | { readonly ok: true; readonly value: PhotonicDiagnostic }
  | { readonly ok: false; readonly diagnostic: PhotonicDiagnostic };

const PHOTONIC_DIAGNOSTIC_ALLOWED: readonly string[] = [
  "schema",
  "code",
  "severity",
  "message",
  "path",
  "suggestedFix",
];
const PHOTONIC_DIAGNOSTIC_REQUIRED: readonly string[] = [
  "schema",
  "code",
  "severity",
  "message",
];
const PHOTONIC_DIAGNOSTIC_SEVERITIES: readonly PhotonicDiagnosticSeverity[] = [
  "warning",
  "error",
];

export interface PhotonicPlan {
  readonly name: string;
  readonly mode: PhotonicMode;
  readonly channels: readonly OpticalChannel[];
  readonly mappings: readonly PhotonicMapping[];
  readonly report: true;
}

export interface PhotonicReport {
  readonly plan: PhotonicPlan;
  readonly diagnostics: readonly PhotonicDiagnostic[];
  readonly warnings: readonly string[];
  readonly channelCount: number;
}

export function defineOpticalSignal(input: {
  readonly nanometers: number;
  readonly phaseDegrees: number;
  readonly amplitude: number;
}): OpticalSignal {
  const signal = {
    wavelength: { nanometers: input.nanometers },
    phase: { degrees: input.phaseDegrees },
    amplitude: { value: input.amplitude },
  };
  const diagnostics = validateOpticalSignal(signal);

  if (diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
    throw new Error(diagnostics.map((diagnostic) => diagnostic.message).join(" "));
  }

  return signal;
}

export function validateOpticalSignal(
  signal: OpticalSignal,
  path = "signal",
): readonly PhotonicDiagnostic[] {
  const diagnostics: PhotonicDiagnostic[] = [];

  if (
    !Number.isFinite(signal.wavelength.nanometers) ||
    signal.wavelength.nanometers <= 0
  ) {
    diagnostics.push(createPhotonicDiagnostic(
      "Galerina_PHOTONIC_WAVELENGTH_INVALID",
      "error",
      "Wavelength must be a positive finite nanometer value.",
      `${path}.wavelength.nanometers`,
    ));
  }

  if (!Number.isFinite(signal.phase.degrees)) {
    diagnostics.push(createPhotonicDiagnostic(
      "Galerina_PHOTONIC_PHASE_INVALID",
      "error",
      "Phase must be a finite degree value.",
      `${path}.phase.degrees`,
    ));
  }

  if (
    !Number.isFinite(signal.amplitude.value) ||
    Object.is(signal.amplitude.value, -0) ||
    signal.amplitude.value < 0 ||
    signal.amplitude.value > 1
  ) {
    diagnostics.push(createPhotonicDiagnostic(
      "Galerina_PHOTONIC_AMPLITUDE_INVALID",
      "error",
      "Amplitude must be a finite value from 0 to 1, excluding IEEE signed zero.",
      `${path}.amplitude.value`,
    ));
  }

  return freezePhotonicDiagnostics(diagnostics);
}

export function validatePhotonicMapping(
  mapping: PhotonicMapping,
  path = "mapping",
): readonly PhotonicDiagnostic[] {
  const diagnostics: PhotonicDiagnostic[] = [];

  if (mapping.galeriname.trim().length === 0) {
    diagnostics.push(createPhotonicDiagnostic(
      "Galerina_PHOTONIC_LOGIC_NAME_REQUIRED",
      "error",
      "Photonic mapping requires a logic name.",
      `${path}.galeriname`,
    ));
  }

  if (mapping.states.length === 0) {
    diagnostics.push(createPhotonicDiagnostic(
      "Galerina_PHOTONIC_MAPPING_STATES_REQUIRED",
      "error",
      "Photonic mapping requires at least one state.",
      `${path}.states`,
    ));
  }

  const seenStates = new Set<string>();

  mapping.states.forEach((state, index) => {
    if (state.state.trim().length === 0) {
      diagnostics.push(createPhotonicDiagnostic(
        "Galerina_PHOTONIC_MAPPING_STATE_REQUIRED",
        "error",
        "Photonic mapping state names must be non-empty.",
        `${path}.states.${index}.state`,
      ));
    }

    if (seenStates.has(state.state)) {
      diagnostics.push(createPhotonicDiagnostic(
        "Galerina_PHOTONIC_MAPPING_STATE_DUPLICATE",
        "error",
        "Photonic mapping contains a duplicate logic state.",
        `${path}.states.${index}.state`,
      ));
    }

    seenStates.add(state.state);
    diagnostics.push(
      ...validateOpticalSignal(state.signal, `${path}.states.${index}.signal`),
    );
  });

  return freezePhotonicDiagnostics(diagnostics);
}

export function createPhotonicReport(plan: PhotonicPlan): PhotonicReport {
  const diagnostics = validatePhotonicPlan(plan);

  return {
    plan,
    diagnostics,
    warnings: diagnostics
      .filter((diagnostic) => diagnostic.severity === "warning")
      .map((diagnostic) => diagnostic.message),
    channelCount: plan.channels.length,
  };
}

export function validatePhotonicPlan(
  plan: PhotonicPlan,
): readonly PhotonicDiagnostic[] {
  const diagnostics: PhotonicDiagnostic[] = [];

  if (plan.name.trim().length === 0) {
    diagnostics.push(createPhotonicDiagnostic(
      "Galerina_PHOTONIC_PLAN_NAME_REQUIRED",
      "error",
      "Photonic plan requires a name.",
      "plan.name",
    ));
  }

  plan.channels.forEach((channel, index) => {
    if (channel.name.trim().length === 0) {
      diagnostics.push(createPhotonicDiagnostic(
        "Galerina_PHOTONIC_CHANNEL_NAME_REQUIRED",
        "error",
        "Optical channels require names.",
        `plan.channels.${index}.name`,
      ));
    }

    diagnostics.push(
      ...validateOpticalSignal(channel.signal, `plan.channels.${index}.signal`),
    );
  });

  plan.mappings.forEach((mapping, index) => {
    diagnostics.push(
      ...validatePhotonicMapping(mapping, `plan.mappings.${index}`),
    );
  });

  return freezePhotonicDiagnostics(diagnostics);
}

function freezePhotonicDiagnostics(
  diagnostics: readonly PhotonicDiagnostic[],
): readonly PhotonicDiagnostic[] {
  return Object.freeze([...diagnostics]);
}

function createPhotonicDiagnostic(
  code: string,
  severity: PhotonicDiagnosticSeverity,
  message: string,
  path?: string,
  suggestedFix?: string,
): PhotonicDiagnostic {
  return Object.freeze({
    schema: PHOTONIC_DIAGNOSTIC_SCHEMA,
    code,
    severity,
    message,
    ...(path === undefined ? {} : { path }),
    ...(suggestedFix === undefined ? {} : { suggestedFix }),
  });
}

function capturePhotonicDiagnosticRecord(value: unknown): Record<string, unknown> | undefined {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value) ||
        Object.getPrototypeOf(value) !== Object.prototype) {
      return undefined;
    }
    const captured: Record<string, unknown> = {};
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string" || !PHOTONIC_DIAGNOSTIC_ALLOWED.includes(key)) {
        return undefined;
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable) {
        return undefined;
      }
      captured[key] = descriptor.value;
    }
    if (PHOTONIC_DIAGNOSTIC_REQUIRED.some((key) => !Object.prototype.hasOwnProperty.call(captured, key))) {
      return undefined;
    }
    return captured;
  } catch {
    return undefined;
  }
}

export function decodePhotonicDiagnostic(
  value: unknown,
  path = "diagnostic",
): PhotonicDiagnosticDecode {
  const invalid = (): PhotonicDiagnosticDecode => ({
    ok: false,
    diagnostic: createPhotonicDiagnostic(
      "Galerina_PHOTONIC_DIAGNOSTIC_INVALID",
      "error",
      "A photonic diagnostic must be an exact fungi.photonic.diagnostic.v1 record.",
      path,
    ),
  });
  const record = capturePhotonicDiagnosticRecord(value);
  if (record === undefined) return invalid();

  const { schema, code, severity, message, path: locator, suggestedFix } = record;
  if (schema !== PHOTONIC_DIAGNOSTIC_SCHEMA ||
      typeof code !== "string" || code.trim().length === 0 ||
      typeof severity !== "string" ||
      !PHOTONIC_DIAGNOSTIC_SEVERITIES.includes(severity as PhotonicDiagnosticSeverity) ||
      typeof message !== "string" || message.trim().length === 0 ||
      (locator !== undefined && (typeof locator !== "string" || locator.trim().length === 0)) ||
      (suggestedFix !== undefined && (typeof suggestedFix !== "string" || suggestedFix.trim().length === 0))) {
    return invalid();
  }

  return {
    ok: true,
    value: createPhotonicDiagnostic(
      code,
      severity as PhotonicDiagnosticSeverity,
      message,
      locator === undefined ? undefined : locator,
      suggestedFix === undefined ? undefined : suggestedFix,
    ),
  };
}

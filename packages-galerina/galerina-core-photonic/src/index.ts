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
  readonly logicName: string;
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

export type PhotonicDiagnosticSeverity = "warning" | "error";

export interface PhotonicDiagnostic {
  readonly code: string;
  readonly severity: PhotonicDiagnosticSeverity;
  readonly message: string;
  readonly path?: string;
}

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
    signal.amplitude.value < 0 ||
    signal.amplitude.value > 1
  ) {
    diagnostics.push(createPhotonicDiagnostic(
      "Galerina_PHOTONIC_AMPLITUDE_INVALID",
      "error",
      "Amplitude must be a finite value from 0 to 1.",
      `${path}.amplitude.value`,
    ));
  }

  return diagnostics;
}

export function validatePhotonicMapping(
  mapping: PhotonicMapping,
  path = "mapping",
): readonly PhotonicDiagnostic[] {
  const diagnostics: PhotonicDiagnostic[] = [];

  if (mapping.logicName.trim().length === 0) {
    diagnostics.push(createPhotonicDiagnostic(
      "Galerina_PHOTONIC_LOGIC_NAME_REQUIRED",
      "error",
      "Photonic mapping requires a logic name.",
      `${path}.logicName`,
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

  return diagnostics;
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

  return diagnostics;
}

function createPhotonicDiagnostic(
  code: string,
  severity: PhotonicDiagnosticSeverity,
  message: string,
  path?: string,
): PhotonicDiagnostic {
  return {
    code,
    severity,
    message,
    ...(path === undefined ? {} : { path }),
  };
}

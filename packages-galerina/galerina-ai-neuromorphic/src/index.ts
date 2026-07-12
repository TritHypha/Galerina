export interface Spike {
  readonly neuron: string;
  readonly timeMs: number;
  readonly amplitude?: number;
}

export interface SpikeTrain {
  readonly source: string;
  readonly spikes: readonly Spike[];
}

export interface EventSignal<TPayload = unknown> {
  readonly channel: string;
  readonly timeMs: number;
  readonly payload: TPayload;
}

export interface SpikingModel {
  readonly name: string;
  readonly inputs: readonly string[];
  readonly outputs: readonly string[];
  readonly neurons: number;
  readonly synapses: number;
}

export interface NeuromorphicPlan {
  readonly flow: string;
  readonly model: string;
  readonly targetPreference: readonly string[];
  readonly fallback: "cpu" | "gpu" | "reject";
  readonly maxEvents: number;
  readonly timeoutMs: number;
}

export interface NeuromorphicReport {
  readonly plans: readonly NeuromorphicPlan[];
  readonly warnings: readonly string[];
}

// ── runtime contract helpers ──────────────────────────────────────────────────
// The interfaces above are the type contract; the helpers below are the runtime
// enforcement of that contract, mirroring the sibling AI packages
// (galerina-ai, galerina-ai-neural, galerina-ai-lowbit): fail-closed validators
// that return typed diagnostics. Event-driven neuromorphic work is unbounded by
// nature, so an unbounded plan (no event ceiling, no timeout) is treated as
// unsafe and rejected, never silently admitted.

export type NeuromorphicDiagnosticSeverity = "warning" | "error";

export interface NeuromorphicDiagnostic {
  readonly code: string;
  readonly severity: NeuromorphicDiagnosticSeverity;
  readonly message: string;
  readonly path?: string;
}

const NEUROMORPHIC_FALLBACKS: readonly NeuromorphicPlan["fallback"][] = ["cpu", "gpu", "reject"];

function createNeuromorphicDiagnostic(
  code: string,
  severity: NeuromorphicDiagnosticSeverity,
  message: string,
  path?: string,
): NeuromorphicDiagnostic {
  return {
    code,
    severity,
    message,
    ...(path === undefined ? {} : { path }),
  };
}

// A spike train must name its source and carry only physically-meaningful spikes:
// a named neuron, a finite non-negative time, and — when present — a positive
// amplitude. Spikes are expected in non-decreasing time order; an out-of-order
// train is a warning, not a hard error, because a caller may sort downstream.
export function validateSpikeTrain(
  train: SpikeTrain,
  path = "spikeTrain",
): readonly NeuromorphicDiagnostic[] {
  const diagnostics: NeuromorphicDiagnostic[] = [];

  if (train.source.trim().length === 0) {
    diagnostics.push(createNeuromorphicDiagnostic(
      "Galerina_NEUROMORPHIC_SPIKE_SOURCE_REQUIRED",
      "error",
      "Spike train requires a source.",
      `${path}.source`,
    ));
  }

  let previousTimeMs = -Infinity;
  let reportedOrder = false;
  train.spikes.forEach((spike, index) => {
    const spikePath = `${path}.spikes.${index}`;

    if (spike.neuron.trim().length === 0) {
      diagnostics.push(createNeuromorphicDiagnostic(
        "Galerina_NEUROMORPHIC_SPIKE_NEURON_REQUIRED",
        "error",
        "Spike requires a neuron identifier.",
        `${spikePath}.neuron`,
      ));
    }

    if (!Number.isFinite(spike.timeMs) || spike.timeMs < 0) {
      diagnostics.push(createNeuromorphicDiagnostic(
        "Galerina_NEUROMORPHIC_SPIKE_TIME_INVALID",
        "error",
        "Spike time must be a finite, non-negative number of milliseconds.",
        `${spikePath}.timeMs`,
      ));
    } else {
      if (spike.timeMs < previousTimeMs && !reportedOrder) {
        diagnostics.push(createNeuromorphicDiagnostic(
          "Galerina_NEUROMORPHIC_SPIKE_ORDER_WARNING",
          "warning",
          "Spike train is not in non-decreasing time order.",
          `${spikePath}.timeMs`,
        ));
        reportedOrder = true;
      }
      previousTimeMs = spike.timeMs;
    }

    if (spike.amplitude !== undefined && (!Number.isFinite(spike.amplitude) || spike.amplitude <= 0)) {
      diagnostics.push(createNeuromorphicDiagnostic(
        "Galerina_NEUROMORPHIC_SPIKE_AMPLITUDE_INVALID",
        "error",
        "Spike amplitude, when present, must be a finite positive number.",
        `${spikePath}.amplitude`,
      ));
    }
  });

  return diagnostics;
}

// A spiking model must be named, have at least one input and one output channel,
// a positive integer neuron count, and a non-negative integer synapse count. A
// model with neurons but zero synapses cannot propagate any signal — flagged as a
// warning so the caller can confirm the topology is intentional.
export function validateSpikingModel(
  model: SpikingModel,
  path = "model",
): readonly NeuromorphicDiagnostic[] {
  const diagnostics: NeuromorphicDiagnostic[] = [];

  if (model.name.trim().length === 0) {
    diagnostics.push(createNeuromorphicDiagnostic(
      "Galerina_NEUROMORPHIC_MODEL_NAME_REQUIRED",
      "error",
      "Spiking model requires a name.",
      `${path}.name`,
    ));
  }

  if (model.inputs.length === 0) {
    diagnostics.push(createNeuromorphicDiagnostic(
      "Galerina_NEUROMORPHIC_MODEL_INPUTS_REQUIRED",
      "error",
      "Spiking model requires at least one input channel.",
      `${path}.inputs`,
    ));
  }

  if (model.outputs.length === 0) {
    diagnostics.push(createNeuromorphicDiagnostic(
      "Galerina_NEUROMORPHIC_MODEL_OUTPUTS_REQUIRED",
      "error",
      "Spiking model requires at least one output channel.",
      `${path}.outputs`,
    ));
  }

  if (!Number.isSafeInteger(model.neurons) || model.neurons <= 0) {
    diagnostics.push(createNeuromorphicDiagnostic(
      "Galerina_NEUROMORPHIC_MODEL_NEURONS_INVALID",
      "error",
      "Spiking model neuron count must be a positive safe integer.",
      `${path}.neurons`,
    ));
  }

  if (!Number.isSafeInteger(model.synapses) || model.synapses < 0) {
    diagnostics.push(createNeuromorphicDiagnostic(
      "Galerina_NEUROMORPHIC_MODEL_SYNAPSES_INVALID",
      "error",
      "Spiking model synapse count must be a non-negative safe integer.",
      `${path}.synapses`,
    ));
  } else if (model.synapses === 0) {
    diagnostics.push(createNeuromorphicDiagnostic(
      "Galerina_NEUROMORPHIC_MODEL_NO_SYNAPSES",
      "warning",
      "Spiking model declares no synapses; neurons cannot propagate signal.",
      `${path}.synapses`,
    ));
  }

  return diagnostics;
}

// A neuromorphic plan must name its flow + model, declare a bounded event ceiling
// and timeout (unbounded event streams are unsafe), and use a known fallback. A
// plan with no target preference AND a "reject" fallback can never execute — that
// is a hard error, not a warning.
export function validateNeuromorphicPlan(
  plan: NeuromorphicPlan,
  path = "plan",
): readonly NeuromorphicDiagnostic[] {
  const diagnostics: NeuromorphicDiagnostic[] = [];

  if (plan.flow.trim().length === 0) {
    diagnostics.push(createNeuromorphicDiagnostic(
      "Galerina_NEUROMORPHIC_PLAN_FLOW_REQUIRED",
      "error",
      "Neuromorphic plan requires a flow.",
      `${path}.flow`,
    ));
  }

  if (plan.model.trim().length === 0) {
    diagnostics.push(createNeuromorphicDiagnostic(
      "Galerina_NEUROMORPHIC_PLAN_MODEL_REQUIRED",
      "error",
      "Neuromorphic plan requires a model.",
      `${path}.model`,
    ));
  }

  if (!Number.isSafeInteger(plan.maxEvents) || plan.maxEvents <= 0) {
    diagnostics.push(createNeuromorphicDiagnostic(
      "Galerina_NEUROMORPHIC_PLAN_MAX_EVENTS_REQUIRED",
      "error",
      "Neuromorphic plan requires a positive event ceiling (unbounded streams are unsafe).",
      `${path}.maxEvents`,
    ));
  }

  if (!(plan.timeoutMs > 0)) {
    diagnostics.push(createNeuromorphicDiagnostic(
      "Galerina_NEUROMORPHIC_PLAN_TIMEOUT_REQUIRED",
      "error",
      "Neuromorphic plan requires a positive timeout.",
      `${path}.timeoutMs`,
    ));
  }

  if (!NEUROMORPHIC_FALLBACKS.includes(plan.fallback)) {
    diagnostics.push(createNeuromorphicDiagnostic(
      "Galerina_NEUROMORPHIC_PLAN_FALLBACK_INVALID",
      "error",
      `Neuromorphic plan fallback must be one of: ${NEUROMORPHIC_FALLBACKS.join(", ")}.`,
      `${path}.fallback`,
    ));
  }

  if (plan.targetPreference.length === 0) {
    if (plan.fallback === "reject") {
      diagnostics.push(createNeuromorphicDiagnostic(
        "Galerina_NEUROMORPHIC_PLAN_UNSATISFIABLE",
        "error",
        "Neuromorphic plan has no target preference and rejects fallback; it can never execute.",
        `${path}.targetPreference`,
      ));
    } else {
      diagnostics.push(createNeuromorphicDiagnostic(
        "Galerina_NEUROMORPHIC_PLAN_NO_TARGET_PREFERENCE",
        "warning",
        `Neuromorphic plan has no target preference; it will always use the "${plan.fallback}" fallback.`,
        `${path}.targetPreference`,
      ));
    }
  }

  return diagnostics;
}

// Build a neuromorphic report over a set of plans, surfacing every plan's
// diagnostics and lifting warnings to the report level.
export function createNeuromorphicReport(input: {
  readonly plans: readonly NeuromorphicPlan[];
}): NeuromorphicReport {
  const warnings: string[] = [];

  input.plans.forEach((plan, index) => {
    for (const diagnostic of validateNeuromorphicPlan(plan, `plans.${index}`)) {
      if (diagnostic.severity === "warning") warnings.push(diagnostic.message);
    }
  });

  return {
    plans: input.plans,
    warnings,
  };
}

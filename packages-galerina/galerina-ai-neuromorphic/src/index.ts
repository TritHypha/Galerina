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

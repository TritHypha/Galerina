export type NativeAbi = "c" | "wasm" | "system" | "plugin";

export interface NativeTarget {
  readonly triple: string;
  readonly os: string;
  readonly architecture: string;
  readonly abi?: NativeAbi;
  readonly executionMode: "future-native-executable" | "native-abi-boundary";
}

export interface NativeArtifact {
  readonly path: string;
  readonly target: NativeTarget;
  readonly format: "executable" | "library" | "object";
}

export interface NativeTargetReport {
  readonly artifacts: readonly NativeArtifact[];
  readonly machineProfileBridge: {
    readonly enabled: boolean;
    readonly capabilityProfilePath?: string;
    readonly selectedAbi?: NativeAbi;
  };
  readonly warnings: readonly string[];
}

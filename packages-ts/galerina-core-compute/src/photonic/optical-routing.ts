// Optical routing vocabulary (TODO pass, Grok 2026-10-05).
// Zero-trust defaults, owner may revisit. Closed planning names only — no routing
// is performed and no topology is admitted for execution.

/** Closed optical routing mode names for planning reports. */
export const OPTICAL_ROUTING_MODES = Object.freeze([
  "direct",
  "wavelength_multiplex",
  "space_division",
  "hybrid_electrical",
  "unspecified",
] as const);

export type OpticalRoutingMode = (typeof OPTICAL_ROUTING_MODES)[number];

/** V1 freeze: no routing mode is admitted for execution. */
export function isOpticalRoutingModeAdmitted(_mode: OpticalRoutingMode): boolean {
  return false;
}

export function isOpticalRoutingMode(value: unknown): value is OpticalRoutingMode {
  return typeof value === "string" && (OPTICAL_ROUTING_MODES as readonly string[]).includes(value);
}
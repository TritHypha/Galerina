// =============================================================================
// BoolBoundaryContext — caller-provided context for boundary validation
// =============================================================================

export interface BoolBoundaryContext {
  /**
   * Name of the boundary point being enforced.
   * Example: "payment.authorize", "orders.create.capability".
   */
  readonly boundaryName: string;
  /**
   * Actor requesting the boundary evaluation.
   */
  readonly actor?: string;
  /**
   * Whether this boundary is in a production environment.
   * In production, review and unknown always fail closed.
   */
  readonly production?: boolean;
  /**
   * Optional source identifier for audit purposes.
   */
  readonly source?: string;
}
